import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { requireSession, sessionCookie, SESSION_SECONDS } from './live-auth.mjs';
import session from '../api/live-session.mjs';

const key = randomBytes(32).toString('base64url');
process.env.PARALLAX_VIEWER_KEY = key;
const url = 'https://parallax.example/api/live-session';
const request = (method = 'GET', body, headers = {}) => new Request(url, { method, headers: { Origin: 'https://parallax.example', 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test('owner login issues a protected host-scoped session and does not expose the key', async () => {
  const result = await session.fetch(request('POST', { key }));
  assert.equal(result.status, 200);
  const cookie = result.headers.get('set-cookie');
  for (const part of ['__Host-parallax_live=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(part));
  assert.ok(!cookie.includes(key));
  assert.ok(requireSession(request('GET', undefined, { cookie })));
  assert.deepEqual(await result.json(), { authenticated: true });
  assert.equal(result.headers.get('cache-control'), 'no-store');
});
test('tampering, expiration, another host, duplicate cookies, and key rotation invalidate access', () => {
  const now = Date.now();
  const cookie = sessionCookie(request(), now).split(';')[0];
  const withCookie = value => request('GET', undefined, { cookie: value });
  assert.equal(requireSession(withCookie(`${cookie.slice(0,-1)}!`), now), false);
  const macStart = cookie.lastIndexOf('.') + 1;
  const modifiedMac = `${cookie.slice(0, macStart)}${cookie[macStart] === 'A' ? 'B' : 'A'}${cookie.slice(macStart + 1)}`;
  assert.equal(requireSession(withCookie(modifiedMac), now), false);
  assert.equal(requireSession(withCookie(cookie), now + SESSION_SECONDS * 1000), false);
  assert.equal(requireSession(new Request('https://other.example/api/highlevel', { headers: { cookie } }), now), false);
  assert.equal(requireSession(withCookie(`${cookie}; ${cookie}`), now), false);
  process.env.PARALLAX_VIEWER_KEY = randomBytes(32).toString('base64url');
  assert.equal(requireSession(withCookie(cookie), now), false);
  process.env.PARALLAX_VIEWER_KEY = key;
});
test('cross-origin login and logout are rejected; wrong key does not issue a cookie', async () => {
  for (const method of ['POST', 'DELETE']) assert.equal((await session.fetch(request(method, method === 'POST' ? { key } : undefined, { Origin:'https://other.example' }))).status, 403);
  const result = await session.fetch(request('POST', { key: 'wrong' }));
  assert.equal(result.status, 401);
  assert.equal(result.headers.get('set-cookie'), null);
});
test('bad body, oversized body, and unsupported methods fail without granting access', async () => {
  assert.equal((await session.fetch(request('POST', { key: 'x'.repeat(3000) }))).status, 400);
  assert.equal((await session.fetch(new Request(url, { method:'POST', headers:{ Origin:'https://parallax.example','Content-Type':'application/json' }, body:'invalid' }))).status, 400);
  assert.equal((await session.fetch(request('PUT', {}))).status, 405);
});
test('missing configuration fails closed and logout clears the session', async () => {
  delete process.env.PARALLAX_VIEWER_KEY;
  assert.equal((await session.fetch(request())).status, 503);
  assert.equal(requireSession(request()), false);
  process.env.PARALLAX_VIEWER_KEY = key;
  const result = await session.fetch(request('DELETE'));
  assert.equal(result.status, 200);
  assert.ok(result.headers.get('set-cookie').includes('Max-Age=0'));
});
