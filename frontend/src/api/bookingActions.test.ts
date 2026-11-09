import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBookingActions } from './bookingActions';
import { testQuote } from '../test/quotes';
import { Configuration, ReservationApi, MaintenanceApi, ApartmentApi, QuotesApi } from './generated';

const fetchMock = vi.fn<typeof fetch>();
const quoteId = '11111111-1111-4111-8111-111111111111';
const input = { quoteId, customerId: 1, roomId: 7, startDate: '2026-11-06', endDate: '2026-11-09' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const actions = (scope = 'local:staff', generation = scope) => buildBookingActions(
  new ReservationApi(new Configuration({ basePath: '/api/v1' })), scope, generation, undefined, undefined, new QuotesApi(new Configuration({ basePath: '/api/v1' })),
);
const key = (call: number) => new Headers(fetchMock.mock.calls[call][1]?.headers).get('Idempotency-Key');
const notCommitted = () => json({ code: 'OPERATION_NOT_COMMITTED', message: 'Reconcile or retry with the same key.' }, 404);
const operation = (key: string | null, kind = 'CREATE') => ({key, kind, resourceId: 42, ...(kind === 'CREATE' ? {reservation: {id: 42, customerId: 1, roomId: 7, startDate: input.startDate, endDate: input.endDate, guestCount: 1, version: 0, status: 'ACTIVE', acceptedQuoteId: quoteId}} : {})});
const confirm = (call: number, kind = 'CREATE') => fetchMock.mockImplementationOnce(async () => json(operation(key(call), kind)));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('booking write reconciliation', () => {
  it('keeps the original accepted offer when a retry supplies a newer quote', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Connection lost'));
    await expect(actions().create(input)).rejects.toThrow();
    const original = key(0);
    const retained = JSON.stringify(localStorage);
    expect(retained).toContain(quoteId);
    expect(retained).not.toContain(input.startDate);
    expect(retained).not.toContain('5001');
    fetchMock.mockResolvedValueOnce(notCommitted()).mockResolvedValueOnce(json(42));
    confirm(2);
    await expect(actions().create({...input, quoteId: '22222222-2222-4222-8222-222222222222'})).resolves.toBe(42);
    expect(key(2)).toBe(original);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).quoteId).toBe(quoteId);
  });

  it.each([
    ['another quote', {acceptedQuoteId: '22222222-2222-4222-8222-222222222222'}],
    ['no accepted price', {acceptedQuoteId: null}],
    ['another guest', {customerId: 2}],
    ['another room', {roomId: 8}],
    ['another date', {endDate: '2026-11-10'}],
    ['another party size', {guestCount: 2}],
    ['a later version', {version: 1}],
    ['a cancellation', {status: 'CANCELLED'}],
  ])('retains the original create intent when confirmation contains %s', async (_label, change) => {
    fetchMock.mockResolvedValueOnce(json(42)).mockImplementationOnce(async () => {
      const saved = operation(key(0));
      return json({...saved, reservation: {...saved.reservation, ...change}});
    });
    await expect(actions().create(input)).rejects.toThrow('could not be confirmed');
    const original = key(0);
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toContain(original);
    fetchMock.mockResolvedValueOnce(json(operation(original)));
    await expect(actions().recoverCreate({...input, quoteId: undefined})).resolves.toBe(42);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('checks a pending create without a quote and retains an uncommitted key without posting', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Connection lost'));
    await expect(actions().create(input)).rejects.toThrow();
    const original = key(0);
    fetchMock.mockResolvedValueOnce(notCommitted());
    await expect(actions().recoverCreate({...input, quoteId: undefined})).rejects.toThrow('No confirmed booking result');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toContain(original);
  });

  it('does not create an intent or issue a request when there is nothing to recover', async () => {
    await expect(actions().recoverCreate({...input, quoteId: undefined})).rejects.toThrow('No previous booking save');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toBeNull();
  });

  it('can read a pre-pricing pending create without resubmitting it', async () => {
    const original = crypto.randomUUID();
    const priorInput = {customerId: input.customerId, roomId: input.roomId, startDate: input.startDate, endDate: input.endDate, guestCount: 1};
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['local:staff', 'CREATE', priorInput])));
    const identity = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('villarosa.pendingOperations.v2', JSON.stringify({[identity]: {key: original}}));
    fetchMock.mockResolvedValueOnce(json({key: original, kind: 'CREATE', resourceId: 42}));
    await expect(actions().recoverCreate({...input, quoteId: undefined})).resolves.toBe(42);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toBe('{}');
  });

  it('recovers the saved create after a lost response and a page reload', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Connection lost'));
    await expect(actions().create(input)).rejects.toThrow();
    const originalKey = key(0);
    fetchMock.mockResolvedValueOnce(json(operation(originalKey)));

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
    confirm(2);

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
    fetchMock.mockResolvedValueOnce(json(operation(originalKey)));
    await expect(actions().create(input)).resolves.toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps the expected version and key of an unconfirmed move', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, version: 3 })).mockRejectedValueOnce(new TypeError('Connection lost'));
    await expect(actions().move(42, 8)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(notCommitted()).mockResolvedValueOnce(new Response(null, { status: 200 }));
    confirm(3, 'MOVE');

    await expect(actions().move(42, 8)).resolves.toBeUndefined();

    expect(key(3)).toBe(key(1));
    expect(fetchMock.mock.calls[3][0]).toBe('/api/v1/reservations?reservationId=42&newRoomId=8&expectedVersion=3');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('allows a new intent after a definitive stale-version rejection', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, version: 0 }))
      .mockResolvedValueOnce(json({ code: 'STALE_VERSION', message: 'Reload.' }, 409));
    await expect(actions().cancel(42)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(json({ id: 42, version: 1 })).mockResolvedValueOnce(new Response(null, { status: 200 }));
    confirm(3, 'CANCEL');

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
    confirm(0);
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

  it.each([
    ['HTML', () => new Response('<html>Unavailable</html>', { headers: { 'Content-Type': 'text/html' } })],
    ['null', () => json(null)],
    ['an object', () => json({ unexpected: 42 })],
  ])('retains the create key after an unconfirmed 200 containing %s', async (_, response) => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(notCommitted());
    await expect(actions().create(input)).rejects.toThrow();
    const original = key(0);
    fetchMock.mockResolvedValueOnce(json(operation(original)));
    await expect(actions().create(input)).resolves.toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('confirms void edits instead of accepting an HTML success page', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 42, version: 0 }))
      .mockResolvedValueOnce(new Response('<html>Unavailable</html>')).mockResolvedValueOnce(notCommitted());
    await expect(actions().cancel(42)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(json({ key: key(1), kind: 'CANCEL', resourceId: 42 }));
    await expect(actions().cancel(42)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('shares an in-flight submission across adapter instances', async () => {
    let resolve: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
    const first = actions().create(input);
    const second = actions().create(input);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    confirm(0);
    resolve(json(42));
    await expect(Promise.all([first, second])).resolves.toEqual([42, 42]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lets an explicit retry in a new login recover a durable key without reusing the old promise', async () => {
    let finish: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const old = actions('owner-one', 'login-one').create(input);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const original = key(0);
    fetchMock.mockResolvedValueOnce(json(operation(original)));
    await expect(actions('owner-one', 'login-two').create(input)).resolves.toBe(42);
    confirm(0); finish(json(42)); await old;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('uses the version reviewed in the UI instead of silently loading a newer version', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 })); confirm(0, 'MOVE');
    await expect(actions().move(42, 8, 3)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toContain('expectedVersion=3');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PATCH');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('reconciles a lost stay edit with its original version and key', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Lost response'));
    await expect(actions().change(42, '2026-11-06', '2026-11-10', 2, 3)).rejects.toThrow();
    const original = key(0);
    fetchMock.mockResolvedValueOnce(json({ key: original, kind: 'CHANGE', resourceId: 42 }));
    await expect(actions().change(42, '2026-11-06', '2026-11-10', 2, 4)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.method).toBe('GET');
  });
  it('keeps its own unconfirmed key after another tab confirms and clears the shared claim', async () => {
    const originalStorage = sessionStorage;
    const values = new Map<string, string>();
    const otherStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); }, clear: () => values.clear(), key: () => null, get length() { return values.size; } } as Storage;
    const first = actions('owner-one', 'tab-one');
    vi.stubGlobal('sessionStorage', otherStorage); const other = actions('owner-one', 'tab-two'); vi.stubGlobal('sessionStorage', originalStorage);
    let fail: (reason: Error) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => { fail = reject; }));
    const lost = expect(first.create(input)).rejects.toThrow();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const original = key(0);
    fetchMock.mockResolvedValueOnce(notCommitted()).mockResolvedValueOnce(json(42)); confirm(2);
    await expect(other.create(input)).resolves.toBe(42);
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toBe('{}');
    fail(new Error('Lost response')); await lost;
    fetchMock.mockResolvedValueOnce(json(operation(original)));
    await expect(first.create(input)).resolves.toBe(42);
    expect(fetchMock.mock.calls[4][0]).toContain(original!);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2);
  });
  it('never deletes a different durable intent when completing its own', async () => {
    fetchMock.mockImplementationOnce(async () => {
      const saved = JSON.parse(localStorage.getItem('villarosa.pendingOperations.v2')!);
      const identity = Object.keys(saved)[0];
      saved[identity] = { key: '00000000-0000-0000-0000-000000000001' };
      localStorage.setItem('villarosa.pendingOperations.v2', JSON.stringify(saved));
      return json(42);
    });
    confirm(0);
    await expect(actions().create(input)).resolves.toBe(42);
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toContain('00000000-0000-0000-0000-000000000001');
  });

  it('refuses to submit without origin-wide storage locks', async () => {
    vi.spyOn(navigator, 'locks', 'get').mockReturnValue(undefined as unknown as LockManager);
    await expect(actions().create(input)).rejects.toThrow('HTTPS or localhost');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to discard corrupt pending state or an invalid loaded version', async () => {
    localStorage.setItem('villarosa.pendingOperations.v2', 'invalid');
    await expect(actions().create(input)).rejects.toThrow('could not be read');
    expect(fetchMock).not.toHaveBeenCalled();
    localStorage.clear();
    fetchMock.mockResolvedValueOnce(json({ id: 42, version: -1 }));
    await expect(actions().cancel(42)).rejects.toThrow('version could not be loaded');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});


describe('quoted booking edit reconciliation', () => {
  const offer = () => testQuote({...input,roomId: 8,guestCount: 1});
  const result = (operationKey: string | null, kind = 'MOVE') => ({key: operationKey,kind,resourceId: 42,reservation: {
    id: 42,customerId: 1,roomId: 8,startDate: input.startDate,endDate: input.endDate,guestCount: 1,version: 4,status: 'ACTIVE',acceptedQuoteId: quoteId,
  }});
  it('confirms the original saved quote before clearing an edited booking intent', async () => {
    fetchMock.mockResolvedValueOnce(json(result(null).reservation))
      .mockImplementationOnce(async () => json(result(key(0))))
      .mockImplementationOnce(async () => {
        expect(localStorage.getItem('villarosa.pendingOperations.v2')).toContain(key(0));
        return json(offer());
      });
    await expect(actions().move(42,8,3,quoteId)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/reservations/42/room/quoted');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({newRoomId: 8,expectedVersion: 3,quoteId});
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toBe('{}');
  });
  it('retains the original quote, version and key when retrying with a newer offer', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Lost response'));
    await expect(actions().move(42,8,3,quoteId)).rejects.toThrow();
    const original = key(0);
    fetchMock.mockResolvedValueOnce(notCommitted()).mockResolvedValueOnce(json(result(original).reservation))
      .mockResolvedValueOnce(json(result(original))).mockResolvedValueOnce(json(offer()));
    await expect(actions().move(42,8,9,'22222222-2222-4222-8222-222222222222')).resolves.toBeUndefined();
    expect(key(2)).toBe(original);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({quoteId,expectedVersion: 3});
  });
  it('recovers a changed stay using its historical offer without requiring a fresh quote or another write', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Lost response'));
    await expect(actions().change(42,input.startDate,input.endDate,1,3,quoteId)).rejects.toThrow();
    const original = key(0);
    const historical = {...offer(),createdAt: '2000-01-01T00:00:00Z',expiresAt: '2000-01-01T00:15:00Z'};
    fetchMock.mockResolvedValueOnce(json(result(original,'CHANGE'))).mockResolvedValueOnce(json(historical));
    await expect(actions().recoverChange(42,input.startDate,input.endDate,1)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.filter(([,init]) => init?.method === 'PATCH')).toHaveLength(1);
    expect(fetchMock.mock.calls.at(-1)![0]).toBe(`/api/v1/booking-quotes/${quoteId}`);
  });
  it.each(['another quote','another room','malformed money'])('retains the edited booking key when the historical quote contains %s', async problem => {
    const wrong = offer();
    if (problem === 'another quote') wrong.id = '22222222-2222-4222-8222-222222222222';
    if (problem === 'another room') wrong.roomId = 7;
    if (problem === 'malformed money') wrong.price.totalCents += 1;
    fetchMock.mockResolvedValueOnce(json(result(null).reservation))
      .mockImplementationOnce(async () => json(result(key(0)))).mockResolvedValueOnce(json(wrong));
    await expect(actions().move(42,8,3,quoteId)).rejects.toThrow();
    const original = key(0);
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toContain(original);
    fetchMock.mockResolvedValueOnce(json(result(original))).mockResolvedValueOnce(json(offer()));
    await expect(actions().recoverMove(42,8)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.filter(([,init]) => init?.method === 'PATCH')).toHaveLength(1);
  });
  it.each(['wrong price','later version','different dates'])('retains a priced edit whose operation snapshot has %s', async problem => {
    const wrong = result(null);
    if (problem === 'wrong price') wrong.reservation.acceptedQuoteId = '22222222-2222-4222-8222-222222222222';
    if (problem === 'later version') wrong.reservation.version = 5;
    if (problem === 'different dates') wrong.reservation.endDate = '2026-11-10';
    fetchMock.mockResolvedValueOnce(json(wrong.reservation)).mockImplementationOnce(async () => json({...wrong,key: key(0)}))
      .mockResolvedValueOnce(json(offer()));
    await expect(actions().move(42,8,3,quoteId)).rejects.toThrow('could not be confirmed');
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toContain(key(0));
  });
  it.each([[3,'invalid'],[-1,quoteId],[3.5,quoteId]])('rejects malformed reviewed input before persisting an unusable intent (%s)', async (version, savedQuote) => {
    await expect(actions().move(42,8,version as number,savedQuote as string)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toBeNull();
  });
});

describe('maintenance operation reconciliation', () => {
  const block = {id: 30, roomId: 7, startDate: '2030-01-01', endDate: '2030-01-03', reason: 'Synthetic private repair', status: 'ACTIVE', version: 0};
  const client = () => {
    const config = new Configuration({basePath: '/api/v1', fetchApi: fetchMock});
    return buildBookingActions(new ReservationApi(config), 'maintenance-owner', 'maintenance-login', new MaintenanceApi(config), new ApartmentApi(config));
  };
  it('sends private maintenance JSON and verifies its committed result', async () => {
    fetchMock.mockResolvedValueOnce(json(block)).mockImplementationOnce(async () => json({key: key(0), kind: 'BLOCK', resourceId: 30, maintenance: block}));
    await expect(client().block(7, block.startDate, block.endDate, block.reason)).resolves.toBe(30);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/apartments/7/maintenance');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({startDate: block.startDate, endDate: block.endDate, reason: block.reason});
    expect(JSON.stringify(localStorage)).not.toContain(block.reason);
  });
  it('retains a block intent when the saved snapshot is malformed and reconciles before another POST', async () => {
    fetchMock.mockResolvedValueOnce(json(block)).mockImplementationOnce(async () => json({key: key(0), kind: 'BLOCK', resourceId: 30, maintenance: {id: 30}}));
    await expect(client().block(7, block.startDate, block.endDate, block.reason)).rejects.toThrow('could not be confirmed');
    const original = key(0);
    fetchMock.mockResolvedValueOnce(json({key: original, kind: 'BLOCK', resourceId: 30, maintenance: block}));
    await expect(client().block(7, block.startDate, block.endDate, block.reason)).resolves.toBe(30);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it.each([
    ['another room', {roomId: 999}],
    ['another start date', {startDate: '2030-01-02'}],
    ['another end date', {endDate: '2030-01-04'}],
    ['an invalid date', {startDate: 'invalid'}],
    ['another reason', {reason: 'Different repair'}],
    ['a later version', {version: 1}],
    ['a fractional room', {roomId: 7.5}],
  ])('keeps the pending block key when a snapshot contains %s', async (_label, change) => {
    fetchMock.mockResolvedValueOnce(json(block)).mockImplementationOnce(async () => json({key: key(0), kind: 'BLOCK', resourceId: 30, maintenance: {...block, ...change}}));
    await expect(client().block(7, block.startDate, block.endDate, block.reason)).rejects.toThrow('could not be confirmed');
    const original = key(0);
    expect(sessionStorage.getItem('villarosa.ownPendingOperations.v2')).toContain(original!);
    fetchMock.mockResolvedValueOnce(json({key: original, kind: 'BLOCK', resourceId: 30, maintenance: block}));
    await expect(client().block(7, block.startDate, block.endDate, block.reason)).resolves.toBe(30);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('checks an archived room result without creating a new intent or sending a new block', async () => {
    await expect(client().block(7, block.startDate, block.endDate, block.reason, {recoveryOnly: true})).rejects.toThrow('No pending maintenance request');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toBeNull();
    fetchMock.mockRejectedValueOnce(new TypeError('Lost response'));
    await expect(client().block(7, block.startDate, block.endDate, block.reason)).rejects.toThrow();
    const original = key(0);
    fetchMock.mockResolvedValueOnce(notCommitted());
    await expect(client().block(7, block.startDate, block.endDate, block.reason, {recoveryOnly: true})).rejects.toThrow('No committed result was found');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem('villarosa.ownPendingOperations.v2')).toContain(original!);
    fetchMock.mockResolvedValueOnce(json({key: original, kind: 'BLOCK', resourceId: 30, maintenance: block}));
    await expect(client().block(7, block.startDate, block.endDate, block.reason, {recoveryOnly: true})).resolves.toBe(30);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('keeps the reviewed block version and rejects a cancellation snapshot that still says active', async () => {
    fetchMock.mockResolvedValueOnce(json(block)).mockImplementationOnce(async () => json({key: key(0), kind: 'UNBLOCK', resourceId: 30, maintenance: block}));
    await expect(client().unblock(30, 3)).rejects.toThrow('could not be confirmed');
    expect(String(fetchMock.mock.calls[0][0])).toContain('expectedVersion=3');
    const original = key(0);
    fetchMock.mockResolvedValueOnce(json({key: original, kind: 'UNBLOCK', resourceId: 30, maintenance: {...block, status: 'CANCELLED', version: 4}}));
    await expect(client().unblock(30, 4)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('business operation recovery', () => {
  const scoped = (scope: string, assertCurrent: () => void = () => {}, legacyScope?: string) => buildBookingActions(
    new ReservationApi(new Configuration({basePath:'/api/v1'})), scope, `${scope}:login`, undefined, undefined,
    new QuotesApi(new Configuration({basePath:'/api/v1'})), {assertCurrent,legacyScope},
  );
  it('retains a confirmed but ignored business-A receipt while business B uses an independent intent', async () => {
    let active='A';
    let finish!: (value:Response)=>void;
    const business=(id:string)=>scoped(JSON.stringify(['canonical',id,`member-${id}`]),()=>{if(active!==id)throw new Error('Business changed');});
    fetchMock.mockResolvedValueOnce(json(42)).mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;}));
    const first=business('A').create(input);
    const rejected=expect(first).rejects.toThrow('Business changed');
    await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
    const original=key(0);
    active='B'; finish(json(operation(original))); await rejected;
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toContain(original);
    fetchMock.mockResolvedValueOnce(json(42)); confirm(2);
    await expect(business('B').create(input)).resolves.toBe(42);
    expect(key(2)).not.toBe(original);
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).toContain(original);
    active='A'; fetchMock.mockResolvedValueOnce(json(operation(original)));
    await expect(business('A').recoverCreate({...input,quoteId:undefined})).resolves.toBe(42);
    expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(2);
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).not.toContain(original);
  });
  it('keeps a legacy compatibility receipt key and quote when adopting its verified business namespace', async () => {
    const legacy=JSON.stringify(['/api/v1','member-A']);
    fetchMock.mockRejectedValueOnce(new TypeError('Lost response'));
    await expect(actions(legacy).create(input)).rejects.toThrow('The request failed');
    const original=key(0);
    fetchMock.mockResolvedValueOnce(json(operation(original)));
    await expect(scoped(JSON.stringify(['canonical','A','member-A']),()=>{},legacy).recoverCreate({...input,quoteId:undefined})).resolves.toBe(42);
    expect(fetchMock.mock.calls[1][0]).toContain(original);
    expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
    expect(localStorage.getItem('villarosa.pendingOperations.v2')).not.toContain(original);
    expect(sessionStorage.getItem('villarosa.ownPendingOperations.v2')).not.toContain(original);
  });
  it('uses business-and-actor locks alongside the short shared metadata update lock', async () => {
    const names:string[]=[];
    vi.spyOn(navigator,'locks','get').mockReturnValue({request:async(name:string,callback:()=>unknown)=>{names.push(name);return callback();}} as unknown as LockManager);
    for(const business of ['A','B']) await expect(scoped(JSON.stringify(['canonical',business,`member-${business}`])).recoverCreate(input)).rejects.toThrow('No previous booking');
    expect(new Set(names.filter(name=>name.startsWith('villas.operations.'))).size).toBe(2);
    expect(names).toContain('villarosa.pendingOperations.v2');
  });
});
