// CORS middleware for the zero‑dependency server.
// applyCors(req, res, options)
// options: { public: boolean, allowedOrigin?: string }

export function applyCors(req, res, { public: isPublic, allowedOrigin }) {
  const origin = req.headers.origin || '*';
  const corsOrigin = isPublic ? '*' : allowedOrigin || '*';
  // Always set Vary header for origin
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  // For preflight
  if (req.method === 'OPTIONS') {
    const allowMethods = 'GET, POST, PUT, DELETE, OPTIONS';
    const allowHeaders = 'Authorization, Content-Type';
    res.writeHead(204, {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': allowMethods,
      'Access-Control-Allow-Headers': allowHeaders,
    });
    return true; // handled
  }
  // For actual requests, add simple headers (no need for methods here)
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  return false; // not handled, continue
}
