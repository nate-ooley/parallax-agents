import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_SECONDS = 8 * 60 * 60;
export const PRIVATE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});

// This single-owner pilot uses a generated 256-bit access key. It is not a
// customer account/password system; rotating the key invalidates all sessions.
function configuredKey() {
  const key = process.env.PARALLAX_VIEWER_KEY;
  return typeof key === 'string' && /^[A-Za-z0-9_-]{43,}$/.test(key) ? key : null;
}
export function authConfigured() { return configuredKey() !== null; }
function equal(a, b) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function allowedOrigin(request) {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return url.origin;
  if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !process.env.VERCEL) return url.origin;
  return null;
}
function cookieName(request) {
  return new URL(request.url).protocol === 'https:' ? '__Host-parallax_live' : 'parallax_live_local';
}
function signature(payload, request) {
  return createHmac('sha256', configuredKey()).update(`parallax-live-session\n${allowedOrigin(request)}\n${payload}`).digest('base64url');
}
export function acceptsKey(candidate) {
  const key = configuredKey();
  return !!key && typeof candidate === 'string' && equal(candidate, key);
}
export function isSameOrigin(request) {
  const origin = allowedOrigin(request);
  return !!origin && request.headers.get('origin') === origin;
}
export function sessionCookie(request, now = Date.now()) {
  if (!configuredKey() || !allowedOrigin(request)) throw new Error('Private access is not configured');
  const issued = Math.floor(now / 1000);
  const payload = `1.${issued}.${issued + SESSION_SECONDS}.${randomBytes(24).toString('base64url')}`;
  return serializeCookie(request, `${payload}.${signature(payload, request)}`, SESSION_SECONDS);
}
function serializeCookie(request, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
export function clearSessionCookie(request) { return serializeCookie(request, '', 0); }
export function requireSession(request, now = Date.now()) {
  if (!configuredKey() || !allowedOrigin(request)) return false;
  const name = `${cookieName(request)}=`;
  const cookies = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(name));
  if (cookies.length !== 1) return false;
  const token = cookies[0].slice(name.length);
  if (!/^1\.\d{10}\.\d{10}\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const [version, issued, expiry, nonce, mac] = token.split('.');
  const seconds = Math.floor(now / 1000);
  if (Number(issued) > seconds + 30 || Number(expiry) <= seconds || Number(expiry) - Number(issued) !== SESSION_SECONDS) return false;
  return equal(mac, signature(`${version}.${issued}.${expiry}.${nonce}`, request));
}
