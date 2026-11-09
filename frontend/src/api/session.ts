import { useSyncExternalStore } from 'react';
import type { StaffView } from './generated';

export const API_BASE = '/api/v1';
export type Staff = Required<Pick<StaffView, 'id' | 'email' | 'role' | 'active' | 'version'>>;
export type BusinessMembership = { businessId: string; businessName: string; staff: Staff; permissions: string[] };
type IdentitySession = {
  identityId: string;
  identityEmail: string;
  generation: string;
  expiresAt: Date;
  memberships: BusinessMembership[];
  provider: 'google' | 'synthetic';
};
export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' | 'unavailable'; reason?: string; provider: 'google' | 'synthetic' }
  | (IdentitySession & { status: 'choosing'; reason?: string })
  | (IdentitySession & { status: 'restricted'; reason: string })
  | (IdentitySession & { status: 'authenticated'; staff: Staff; permissions: string[]; propertyId: string; propertyName: string });
type SessionSnapshot = IdentitySession & { compatibility?: { businessId: string; staffId: string } };

const businessShape = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const businessPrefix = (id: string) => {
  if (!businessShape.test(id)) throw new Error('Choose a valid business.');
  return `/businesses/${id}`;
};
export const selectedBusinessId = () => /^\/businesses\/([a-z0-9][a-z0-9-]{0,63})(?:\/|$)/.exec(window.location.pathname)?.[1];
export const workspaceScope = (identityId: string, businessId: string, actorId: string) => JSON.stringify([identityId, businessId, actorId]);

let state: SessionState = { status: 'loading' };
let snapshot: SessionSnapshot | undefined;
let csrf: string | undefined;
let epoch = 0;
let scopeController = new AbortController();
let refreshSequence = 0;
let logoutInProgress = false;
let locallyLocked = false;
let ownerKey = 'anonymous';
let identityKey: string | undefined;
let privacyEpoch = 0;
const lastLocations = new Map<string, string>();
const listeners = new Set<() => void>();
const signature = (value: SessionState) => value.status === 'authenticated'
  ? JSON.stringify([value.identityId, value.propertyId, value.staff.id, value.generation, value.permissions]) : undefined;
const notify = (next: SessionState) => {
  if (state.status === 'authenticated' && selectedBusinessId() === state.propertyId) {
    lastLocations.set(workspaceScope(state.identityId, state.propertyId, state.staff.id), `${window.location.pathname}${window.location.search}${window.location.hash}`);
  }
  if ('identityId' in next) {
    if (identityKey && identityKey !== next.identityId) {
      lastLocations.clear();
      privacyEpoch++;
      ownerKey = `identity:${next.identityId}`;
    }
    identityKey = next.identityId;
    if (next.status === 'authenticated') ownerKey = next.staff.id;
  } else if (next.status === 'anonymous' && next.reason?.startsWith('logout')) {
    if (identityKey) privacyEpoch++;
    identityKey = undefined;
    ownerKey = 'anonymous';
    lastLocations.clear();
  }
  if (next.status !== 'authenticated' || signature(state) !== signature(next)) {
    epoch++;
    scopeController.abort();
    scopeController = new AbortController();
  }
  state = next;
  for (const listener of listeners) listener();
};
const projectSnapshot = () => {
  if (!snapshot) return;
  const businessId = selectedBusinessId();
  if (!businessId) {
    notify(window.location.pathname.startsWith('/businesses/')
      ? { ...snapshot, status: 'restricted', reason: 'This business address is invalid. Choose an authorized business.' }
      : { ...snapshot, status: 'choosing' });
    return;
  }
  const membership = snapshot.memberships.find((item) => item.businessId === businessId);
  if (!membership) {
    notify({ ...snapshot, status: 'restricted', reason: 'This business is unavailable for your account. Choose another business or sign in again to renew access.' });
    return;
  }
  notify({ ...snapshot, status: 'authenticated', staff: membership.staff, permissions: membership.permissions, propertyId: membership.businessId, propertyName: membership.businessName });
};
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSession = () => state;
export const getSessionEpoch = () => epoch;
export const getSessionOwnerKey = () => ownerKey;
export const getSessionIdentityKey = () => `${identityKey ?? 'anonymous'}:${privacyEpoch}`;
export const useStaffSession = () => useSyncExternalStore(subscribe, getSession);
export const legacyOperationScope = () => state.status === 'authenticated' && snapshot?.compatibility?.businessId === state.propertyId && snapshot.compatibility.staffId === state.staff.id
  ? JSON.stringify([API_BASE, state.staff.id]) : undefined;

export class SessionChangedError extends Error {
  constructor() { super('The staff session changed. Review your business and details before submitting again.'); }
}
export const assertWorkspaceCurrent = (expectedEpoch: number, businessId: string, actorId: string) => {
  if (state.status !== 'authenticated' || epoch !== expectedEpoch || state.propertyId !== businessId || state.staff.id !== actorId || selectedBusinessId() !== businessId) throw new SessionChangedError();
};
export const selectBusiness = (businessId: string) => {
  const target = snapshot?.memberships.find((item) => item.businessId === businessId);
  if (!target || !snapshot || !('identityId' in state)) throw new SessionChangedError();
  if (state.status === 'authenticated' && selectedBusinessId() === state.propertyId) {
    lastLocations.set(workspaceScope(state.identityId, state.propertyId, state.staff.id), `${window.location.pathname}${window.location.search}${window.location.hash}`);
  }
  const targetPrefix = businessPrefix(businessId);
  const remembered = lastLocations.get(workspaceScope(snapshot.identityId, businessId, target.staff.id));
  const destination = remembered?.startsWith(`${targetPrefix}/`) ? remembered : `${targetPrefix}/today`;
  window.history.pushState(null, '', destination);
  projectSnapshot();
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export const sessionFetch: typeof fetch = async (input, init) => {
  if (state.status !== 'authenticated') throw new SessionChangedError();
  const started = epoch;
  const businessId = state.propertyId;
  const actorId = state.staff.id;
  const guard = () => assertWorkspaceCurrent(started, businessId, actorId);
  guard();
  const request = input instanceof Request ? input : undefined;
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers ?? request?.headers);
  headers.set('X-Villas-Business', businessId);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrf) throw new SessionChangedError();
    headers.set('X-CSRF-TOKEN', csrf);
  }
  const callerSignal = init?.signal ?? request?.signal;
  const signal = callerSignal ? AbortSignal.any([scopeController.signal, callerSignal]) : scopeController.signal;
  const response = await fetch(input, { ...init, headers, credentials: 'same-origin', signal });
  guard();
  if (response.status === 403) {
    const denied = await response.clone().json().catch(() => undefined) as { code?: string } | undefined;
    guard();
    if (denied?.code === 'BUSINESS_ACCESS_DENIED') {
      if (snapshot) {
        snapshot = { ...snapshot, memberships: snapshot.memberships.filter((item) => item.businessId !== businessId) };
        projectSnapshot();
      }
      await refreshSession();
    }
  }
  if (response.status === 401) {
    ++refreshSequence;
    snapshot = undefined;
    csrf = undefined;
    notify({ status: 'anonymous', reason: 'expired', provider: state.provider });
  }
  const wrap = (source: Response): Response => new Proxy(source, { get(target, property) {
    if (property === 'clone') return () => wrap(target.clone());
    if (['json', 'text', 'blob', 'arrayBuffer', 'formData'].includes(String(property))) return async () => { const value = await (target[property as 'json'] as () => Promise<unknown>).call(target); guard(); return value; };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return wrap(response);
};

export const scopedSessionFetch = (staffId: string, expectedEpoch: number, businessId?: string): typeof fetch => {
  const capturedBusiness = businessId ?? (state.status === 'authenticated' ? state.propertyId : undefined);
  return async (input, init) => {
    if (!capturedBusiness) throw new SessionChangedError();
    assertWorkspaceCurrent(expectedEpoch, capturedBusiness, staffId);
    return sessionFetch(input, init);
  };
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const readSession = async () => {
  const response = await fetch(`${API_BASE}/auth/session`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Your session could not be confirmed. Check your connection and try again.');
  const body: unknown = await response.json();
  if (!record(body) || typeof body.authenticated !== 'boolean') throw new Error('The session response could not be confirmed.');
  return body;
};
const parseSnapshot = (body: Record<string, unknown>): SessionSnapshot => {
  const expiry = new Date(String(body.expiresAt));
  if (!record(body.identity) || !nonempty(body.identity.id) || !nonempty(body.identity.email) || !nonempty(body.generation) || !nonempty(body.csrfToken) || Number.isNaN(expiry.getTime()) || !Array.isArray(body.memberships)) throw new Error('The session response could not be confirmed.');
  const businesses = new Set<string>();
  const actors = new Set<string>();
  const memberships = body.memberships.map((item: unknown): BusinessMembership => {
    if (!record(item) || !nonempty(item.businessId) || !businessShape.test(item.businessId) || !nonempty(item.businessName) || item.businessName.length > 200 || !record(item.staff)
      || !nonempty(item.staff.id) || !nonempty(item.staff.email) || item.staff.role !== 'OWNER' || item.staff.active !== true || typeof item.staff.version !== 'number' || !Number.isSafeInteger(item.staff.version) || item.staff.version < 0
      || !Array.isArray(item.permissions) || !item.permissions.every(nonempty) || businesses.has(item.businessId) || actors.has(item.staff.id)) throw new Error('The session memberships could not be confirmed.');
    businesses.add(item.businessId); actors.add(item.staff.id);
    return { businessId: item.businessId, businessName: item.businessName, staff: item.staff as Staff, permissions: [...item.permissions] as string[] };
  });
  const compatibility = typeof body.propertyId === 'string' && record(body.staff) && typeof body.staff.id === 'string'
    && memberships.some((item) => item.businessId === body.propertyId && item.staff.id === (body.staff as Record<string, unknown>).id)
    ? { businessId: body.propertyId, staffId: body.staff.id } : undefined;
  return { identityId: body.identity.id, identityEmail: body.identity.email, generation: body.generation, expiresAt: expiry, memberships, provider: body.provider === 'synthetic' ? 'synthetic' : 'google', compatibility };
};

export const refreshSession = async (options?: { explicit: boolean }) => {
  if (logoutInProgress || (locallyLocked && !options?.explicit)) return;
  if (options?.explicit) locallyLocked = false;
  const sequence = ++refreshSequence;
  try {
    const body = await readSession();
    if (sequence !== refreshSequence) return;
    const provider = body.provider === 'synthetic' ? 'synthetic' : 'google';
    if (!body.authenticated) { snapshot = undefined; csrf = undefined; notify({ status: 'anonymous', provider }); return; }
    snapshot = parseSnapshot(body);
    csrf = String(body.csrfToken);
    projectSnapshot();
  } catch (error) {
    if (sequence !== refreshSequence) return;
    snapshot = undefined;
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
  snapshot = undefined;
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
      locallyLocked = true; ++refreshSequence; snapshot = undefined; csrf = undefined;
      const provider = state.status === 'loading' ? 'google' : state.provider;
      notify({ status: 'anonymous', reason: event.data.confirmed ? 'logout' : 'logout-unconfirmed', provider });
    }
  };
  channel?.addEventListener('message', changed);
  window.addEventListener('focus', refresh);
  window.addEventListener('popstate', projectSnapshot, true);
  refresh();
  return () => { window.removeEventListener('focus', refresh); window.removeEventListener('popstate', projectSnapshot, true); channel?.removeEventListener('message', changed); channel?.close(); };
};
