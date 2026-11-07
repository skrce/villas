import {
  GetOperationKindEnum,
  ReservationApi,
  MaintenanceApi,
  ApartmentApi,
  QuotesApi,
  type PaymentsApi,
  type OperationsApi,
  ResponseError,
  type CreateReservationRequest,
  type OperationResult,
  type MaintenanceBlock,
} from './generated';
import { validDate, validVersion } from '../shared/format';
import { UUID_SHAPE } from '../shared/ids';
import { buildLedgerActions } from './ledgerActions';
import { buildReadinessActions } from './readinessActions';

export class OperationRecoveryError extends Error {}
export class MaintenanceRecoveryError extends OperationRecoveryError {}
class PendingIntentMissingError extends OperationRecoveryError {}
type CreateInput = Omit<CreateReservationRequest, 'idempotencyKey'> & {quoteId?: string};
const createIdentity = (input: CreateInput, priced: boolean) => ({customerId: input.customerId, roomId: input.roomId,
  startDate: input.startDate, endDate: input.endDate, guestCount: input.guestCount ?? 1, ...(priced ? {priceContract: 'EUR-v1'} : {})});
const recoverCreated = (input: CreateInput, result: OperationResult, intent: Intent) => {
  const booking = result.reservation;
  if (!intent.quoteId || !booking || booking.id !== result.resourceId || booking.customerId !== input.customerId || booking.roomId !== input.roomId
    || booking.startDate !== input.startDate || booking.endDate !== input.endDate || booking.guestCount !== (input.guestCount ?? 1)
    || booking.acceptedQuoteId !== intent.quoteId || booking.version !== 0 || booking.status !== 'ACTIVE')
    throw new Error('The priced reservation result could not be confirmed.');
  return result.resourceId;
};

const calendarDay = (value?: Date) => value instanceof Date && !Number.isNaN(value.getTime())
  && value.toISOString().endsWith('T00:00:00.000Z') && validDate(value.toISOString().slice(0, 10))
  ? value.toISOString().slice(0, 10) : undefined;
const validMaintenance = (block?: MaintenanceBlock | null): block is Required<MaintenanceBlock> & {id: number} => !!block
  && Number.isSafeInteger(block.id) && block.id! > 0 && block.id! <= 2147483647
  && Number.isSafeInteger(block.roomId) && block.roomId! > 0 && block.roomId! <= 2147483647
  && validVersion(block.version) && ['ACTIVE', 'CANCELLED'].includes(block.status!)
  && typeof block.reason === 'string' && !!block.reason.trim() && block.reason.length <= 200
  && !!calendarDay(block.startDate) && !!calendarDay(block.endDate) && block.endDate! > block.startDate!;

const STORAGE_KEY = 'villarosa.pendingOperations.v2';
const OWN_STORAGE_KEY = 'villarosa.ownPendingOperations.v2';
const DEFINITIVE_ERRORS = new Set([
  'INVALID_REQUEST', 'INVALID_OPERATION_KEY', 'INVALID_ID', 'INVALID_VERSION',
  'INVALID_GUEST_COUNT', 'CAPACITY_EXCEEDED', 'NOT_FOUND', 'STALE_VERSION',
  'RESERVATION_CHANGED', 'RESERVATION_CANCELLED', 'ROOM_INACTIVE',
  'INVENTORY_CONFLICT', 'DATA_CONFLICT', 'GUEST_ARCHIVED', 'INVALID_REASON', 'INVALID_QUOTE', 'HTTP_400', 'QUOTE_CHANGED', 'QUOTE_MISMATCH', 'QUOTE_ALREADY_ACCEPTED', 'QUOTE_REQUIRED', 'PRICE_REVIEW_REQUIRED',
  'INVALID_AMOUNT', 'INVALID_METHOD', 'INVALID_ENTRY', 'INVALID_DATE', 'FUTURE_PAYMENT',
  'INVALID_REFERENCE', 'UNSUPPORTED_CURRENCY', 'AMOUNT_TOO_LARGE', 'REFUND_EXCEEDS_RECEIVED',
  'PAYMENT_UNAVAILABLE', 'PAYMENT_HAS_REFUNDS', 'ENTRY_ALREADY_REVERSED', 'AGREED_PRICE_REQUIRED',
  'VERSION_LIMIT', 'REASON_REQUIRED',
  'ROOM_OCCUPIED', 'INVALID_READINESS_TRANSITION',
]);
type Intent = { key: string; expectedVersion?: number; quoteId?: string };
export type OperationRunner = <T>(kind: GetOperationKindEnum, input: unknown,
  prepare: () => Promise<number | undefined>, send: (intent: Intent) => Promise<unknown>,
  recovered: (result: OperationResult, intent: Intent) => T | Promise<T>, recoveryOnly?: boolean, quoteId?: string) => Promise<T>;
type Intents = Record<string, Intent>;
const pending = new Map<string, Promise<unknown>>();

const stored = <T>(action: () => T): Promise<T> => {
  if (!navigator.locks) return Promise.reject(new Error('Safe booking changes require HTTPS or localhost in a browser with Web Locks support.'));
  return navigator.locks.request(STORAGE_KEY, () => action());
};

const read = (storage: Storage = localStorage, key = STORAGE_KEY): Intents => {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    for (const item of Object.values(parsed)) {
      if (!item || typeof item !== 'object' || !('key' in item) || typeof item.key !== 'string'
        || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(item.key)) throw new Error();
      if ('expectedVersion' in item && (typeof item.expectedVersion !== 'number'
        || !Number.isSafeInteger(item.expectedVersion) || item.expectedVersion < 0)) throw new Error();
      if ('quoteId' in item && (typeof item.quoteId !== 'string' || !UUID_SHAPE.test(item.quoteId))) throw new Error();
    }
    return parsed as Intents;
  } catch {
    throw new Error('Pending changes could not be read. Check the records before retrying.');
  }
};

export const buildBookingActions = (api: ReservationApi, scope: string, generation = scope, maintenance?: MaintenanceApi, apartments?: ApartmentApi, quotes?: QuotesApi,
  extras: {payments?: PaymentsApi; operations?: OperationsApi; actorId?: string} = {}) => {
  const ownStorage = sessionStorage;
  const remember = (identity: string, intent: Intent) => ownStorage.setItem(OWN_STORAGE_KEY, JSON.stringify({ ...read(ownStorage, OWN_STORAGE_KEY), [identity]: intent }));
  const execute = async <T>(
    kind: GetOperationKindEnum,
    identity: string,
    prepare: () => Promise<number | undefined>,
    send: (intent: Intent) => Promise<unknown>,
    recovered: (result: OperationResult, intent: Intent) => T | Promise<T>,
    recoveryOnly: boolean,
    quoteId?: string,
  ): Promise<T> => {
    let intent = await stored(() => {
      const saved = read(ownStorage, OWN_STORAGE_KEY)[identity] ?? read()[identity];
      if (saved) remember(identity, saved);
      return saved;
    });
    const financial = [GetOperationKindEnum.RecordPayment, GetOperationKindEnum.RecordRefund, GetOperationKindEnum.ReverseEntry].includes(kind as 'RECORD_PAYMENT' | 'RECORD_REFUND' | 'REVERSE_ENTRY');
    const readiness = kind === GetOperationKindEnum.SetReadiness;
    let existing = !!intent;
    if (!intent) {
      if (recoveryOnly) throw new PendingIntentMissingError(kind === GetOperationKindEnum.Block ? 'No pending maintenance request matches these details in this browser. Re-enter the original dates and reason to check it.' : readiness ? 'No previous readiness save matches these details in this browser. Enter the original state and reason to check it.' : financial ? 'No previous financial save matches these details in this browser. Re-enter the original record details to check it.' : 'No previous booking save matches these details in this browser. Review a price before confirming a new request.');
      const expectedVersion = await prepare();
      if (expectedVersion !== undefined && !validVersion(expectedVersion)) throw new Error('The reviewed reservation version is invalid. Reload before saving.');
      if (quoteId !== undefined && !UUID_SHAPE.test(quoteId)) throw new OperationRecoveryError('Review a valid saved quote before confirming.');
      const prepared: Intent = { key: crypto.randomUUID(), expectedVersion, ...(quoteId ? {quoteId: quoteId.toLowerCase()} : {}) };
      intent = await stored(() => {
        const current = read();
        if (current[identity]) {
          existing = true;
          remember(identity, current[identity]);
          return current[identity];
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, [identity]: prepared }));
        remember(identity, prepared);
        return prepared;
      });
    }
    const clear = () => stored(() => {
      const own = read(ownStorage, OWN_STORAGE_KEY);
      if (own[identity]?.key === intent.key) {
        delete own[identity]; ownStorage.setItem(OWN_STORAGE_KEY, JSON.stringify(own));
      }
      const current = read();
      if (current[identity]?.key === intent.key) {
        delete current[identity];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      }
    });
    const confirm = async () => {
      const result = await api.getOperation({ operationKey: intent.key, kind });
      if (result?.key !== intent.key || result.kind !== kind || !Number.isSafeInteger(result.resourceId) || result.resourceId <= 0 || result.resourceId > 2147483647) {
        throw new Error('The saved result could not be confirmed. Check the records before retrying.');
      }
      const value = await recovered(result, intent);
      await clear();
      return value;
    };
    if (existing) {
      try {
        return await confirm();
      } catch (error) {
        if (!(error instanceof ResponseError) || error.response.status !== 404) throw error;
        const body = await error.response.clone().json().catch(() => null);
        if (body?.code !== 'OPERATION_NOT_COMMITTED') throw error;
        if (recoveryOnly) throw new OperationRecoveryError(kind === GetOperationKindEnum.Block ? 'No committed result was found for this request. Restore the room before saving new maintenance.' : readiness ? 'No committed readiness result was found yet. Keep the original state and reason and check again before recording a new change.' : financial ? 'No committed financial result was found yet. Keep the original details and check again before recording anything new.' : 'No confirmed booking result was found yet. Keep the original details and check again, or review the saved reservations.');
      }
    }
    try {
      await send(intent);
    } catch (error) {
      if (error instanceof ResponseError && [400, 404, 409].includes(error.response.status)) {
        const body = await error.response.clone().json().catch(() => null);
        if (DEFINITIVE_ERRORS.has(body?.code)) await clear();
      }
      throw error;
    }
    return confirm();
  };

  const run = async <T>(
    kind: GetOperationKindEnum,
    input: unknown,
    prepare: () => Promise<number | undefined>,
    send: (intent: Intent) => Promise<unknown>,
    recovered: (result: OperationResult, intent: Intent) => T | Promise<T>,
    recoveryOnly = false,
    quoteId?: string,
  ): Promise<T> => {
    const fingerprint = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([scope, kind, input])));
    const identity = Array.from(new Uint8Array(fingerprint), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const inFlightIdentity = JSON.stringify([generation, identity, recoveryOnly]);
    const existing = pending.get(inFlightIdentity);
    if (existing) return existing as Promise<T>;
    const request = execute(kind, identity, prepare, send, recovered, recoveryOnly, quoteId).finally(() => pending.delete(inFlightIdentity));
    pending.set(inFlightIdentity, request);
    return request;
  };

  const version = async (reservationId: number) => {
    const booking = await api.getReservation({ reservationId });
    if (typeof booking.version !== 'number' || !Number.isSafeInteger(booking.version) || booking.version < 0) {
      throw new Error('The reservation version could not be loaded. Refresh the records before editing.');
    }
    return booking.version;
  };

  const edited = async (id: number, result: OperationResult, intent: Intent, target: {roomId?: number; startDate?: string; endDate?: string; guestCount?: number}) => {
    if (result.resourceId !== id) throw new Error('The saved reservation change could not be confirmed.');
    if (!intent.quoteId) return;
    if (!quotes) throw new OperationRecoveryError('Saved quotes are unavailable. Reload the workspace.');
    const {quoteSchema} = await import('../shared/pricing');
    const offer = quoteSchema.parse(await quotes.getBookingQuote({quoteId: intent.quoteId}));
    const booking = result.reservation;
    if (offer.id !== intent.quoteId || !booking || booking.id !== id || booking.acceptedQuoteId !== intent.quoteId
      || booking.status !== 'ACTIVE' || booking.version !== intent.expectedVersion! + 1
      || !Number.isSafeInteger(booking.customerId) || booking.customerId! <= 0 || booking.customerId! > 2147483647
      || booking.roomId !== offer.roomId || booking.startDate !== offer.startDate || booking.endDate !== offer.endDate || booking.guestCount !== offer.guestCount
      || (target.roomId !== undefined && offer.roomId !== target.roomId)
      || (target.startDate !== undefined && (offer.startDate !== target.startDate || offer.endDate !== target.endDate || offer.guestCount !== target.guestCount)))
      throw new Error('The accepted price and saved reservation change could not be confirmed.');
  };
  const moveIdentity = (id: number, room: number, priced: boolean) => ({reservationId: id, newRoomId: room, ...(priced ? {priceContract: 'EUR-v1'} : {})});
  const changeIdentity = (id: number, start: string, end: string, count: number, priced: boolean) => ({reservationId: id, startDate: start, endDate: end, guestCount: count, ...(priced ? {priceContract: 'EUR-v1'} : {})});
  const recoverEdit = async (kind: GetOperationKindEnum, input: (priced: boolean) => unknown, id: number, target: {roomId?: number; startDate?: string; endDate?: string; guestCount?: number}) => {
    try { return await run(kind, input(true), async () => undefined, async () => undefined, (result, intent) => edited(id,result,intent,target), true); }
    catch (error) {
      if (!(error instanceof PendingIntentMissingError)) throw error;
      return run(kind,input(false),async () => undefined,async () => undefined,(result,intent) => edited(id,result,intent,target),true);
    }
  };

  return {
    ...buildLedgerActions(run, extras.payments, extras.actorId),
    ...buildReadinessActions(run, extras.operations, extras.actorId),
    block: (roomId: number, startDate: string, endDate: string, reason: string, options: {recoveryOnly?: boolean} = {}) => run(
      GetOperationKindEnum.Block, {roomId, startDate, endDate, reason: reason.trim()}, async () => undefined,
      (intent) => {
        if (!apartments) throw new Error('Room maintenance is unavailable. Reload the workspace.');
        return apartments.blockApartment({apartmentId: roomId, idempotencyKey: intent.key, roomBlockRequest: {startDate, endDate, reason: reason.trim()}});
      },
      (result) => {
        const block = result.maintenance;
        if (!validMaintenance(block) || block.id !== result.resourceId || block.version !== 0 || block.status !== 'ACTIVE'
          || block.roomId !== roomId || calendarDay(block.startDate) !== startDate || calendarDay(block.endDate) !== endDate || block.reason !== reason.trim()) throw new Error('The maintenance result could not be confirmed.');
        return result.resourceId;
      },
      options.recoveryOnly,
    ),
    unblock: (blockId: number, expectedVersion: number) => run(
      GetOperationKindEnum.Unblock, {blockId}, async () => expectedVersion,
      (intent) => {
        if (!maintenance) throw new Error('Room maintenance is unavailable. Reload the workspace.');
        return maintenance.cancelMaintenanceBlock({blockId, expectedVersion: intent.expectedVersion!, idempotencyKey: intent.key});
      },
      (result, intent) => {
        const block = result.maintenance;
        if (result.resourceId !== blockId || !validMaintenance(block) || block.id !== blockId || block.status !== 'CANCELLED'
          || (block.version !== intent.expectedVersion && block.version !== intent.expectedVersion! + 1)) throw new Error('The maintenance result could not be confirmed.');
        return undefined;
      },
    ),
    create: (input: CreateInput) => run(
      GetOperationKindEnum.Create, createIdentity(input, true), async () => {
        if (!input.quoteId || !UUID_SHAPE.test(input.quoteId)) throw new OperationRecoveryError('Review and accept a current quote before confirming this reservation.');
        return undefined;
      },
      (intent) => {
        if (!quotes || !intent.quoteId) throw new OperationRecoveryError('This booking needs a saved quote. Check the saved reservations before trying again.');
        return quotes.confirmReservationQuote({idempotencyKey: intent.key, quoteConfirmationRequest: {customerId: input.customerId, quoteId: intent.quoteId,
          roomId: input.roomId, startDate: input.startDate, endDate: input.endDate, guestCount: input.guestCount ?? 1}});
      },
      (result, intent) => recoverCreated(input,result,intent), false, input.quoteId?.toLowerCase(),
    ),
    recoverCreate: async (input: CreateInput) => {
      try {
        return await run(GetOperationKindEnum.Create, createIdentity(input,true), async () => undefined, async () => undefined,
          (result,intent) => recoverCreated(input,result,intent),true);
      } catch (error) {
        if (!(error instanceof PendingIntentMissingError)) throw error;
        return run(GetOperationKindEnum.Create, createIdentity(input,false), async () => undefined, async () => undefined,
          result => result.resourceId,true);
      }
    },
    recoverMove: (reservationId: number, newRoomId: number) => recoverEdit(GetOperationKindEnum.Move,
      priced => moveIdentity(reservationId,newRoomId,priced), reservationId,{roomId: newRoomId}),
    recoverChange: (reservationId: number, startDate: string, endDate: string, guestCount: number) => recoverEdit(GetOperationKindEnum.Change,
      priced => changeIdentity(reservationId,startDate,endDate,guestCount,priced), reservationId,{startDate,endDate,guestCount}),
    move: (reservationId: number, newRoomId: number, expectedVersion?: number, quoteId?: string) => run(
      GetOperationKindEnum.Move, moveIdentity(reservationId,newRoomId,!!quoteId), () => expectedVersion === undefined ? version(reservationId) : Promise.resolve(expectedVersion),
      (intent) => intent.quoteId && quotes
        ? quotes.moveReservationWithQuote({reservationId,idempotencyKey: intent.key, quotedRoomChange: {newRoomId,expectedVersion: intent.expectedVersion!,quoteId: intent.quoteId}})
        : api.updateReservationRoom({reservationId,newRoomId,expectedVersion: intent.expectedVersion!,idempotencyKey: intent.key}),
      (result,intent) => edited(reservationId,result,intent,{roomId: newRoomId}), false, quoteId,
    ),
    change: (reservationId: number, startDate: string, endDate: string, guestCount: number, expectedVersion: number, quoteId?: string) => run(
      GetOperationKindEnum.Change, changeIdentity(reservationId,startDate,endDate,guestCount,!!quoteId), async () => expectedVersion,
      (intent) => intent.quoteId && quotes
        ? quotes.changeReservationWithQuote({reservationId,idempotencyKey: intent.key,quotedStayChange: {startDate,endDate,guestCount,expectedVersion: intent.expectedVersion!,quoteId: intent.quoteId}})
        : api.changeReservationDates({reservationId,startDate,endDate,guestCount,expectedVersion: intent.expectedVersion!,idempotencyKey: intent.key}),
      (result,intent) => edited(reservationId,result,intent,{startDate,endDate,guestCount}), false, quoteId,
    ),
    cancel: (reservationId: number, expectedVersion?: number) => run(
      GetOperationKindEnum.Cancel, { reservationId }, () => expectedVersion === undefined ? version(reservationId) : Promise.resolve(expectedVersion),
      (intent) => api.cancelReservation({ reservationId, expectedVersion: intent.expectedVersion!, idempotencyKey: intent.key }),
      () => undefined,
    ),
  };
};
