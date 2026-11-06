import { acceptsKey, authConfigured, clearSessionCookie, isSameOrigin, PRIVATE_HEADERS, requireSession, sessionCookie } from '../lib/live-auth.mjs';

const json = (body, status = 200, extra = {}) => Response.json(body, { status, headers: { ...PRIVATE_HEADERS, ...extra } });
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  let size = 0; const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

export default {
  async fetch(request) {
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST, DELETE' });
    if (!authConfigured()) return json({ error: 'Private access has not been configured.' }, 503);
    if (request.method === 'GET') return json({ authenticated: requireSession(request) }, requireSession(request) ? 200 : 401);
    if (!isSameOrigin(request)) return json({ error: 'Open the city and try again.' }, 403);
    if (request.method === 'DELETE') return json({ authenticated: false }, 200, { 'Set-Cookie': clearSessionCookie(request) });
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'Invalid request format.' }, 415);
    let body;
    try { body = await readBody(request); }
    catch { return json({ error: 'Invalid request.' }, 400); }
    if (!acceptsKey(body?.key)) return json({ error: 'That access key was not recognized.' }, 401);
    return json({ authenticated: true }, 200, { 'Set-Cookie': sessionCookie(request) });
  },
};
