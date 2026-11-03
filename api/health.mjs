const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

// Vercel's Web Standard fetch export. This reports only server reachability;
// demo mode does not claim that customer integrations or AI providers are live.
export default {
  fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return Response.json({ ok: false, error: 'Method not allowed' }, {
        status: 405,
        headers: { ...headers, Allow: 'GET, HEAD' },
      });
    }
    const payload = {
      ok: true,
      service: 'parallax-agents',
      mode: 'demo',
      checkedAt: new Date().toISOString(),
    };
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(payload), {
      status: 200,
      headers,
    });
  },
};
