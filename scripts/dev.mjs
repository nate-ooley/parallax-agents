import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import health from '../api/health.mjs';
import { build, DIST_DIR, PUBLIC_FILES } from './build.mjs';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};
const publicRoutes = new Map(PUBLIC_FILES.map(file => [`/${file}`, file]));
publicRoutes.set('/', 'index.html');
publicRoutes.set('/city-demo/', 'city-demo/index.html');

function textResponse(response, status, message, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  response.end(message);
}

export async function startDevServer({ port = 4175 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535.');
  await build();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/api/health' || url.pathname === '/api/health/') {
        // The shared handler only reads method, present on both IncomingMessage
        // and Web Request. This also preserves 405 behavior for TRACE/CONNECT,
        // which the Web Request constructor itself does not accept.
        const result = await health.fetch(request);
        request.resume();
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        request.resume();
        textResponse(response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
        return;
      }
      if (url.pathname === '/city-demo') {
        response.writeHead(308, { Location: `/city-demo/${url.search}`, 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); }
      catch { textResponse(response, 400, 'Invalid URL'); return; }
      const file = publicRoutes.get(pathname);
      if (!file) { textResponse(response, 404, 'Not found'); return; }
      const body = await readFile(resolve(DIST_DIR, file));
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(file)],
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      console.error('Local request failed:', error.message);
      if (!response.headersSent) textResponse(response, 500, 'Internal server error');
      else response.end();
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      accept();
    });
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]))) {
    throw new Error('Usage: npm run dev -- [--port 4175]');
  }
  const server = await startDevServer({ port: args.length ? Number(args[1]) : 4175 });
  console.log(`Parallax Agents: http://127.0.0.1:${server.address().port}`);
  console.log('Demo: /city-demo/ · Shared health endpoint: /api/health');
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
}
