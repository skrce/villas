import { useSyncExternalStore } from 'react';
import type { StaffView } from './generated';

export const API_BASE = '/api/v1';
export type Staff = Required<Pick<StaffView, 'id' | 'email' | 'role' | 'active' | 'version'>>;
export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' | 'unavailable'; reason?: string; provider: 'google' | 'synthetic' }
  | { status: 'authenticated'; staff: Staff; expiresAt: Date; permissions: string[]; provider: 'google' | 'synthetic' };

let state: SessionState = { status: 'loading' };
let csrf: string | undefined;
let epoch = 0;
let refreshSequence = 0;
let ownerKey = 'anonymous';
const listeners = new Set<() => void>();
const notify = (next: SessionState) => {
  const previousId = state.status === 'authenticated' ? state.staff.id : undefined;
  const nextId = next.status === 'authenticated' ? next.staff.id : undefined;
  if (nextId) ownerKey = nextId;
  if (previousId !== nextId || next.status !== 'authenticated') epoch++;
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
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (state.status !== 'authenticated' || !csrf) throw new SessionChangedError();
    headers.set('X-CSRF-TOKEN', csrf);
  }
  const response = await fetch(input, { ...init, headers, credentials: 'same-origin' });
  if (started !== epoch) throw new SessionChangedError();
  if (response.status === 401) {
    ++refreshSequence;
    csrf = undefined;
    notify({ status: 'anonymous', reason: 'expired', provider: state.status === 'loading' ? 'google' : state.provider });
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

export const refreshSession = async () => {
  const sequence = ++refreshSequence;
  try {
    const body = await readSession();
    if (sequence !== refreshSequence) return;
    const provider = body.provider === 'synthetic' ? 'synthetic' : 'google';
    if (!body.authenticated) { csrf = undefined; notify({ status: 'anonymous', provider }); return; }
    const staff = body.staff as Partial<Staff> | null;
    const expiry = new Date(String(body.expiresAt));
    if (!staff || typeof staff.id !== 'string' || !staff.id || typeof staff.email !== 'string' || staff.role !== 'OWNER' || staff.active !== true
      || typeof staff.version !== 'number' || !Number.isSafeInteger(staff.version) || staff.version < 0
      || typeof body.csrfToken !== 'string' || !body.csrfToken || Number.isNaN(expiry.getTime())
      || !Array.isArray(body.permissions) || !body.permissions.every((permission) => typeof permission === 'string')) throw new Error('The session response could not be confirmed.');
    csrf = body.csrfToken;
    notify({ status: 'authenticated', staff: staff as Staff, expiresAt: expiry, permissions: body.permissions, provider });
  } catch (error) {
    if (sequence !== refreshSequence) return;
    csrf = undefined;
    notify({ status: 'unavailable', reason: error instanceof Error ? error.message : 'Your session could not be confirmed.', provider: state.status === 'loading' ? 'google' : state.provider });
  }
};

export const logout = async () => {
  const sequence = ++refreshSequence;
  const provider = state.status === 'loading' ? 'google' : state.provider;
  try {
    const response = await sessionFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    if (!response.ok || (await readSession()).authenticated) throw new Error('Sign-out could not be confirmed. Check your session before leaving this browser.');
    if (sequence !== refreshSequence) return;
    csrf = undefined; notify({ status: 'anonymous', reason: 'logout', provider });
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('villas.session'); channel?.postMessage('changed'); channel?.close();
  } catch {
    if (sequence !== refreshSequence) return;
    csrf = undefined; notify({ status: 'anonymous', reason: 'logout-unconfirmed', provider });
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
  const changed = (event: MessageEvent) => { if (event.data === 'changed') void refreshSession().then(() => channel?.postMessage('received')); };
  channel?.addEventListener('message', changed);
  window.addEventListener('focus', refresh);
  refresh();
  return () => { window.removeEventListener('focus', refresh); channel?.removeEventListener('message', changed); channel?.close(); };
};
