import {
  GetOperationKindEnum,
  ReservationApi,
  ResponseError,
  type CreateReservationRequest,
  type OperationResult,
} from './generated';

const STORAGE_KEY = 'villarosa.pendingOperations.v2';
const DEFINITIVE_ERRORS = new Set([
  'INVALID_REQUEST', 'INVALID_OPERATION_KEY', 'INVALID_ID', 'INVALID_VERSION',
  'INVALID_GUEST_COUNT', 'CAPACITY_EXCEEDED', 'NOT_FOUND', 'STALE_VERSION',
  'RESERVATION_CHANGED', 'RESERVATION_CANCELLED', 'ROOM_INACTIVE',
  'INVENTORY_CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'DATA_CONFLICT',
]);
type Intent = { key: string; expectedVersion?: number };
type Intents = Record<string, Intent>;
const pending = new Map<string, Promise<unknown>>();

const stored = <T>(action: () => T): Promise<T> => {
  if (!navigator.locks) return Promise.reject(new Error('Safe booking changes require HTTPS or localhost in a browser with Web Locks support.'));
  return navigator.locks.request(STORAGE_KEY, () => action());
};

const read = (): Intents => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
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

export const buildBookingActions = (api: ReservationApi, scope: string) => {
  const execute = async <T>(
    kind: GetOperationKindEnum,
    identity: string,
    prepare: () => Promise<number | undefined>,
    send: (intent: Intent) => Promise<unknown>,
    recovered: (result: OperationResult) => T,
  ): Promise<T> => {
    let intent = await stored(() => read()[identity]);
    let existing = !!intent;
    if (!intent) {
      const prepared = { key: crypto.randomUUID(), expectedVersion: await prepare() };
      intent = await stored(() => {
        const current = read();
        if (current[identity]) {
          existing = true;
          return current[identity];
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, [identity]: prepared }));
        return prepared;
      });
    }
    const clear = () => stored(() => {
      const current = read();
      if (current[identity]?.key === intent.key) {
        delete current[identity];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      }
    });
    const confirm = async () => {
      const result = await api.getOperation({ operationKey: intent.key, kind });
      if (result?.key !== intent.key || result.kind !== kind || !Number.isSafeInteger(result.resourceId) || result.resourceId <= 0) {
        throw new Error('The saved result could not be confirmed. Check the records before retrying.');
      }
      const value = recovered(result);
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
    recovered: (result: OperationResult) => T,
  ): Promise<T> => {
    const fingerprint = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([scope, kind, input])));
    const identity = Array.from(new Uint8Array(fingerprint), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const existing = pending.get(identity);
    if (existing) return existing as Promise<T>;
    const request = execute(kind, identity, prepare, send, recovered).finally(() => pending.delete(identity));
    pending.set(identity, request);
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
    create: (input: Omit<CreateReservationRequest, 'idempotencyKey'>) => run(
      GetOperationKindEnum.Create, {
        customerId: input.customerId, roomId: input.roomId,
        startDate: input.startDate, endDate: input.endDate, guestCount: input.guestCount ?? 1,
      }, async () => undefined,
      (intent) => api.createReservation({ ...input, guestCount: input.guestCount ?? 1, idempotencyKey: intent.key }),
      (result) => result.resourceId!,
    ),
    move: (reservationId: number, newRoomId: number) => run(
      GetOperationKindEnum.Move, { reservationId, newRoomId }, () => version(reservationId),
      (intent) => api.updateReservationRoom({ reservationId, newRoomId, expectedVersion: intent.expectedVersion!, idempotencyKey: intent.key }),
      () => undefined,
    ),
    cancel: (reservationId: number) => run(
      GetOperationKindEnum.Cancel, { reservationId }, () => version(reservationId),
      (intent) => api.cancelReservation({ reservationId, expectedVersion: intent.expectedVersion!, idempotencyKey: intent.key }),
      () => undefined,
    ),
  };
};
