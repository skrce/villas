import {
  GetOperationKindEnum,
  ReservationApi,
  MaintenanceApi,
  ApartmentApi,
  ResponseError,
  type CreateReservationRequest,
  type OperationResult,
  type MaintenanceBlock,
} from './generated';
import { validDate, validVersion } from '../shared/format';

export class MaintenanceRecoveryError extends Error {}

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
  'INVENTORY_CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'DATA_CONFLICT', 'GUEST_ARCHIVED', 'INVALID_REASON', 'HTTP_400',
]);
type Intent = { key: string; expectedVersion?: number };
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
    }
    return parsed as Intents;
  } catch {
    throw new Error('Pending changes could not be read. Check the records before retrying.');
  }
};

export const buildBookingActions = (api: ReservationApi, scope: string, generation = scope, maintenance?: MaintenanceApi, apartments?: ApartmentApi) => {
  const ownStorage = sessionStorage;
  const remember = (identity: string, intent: Intent) => ownStorage.setItem(OWN_STORAGE_KEY, JSON.stringify({ ...read(ownStorage, OWN_STORAGE_KEY), [identity]: intent }));
  const execute = async <T>(
    kind: GetOperationKindEnum,
    identity: string,
    prepare: () => Promise<number | undefined>,
    send: (intent: Intent) => Promise<unknown>,
    recovered: (result: OperationResult, intent: Intent) => T,
    recoveryOnly: boolean,
  ): Promise<T> => {
    let intent = await stored(() => {
      const saved = read(ownStorage, OWN_STORAGE_KEY)[identity] ?? read()[identity];
      if (saved) remember(identity, saved);
      return saved;
    });
    let existing = !!intent;
    if (!intent) {
      if (recoveryOnly) throw new MaintenanceRecoveryError('No pending maintenance request matches these details in this browser. Re-enter the original dates and reason to check it.');
      const prepared = { key: crypto.randomUUID(), expectedVersion: await prepare() };
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
      const value = recovered(result, intent);
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
        if (recoveryOnly) throw new MaintenanceRecoveryError('No committed result was found for this request. Restore the room before saving new maintenance.');
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
    recovered: (result: OperationResult, intent: Intent) => T,
    recoveryOnly = false,
  ): Promise<T> => {
    const fingerprint = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([scope, kind, input])));
    const identity = Array.from(new Uint8Array(fingerprint), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const inFlightIdentity = JSON.stringify([generation, identity, recoveryOnly]);
    const existing = pending.get(inFlightIdentity);
    if (existing) return existing as Promise<T>;
    const request = execute(kind, identity, prepare, send, recovered, recoveryOnly).finally(() => pending.delete(inFlightIdentity));
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

  return {
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
    create: (input: Omit<CreateReservationRequest, 'idempotencyKey'>) => run(
      GetOperationKindEnum.Create, {
        customerId: input.customerId, roomId: input.roomId,
        startDate: input.startDate, endDate: input.endDate, guestCount: input.guestCount ?? 1,
      }, async () => undefined,
      (intent) => api.createReservation({ ...input, guestCount: input.guestCount ?? 1, idempotencyKey: intent.key }),
      (result) => result.resourceId!,
    ),
    move: (reservationId: number, newRoomId: number, expectedVersion?: number) => run(
      GetOperationKindEnum.Move, { reservationId, newRoomId }, () => expectedVersion === undefined ? version(reservationId) : Promise.resolve(expectedVersion),
      (intent) => api.updateReservationRoom({ reservationId, newRoomId, expectedVersion: intent.expectedVersion!, idempotencyKey: intent.key }),
      () => undefined,
    ),
    change: (reservationId: number, startDate: string, endDate: string, guestCount: number, expectedVersion: number) => run(
      GetOperationKindEnum.Change, { reservationId, startDate, endDate, guestCount }, async () => expectedVersion,
      (intent) => api.changeReservationDates({ reservationId, startDate, endDate, guestCount, expectedVersion: intent.expectedVersion!, idempotencyKey: intent.key }),
      () => undefined,
    ),
    cancel: (reservationId: number, expectedVersion?: number) => run(
      GetOperationKindEnum.Cancel, { reservationId }, () => expectedVersion === undefined ? version(reservationId) : Promise.resolve(expectedVersion),
      (intent) => api.cancelReservation({ reservationId, expectedVersion: intent.expectedVersion!, idempotencyKey: intent.key }),
      () => undefined,
    ),
  };
};
