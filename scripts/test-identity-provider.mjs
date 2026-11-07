import { createServer } from 'node:http';
import { generateKeyPairSync, randomBytes, sign, timingSafeEqual } from 'node:crypto';

if (!['local', 'test'].includes(process.env.VILLAS_MODE) || process.env.VILLAS_AUTH_PROVIDER !== 'synthetic') {
  throw new Error('The synthetic identity provider requires explicit local/test configuration.');
}
const issuer = new URL(process.env.VILLAS_SYNTHETIC_ISSUER);
const callback = new URL('/login/oauth2/code/google', process.env.VILLAS_PUBLIC_URL);
const loopback = (url) => url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
if (!loopback(issuer) || !loopback(callback)) throw new Error('Synthetic identity endpoints must use loopback HTTP origins.');
const client = process.env.VILLAS_GOOGLE_CLIENT_ID;
const secret = process.env.VILLAS_GOOGLE_CLIENT_SECRET;
if (!client || !secret) throw new Error('Synthetic client configuration is required.');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'villas-synthetic', use: 'sig', alg: 'RS256' };
const requests = new Map();
const codes = new Map();
const opaque = () => randomBytes(24).toString('base64url');
const identities = {
  owner: { sub: 'synthetic-owner', email: 'owner@example.test', email_verified: true },
  second: { sub: 'synthetic-second-owner', email: 'second-owner@example.test', email_verified: true },
  uninvited: { sub: 'synthetic-uninvited', email: 'uninvited@example.test', email_verified: true, roles: ['OWNER'] },
  unverified: { sub: 'synthetic-unverified', email: 'owner@example.test', email_verified: false },
};
const output = (response, status, body, type = 'application/json') => {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const body = async (request) => {
  let value = '';
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 8192) throw new Error('Request too large.');
  }
  return new URLSearchParams(value);
};
const matchesSecret = (value) => {
  const actual = Buffer.from(value ?? '');
  const expected = Buffer.from(`Basic ${Buffer.from(`${client}:${secret}`).toString('base64')}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const jwt = (claims) => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.${sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url')}`;
};
const cleanup = () => {
  for (const map of [requests, codes]) for (const [key, entry] of map) if (entry.expires <= Date.now()) map.delete(key);
};
const server = createServer(async (request, response) => {
  try {
    cleanup();
    const url = new URL(request.url, issuer);
    if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      return output(response, 200, { issuer: issuer.origin, authorization_endpoint: `${issuer.origin}/authorize`, token_endpoint: `${issuer.origin}/token`, jwks_uri: `${issuer.origin}/jwks`, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'] });
    }
    if (request.method === 'GET' && url.pathname === '/jwks') return output(response, 200, { keys: [jwk] });
    if (request.method === 'GET' && url.pathname === '/authorize') {
      const params = url.searchParams;
      if (params.get('client_id') !== client || params.get('redirect_uri') !== callback.href || params.get('response_type') !== 'code' || !params.get('state') || !params.get('nonce') || requests.size >= 1000) {
        return output(response, 400, { error: 'invalid_request' });
      }
      const handle = opaque();
      requests.set(handle, { state: params.get('state'), nonce: params.get('nonce'), expires: Date.now() + 120_000 });
      return output(response, 200, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Villas synthetic sign-in</title><body><main><h1>Local test identity provider</h1><p>This is synthetic authentication for a private Villas test database.</p><form method="post" action="/choose"><input type="hidden" name="handle" value="${handle}"><button name="identity" value="owner">Synthetic Owner</button><button name="identity" value="second">Second synthetic Owner</button><button name="identity" value="uninvited">Uninvited account</button><button name="identity" value="unverified">Unverified account</button></form></main></body></html>`, 'text/html; charset=utf-8');
    }
    if (request.method === 'POST' && url.pathname === '/choose') {
      const form = await body(request);
      const pending = requests.get(form.get('handle'));
      requests.delete(form.get('handle'));
      const identity = identities[form.get('identity')];
      if (!pending || !identity || pending.expires <= Date.now()) return output(response, 400, { error: 'invalid_request' });
      const code = opaque();
      codes.set(code, { ...pending, identity, expires: Date.now() + 60_000 });
      const location = new URL(callback);
      location.searchParams.set('code', code); location.searchParams.set('state', pending.state);
      response.writeHead(302, { Location: location.href, 'Cache-Control': 'no-store' });
      return response.end();
    }
    if (request.method === 'POST' && url.pathname === '/token') {
      if (!matchesSecret(request.headers.authorization)) return output(response, 401, { error: 'invalid_client' });
      const form = await body(request);
      const pending = codes.get(form.get('code'));
      codes.delete(form.get('code'));
      if (!pending || pending.expires <= Date.now() || form.get('grant_type') !== 'authorization_code' || form.get('redirect_uri') !== callback.href) return output(response, 400, { error: 'invalid_grant' });
      const now = Math.floor(Date.now() / 1000);
      return output(response, 200, { token_type: 'Bearer', access_token: opaque(), expires_in: 300, scope: 'openid email profile', id_token: jwt({ iss: issuer.origin, aud: client, ...pending.identity, iat: now, exp: now + 300, nonce: pending.nonce }) });
    }
    output(response, 404, { error: 'not_found' });
  } catch {
    output(response, 400, { error: 'invalid_request' });
  }
});
if (process.env.VILLAS_CONTAINER_REHEARSAL && !/^e2e-[a-f0-9]{12}$/.test(process.env.VILLAS_LOCAL_INSTANCE ?? '')) throw new Error('A container fixture requires a disposable browser instance.');
server.listen(Number(issuer.port), process.env.VILLAS_CONTAINER_REHEARSAL === '1' ? '0.0.0.0' : '127.0.0.1', () => console.log('Villas synthetic identity provider is ready in its private test environment.'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
