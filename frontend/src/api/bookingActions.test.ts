import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBookingActions } from './bookingActions';
import { Configuration, ReservationApi } from './generated';

const fetchMock = vi.fn<typeof fetch>();
const input = { customerId: 1, roomId: 7, startDate: '2026-11-06', endDate: '2026-11-09' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const actions = (scope = 'local:staff') => buildBookingActions(
  new ReservationApi(new Configuration({ basePath: '/api/v1' })), scope,
);
const key = (call: number) => new Headers(fetchMock.mock.calls[call][1]?.headers).get('Idempotency-Key');
const notCommitted = () => json({ code: 'OPERATION_NOT_COMMITTED', message: 'Reconcile or retry with the same key.' }, 404);

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('booking write reconciliation', () => {
  it('recovers the saved create after a lost response and a page reload', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Connection lost'));
    await expect(actions().create(input)).rejects.toThrow();
    const originalKey = key(0);
    fetchMock.mockResolvedValueOnce(json({ key: originalKey, kind: 'CREATE', resourceId: 42 }));

    await expect(actions().create({ ...input, guestCount: 1 })).resolves.toBe(42);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/v1/operations/${originalKey}?kind=CREATE`);
    expect(fetchMock.mock.calls[1][1]?.method).toBe('GET');
  });

  it('retries a definitely uncommitted create with the original key', async () => {
    const client = actions();
    fetchMock.mockRejectedValueOnce(new TypeError('Connection lost'));
    await expect(client.create(input)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(notCommitted()).mockResolvedValueOnce(json(42));

    await expect(client.create(input)).resolves.toBe(42);
    expect(key(2)).toBe(key(0));
  });

  it.each([
    ['an unrelated JSON 404', () => json({ message: 'No route' }, 404)],
    ['a proxy HTML 404', () => new Response('<html>Unavailable</html>', { status: 404 })],
    ['a server failure', () => json({ message: 'Unavailable' }, 503)],
  ])('retains the key without resubmitting after %s during lookup', async (_, response) => {
    fetchMock.mockRejectedValueOnce(new TypeError('Connection lost'));
    await expect(actions().create(input)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(response());
    await expect(actions().create(input)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const originalKey = key(0);
    fetchMock.mockResolvedValueOnce(json({ key: originalKey, kind: 'CREATE', resourceId: 42 }));
    await expect(actions().create(input)).resolves.toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps the expected version and key of an unconfirmed move', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, version: 3 })).mockRejectedValueOnce(new TypeError('Connection lost'));
    await expect(actions().move(42, 8)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(notCommitted()).mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(actions().move(42, 8)).resolves.toBeUndefined();

    expect(key(3)).toBe(key(1));
    expect(fetchMock.mock.calls[3][0]).toBe('/api/v1/reservations?reservationId=42&newRoomId=8&expectedVersion=3');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('allows a new intent after a definitive stale-version rejection', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, version: 0 }))
      .mockResolvedValueOnce(json({ code: 'STALE_VERSION', message: 'Reload.' }, 409));
    await expect(actions().cancel(42)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(json({ id: 42, version: 1 })).mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(actions().cancel(42)).resolves.toBeUndefined();
    expect(key(3)).not.toBe(key(1));
    expect(fetchMock.mock.calls[3][0]).toContain('expectedVersion=1');
  });

  it('coalesces simultaneous identical submissions before preparation completes', async () => {
    let resolve: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    const client = actions();
    const first = client.create(input);
    const second = client.create(input);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    resolve(json(42));
    await expect(Promise.all([first, second])).resolves.toEqual([42, 42]);
  });

  it('does not recover a result for the wrong operation', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Connection lost'));
    await expect(actions().create(input)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(json({ key: key(0), kind: 'CANCEL', resourceId: 42 }));
    await expect(actions().create(input)).rejects.toThrow('could not be confirmed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses to discard corrupt pending state or an invalid loaded version', async () => {
    localStorage.setItem('villarosa.pendingOperations.v1', 'invalid');
    await expect(actions().create(input)).rejects.toThrow('could not be read');
    expect(fetchMock).not.toHaveBeenCalled();
    localStorage.clear();
    fetchMock.mockResolvedValueOnce(json({ id: 42, version: -1 }));
    await expect(actions().cancel(42)).rejects.toThrow('version could not be loaded');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
