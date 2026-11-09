import { useSyncExternalStore } from 'react';
import type { StaffView } from './generated';

export const API_BASE = '/api/v1';
export type Staff = Required<Pick<StaffView, 'id' | 'email' | 'role' | 'active' | 'version'>>;
export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' | 'unavailable'; reason?: string; provider: 'google' | 'synthetic' }
  | { status: 'restricted'; reason: string; identityId: string; provider: 'google' | 'synthetic' }
  | { status: 'authenticated'; identityId?: string; staff: Staff; generation: string; expiresAt: Date; permissions: string[]; propertyId?: string; propertyName?: string; provider: 'google' | 'synthetic' };

let state: SessionState = { status: 'loading' };
let csrf: string | undefined;
let epoch = 0;
let refreshSequence = 0;
let logoutInProgress = false;
let locallyLocked = false;
let ownerKey = 'anonymous';
let identityKey: string | undefined;
const listeners = new Set<() => void>();
const notify = (next: SessionState) => {
  const previousId = state.status === 'authenticated' ? state.staff.id : undefined;
  const nextId = next.status === 'authenticated' ? next.staff.id : undefined;
  if (next.status === 'authenticated') {
    ownerKey = next.staff.id;
    identityKey = next.identityId;
  } else if (next.status === 'restricted') {
    if (!identityKey || identityKey !== next.identityId) ownerKey = `identity:${next.identityId}`;
    identityKey = next.identityId;
  }
  const changedGeneration = state.status === 'authenticated' && next.status === 'authenticated' && state.generation !== next.generation;
  const changedBusiness = state.status === 'authenticated' && next.status === 'authenticated' && state.propertyId !== next.propertyId;
  if (previousId !== nextId || next.status !== 'authenticated' || changedGeneration || changedBusiness) epoch++;
  state = next;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSession = () => state;
export const getSessionEpoch = () => epoch;
export const getSessionOwnerKey = () => ownerKey;
export const useStaffSession = () => useSyncExternalStore(subscribe, getSession);

export class SessionChangedError extends Error {
  constructor() { super('The staff session changed. Review your details before submitting again.'); }
}

export const sessionFetch: typeof fetch = async (input, init) => {
  const started = epoch;
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  if (state.status !== 'authenticated' || !state.propertyId) throw new SessionChangedError();
  headers.set('X-Villas-Business', state.propertyId);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (state.status !== 'authenticated' || !csrf) throw new SessionChangedError();
    headers.set('X-CSRF-TOKEN', csrf);
  }
  const response = await fetch(input, { ...init, headers, credentials: 'same-origin' });
  if (started !== epoch) throw new SessionChangedError();
  if (response.status === 403) {
    const denied = await response.clone().json().catch(() => undefined) as { code?: string } | undefined;
    if (denied?.code === 'BUSINESS_ACCESS_DENIED') await refreshSession();
  }
  if (response.status === 401) {
    ++refreshSequence;
    csrf = undefined;
    notify({ status: 'anonymous', reason: 'expired', provider: state.provider });
  }
  const guard = (value: unknown) => { if (started !== epoch) throw new SessionChangedError(); return value; };
  const wrap = (source: Response): Response => new Proxy(source, { get(target, property) {
    if (property === 'clone') return () => wrap(target.clone());
    if (['json', 'text', 'blob', 'arrayBuffer', 'formData'].includes(String(property))) return async () => guard(await (target[property as 'json'] as () => Promise<unknown>).call(target));
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return wrap(response);
};

export const scopedSessionFetch = (staffId: string, expectedEpoch: number): typeof fetch => async (input, init) => {
  if (state.status !== 'authenticated' || state.staff.id !== staffId || epoch !== expectedEpoch) throw new SessionChangedError();
  return sessionFetch(input, init);
};

const readSession = async () => {
  const response = await fetch(`${API_BASE}/auth/session`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Your session could not be confirmed. Check your connection and try again.');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('authenticated' in body) || typeof body.authenticated !== 'boolean') throw new Error('The session response could not be confirmed.');
  return body as Record<string, unknown> & { authenticated: boolean };
};

export const refreshSession = async (options?: { explicit: boolean }) => {
  if (logoutInProgress || (locallyLocked && !options?.explicit)) return;
  if (options?.explicit) locallyLocked = false;
  const sequence = ++refreshSequence;
  try {
    const body = await readSession();
    if (sequence !== refreshSequence) return;
    const provider = body.provider === 'synthetic' ? 'synthetic' : 'google';
    if (!body.authenticated) { csrf = undefined; notify({ status: 'anonymous', provider }); return; }
    const expiry = new Date(String(body.expiresAt));
    if (body.staff === null && typeof body.csrfToken === 'string' && body.csrfToken && typeof body.generation === 'string' && body.generation && !Number.isNaN(expiry.getTime())
      && body.identity && typeof body.identity === 'object' && 'id' in body.identity && typeof body.identity.id === 'string' && body.identity.id
      && 'email' in body.identity && typeof body.identity.email === 'string' && body.identity.email) {
      csrf = body.csrfToken;
      notify({ status: 'restricted', identityId: body.identity.id, reason: 'This workspace is unavailable for your account. Ask an Owner for access or sign in with another account.', provider });
      return;
    }
    const staff = body.staff as Partial<Staff> | null;
    if (typeof body.generation !== 'string' || !body.generation || !staff || typeof staff.id !== 'string' || !staff.id || typeof staff.email !== 'string' || staff.role !== 'OWNER' || staff.active !== true
      || typeof staff.version !== 'number' || !Number.isSafeInteger(staff.version) || staff.version < 0
      || typeof body.propertyId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(body.propertyId)
      || typeof body.csrfToken !== 'string' || !body.csrfToken || Number.isNaN(expiry.getTime())
      || !Array.isArray(body.permissions) || !body.permissions.every((permission) => typeof permission === 'string')) throw new Error('The session response could not be confirmed.');
    csrf = body.csrfToken;
    notify({ status: 'authenticated', identityId: body.identity && typeof body.identity === 'object' && 'id' in body.identity && typeof body.identity.id === 'string' ? body.identity.id : undefined, staff: staff as Staff, generation: body.generation, expiresAt: expiry, permissions: body.permissions, propertyId: body.propertyId as string, propertyName: typeof body.propertyName === 'string' ? body.propertyName : undefined, provider });
  } catch (error) {
    if (sequence !== refreshSequence) return;
    csrf = undefined;
    notify({ status: 'unavailable', reason: error instanceof Error ? error.message : 'Your session could not be confirmed.', provider: state.status === 'loading' ? 'google' : state.provider });
  }
};

export const logout = async () => {
  if (logoutInProgress) return;
  logoutInProgress = true;
  locallyLocked = true;
  ++refreshSequence;
  const token = csrf;
  const provider = state.status === 'loading' ? 'google' : state.provider;
  csrf = undefined;
  notify({ status: 'anonymous', reason: 'logout-pending', provider });
  try {
    if (!token) throw new SessionChangedError();
    const response = await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-TOKEN': token } });
    if (!response.ok || (await readSession()).authenticated) throw new Error('Sign-out could not be confirmed.');
    notify({ status: 'anonymous', reason: 'logout', provider });
  } catch {
    notify({ status: 'anonymous', reason: 'logout-unconfirmed', provider });
  } finally {
    logoutInProgress = false;
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('villas.session'); channel?.postMessage({ type: 'signed-out', confirmed: state.status === 'anonymous' && state.reason === 'logout' }); channel?.close();
  }
};

export const startSignIn = () => {
  const popup = window.open('/auth/start', 'villas-signin', 'popup,width=520,height=700');
  if (!popup) throw new Error('Open sign-in in a new tab, then return here to keep your entered details.');
};

export const installSessionEvents = () => {
  localStorage.removeItem('villarosa.apiConfig');
  localStorage.removeItem('villarosa.pendingOperations.v1');
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('villas.session');
  const refresh = () => { void refreshSession(); };
  const changed = (event: MessageEvent) => {
    if (event.data === 'signed-in') void refreshSession({ explicit: true }).then(() => channel?.postMessage('received'));
    if (event.data?.type === 'signed-out') {
      locallyLocked = true; ++refreshSequence; csrf = undefined;
      const provider = state.status === 'loading' ? 'google' : state.provider;
      notify({ status: 'anonymous', reason: event.data.confirmed ? 'logout' : 'logout-unconfirmed', provider });
    }
  };
  channel?.addEventListener('message', changed);
  window.addEventListener('focus', refresh);
  refresh();
  return () => { window.removeEventListener('focus', refresh); channel?.removeEventListener('message', changed); channel?.close(); };
};
