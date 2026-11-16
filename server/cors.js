// CORS middleware for the zero-dependency server.
// Public GET/HEAD: Access-Control-Allow-Origin = CORS_ORIGIN or '*'.
// Non-public (POST/PUT/DELETE, /api/admin/*, and their preflights): strict allowlist, never '*'.

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function resolveAllowedList(allowedOriginOption) {
  const raw = allowedOriginOption !== undefined ? allowedOriginOption : process.env.CORS_ORIGIN;
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== '*');
  }
  return process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS;
}

/**
 * Apply CORS headers and handle OPTIONS preflight requests.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ public?: boolean, allowedOrigin?: string }} [options]
 * @returns {boolean} true when preflight was handled and response ended
 */
export function applyCors(req, res, { public: isPublic = false, allowedOrigin } = {}) {
  res.setHeader('Vary', 'Origin');

  if (isPublic) {
    const rawPublic = allowedOrigin !== undefined ? allowedOrigin : process.env.CORS_ORIGIN;
    const corsOrigin = typeof rawPublic === 'string' && rawPublic.trim() ? rawPublic.trim() : '*';

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return true;
    }

    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    return false;
  }

  const reqOrigin = typeof req?.headers?.origin === 'string' ? req.headers.origin.trim() : '';
  const allowlist = resolveAllowedList(allowedOrigin);
  const matchedOrigin = reqOrigin && allowlist.includes(reqOrigin) ? reqOrigin : null;

  if (req.method === 'OPTIONS') {
    if (matchedOrigin) {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': matchedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
      });
    } else {
      res.writeHead(204);
    }
    res.end();
    return true;
  }

  if (matchedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', matchedOrigin);
  }
  return false;
}
