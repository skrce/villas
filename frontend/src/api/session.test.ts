import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const fetchMock = vi.fn<typeof fetch>();
const payload = (id = 'owner-one') => ({ authenticated: true, staff: { id, email: `${id}@example.test`, role: 'OWNER', active: true, version: 0 }, generation: 'login-one', csrfToken: 'memory-only-csrf', expiresAt: '2099-01-01T00:00:00Z', permissions: ['staff:manage'], provider: 'synthetic' });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const load = async () => { const session = await import('./session'); fetchMock.mockResolvedValueOnce(json(payload())); await session.refreshSession(); return session; };
beforeEach(() => { vi.resetModules(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe('staff session boundaries', () => {
  it('adds CSRF only to writes and persists no session or staff data', async () => {
    const session = await load();
    fetchMock.mockResolvedValueOnce(json([]));
    await session.scopedSessionFetch('owner-one', session.getSessionEpoch())('/api/v1/customers/search', { method: 'POST', body: '{}' });
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('X-CSRF-TOKEN')).toBe('memory-only-csrf');
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).has('Authorization')).toBe(false);
    expect(fetchMock.mock.calls[1][1]?.credentials).toBe('same-origin');
    expect(localStorage.length).toBe(0);
  });
  it('rejects old action continuations before any new request after reauthentication', async () => {
    const session = await load();
    const old = session.scopedSessionFetch('owner-one', session.getSessionEpoch());
    fetchMock.mockResolvedValueOnce(json({}, 401));
    await old('/api/v1/apartments');
    expect(session.getSession().status).toBe('anonymous');
    fetchMock.mockResolvedValueOnce(json(payload())); await session.refreshSession();
    const count = fetchMock.mock.calls.length;
    await expect(old('/api/v1/reservations', { method: 'POST' })).rejects.toThrow('session changed');
    expect(fetchMock).toHaveBeenCalledTimes(count);
  });
  it('invalidates old clients after a fresh login by the same Owner without an observed 401', async () => {
    const session = await load();
    const old = session.scopedSessionFetch('owner-one', session.getSessionEpoch());
    fetchMock.mockResolvedValueOnce(json({ ...payload(), generation: 'login-two' })); await session.refreshSession();
    const calls = fetchMock.mock.calls.length;
    await expect(old('/api/v1/reservations', { method: 'POST' })).rejects.toThrow('session changed');
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });
  it('hides access while logout is pending and prevents a focus refresh from overriding its result', async () => {
    const session = await load();
    let finish: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const signingOut = session.logout();
    expect(session.getSession()).toMatchObject({ status: 'anonymous', reason: 'logout-pending' });
    await session.refreshSession();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValueOnce(json({ authenticated: false }));
    finish(new Response(null, { status: 204 })); await signingOut;
    expect(session.getSession()).toMatchObject({ status: 'anonymous', reason: 'logout' });
  });
  it('discards a response that arrives after a different Owner signs in', async () => {
    const session = await load();
    let finish: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const request = session.scopedSessionFetch('owner-one', session.getSessionEpoch())('/api/v1/apartments');
    const rejected = expect(request).rejects.toThrow('session changed');
    fetchMock.mockResolvedValueOnce(json(payload('owner-two'))); await session.refreshSession();
    finish(json([{ view: 'Old account data' }])); await rejected;
    expect(session.getSessionOwnerKey()).toBe('owner-two');
  });
  it('rejects a body parsed after the session changed', async () => {
    const session = await load();
    fetchMock.mockResolvedValueOnce(json({ phone: 'synthetic' }));
    const response = await session.scopedSessionFetch('owner-one', session.getSessionEpoch())('/api/v1/customers/1');
    fetchMock.mockResolvedValueOnce(json({ authenticated: false })); await session.refreshSession();
    await expect(response.json()).rejects.toThrow('session changed');
  });
  it('keeps the latest session refresh when responses arrive out of order', async () => {
    const session = await import('./session');
    let finish: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const first = session.refreshSession();
    fetchMock.mockResolvedValueOnce(json(payload('owner-two'))); await session.refreshSession();
    finish(json(payload())); await first;
    expect(session.getSessionOwnerKey()).toBe('owner-two');
  });
  it('requires a read-back before reporting a successful logout', async () => {
    const session = await load();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json({ authenticated: false, provider: 'synthetic' }));
    await session.logout();
    expect(session.getSession()).toMatchObject({ status: 'anonymous', reason: 'logout' });
  });
  it.each(['lost response', 'still authenticated', 'invalid JSON'])('does not claim logout was confirmed after %s', async (failure) => {
    const session = await load();
    if (failure === 'lost response') fetchMock.mockRejectedValueOnce(new TypeError('Network'));
    else { fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 })); fetchMock.mockResolvedValueOnce(failure === 'still authenticated' ? json(payload()) : new Response('invalid')); }
    await session.logout();
    expect(session.getSession()).toMatchObject({ status: 'anonymous', reason: 'logout-unconfirmed' });
  });
  it('clears access when the session cannot be verified', async () => {
    const session = await load();
    fetchMock.mockResolvedValueOnce(json({ authenticated: true, staff: { role: 'ADMIN' } }));
    await session.refreshSession();
    expect(session.getSession().status).toBe('unavailable');
    await expect(session.sessionFetch('/api/v1/customers', { method: 'POST' })).rejects.toThrow('session changed');
  });
  it('deletes legacy credentials and raw pending payloads on startup', async () => {
    const session = await import('./session');
    localStorage.setItem('villarosa.apiConfig', '{"password":"old"}');
    localStorage.setItem('villarosa.pendingOperations.v1', '{"guest-data":"old"}');
    fetchMock.mockResolvedValueOnce(json({ authenticated: false }));
    const dispose = session.installSessionEvents();
    expect(localStorage.length).toBe(0); dispose();
  });
});
