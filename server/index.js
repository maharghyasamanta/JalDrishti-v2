// Server entry point with extensible routing, body parsing, CORS, admin auth, rate limiting, and audit logging.
if (process.argv.includes('--production')) {
  process.env.NODE_ENV = 'production';
}

import http from 'node:http';
import { promises as fs, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAlertsService, loadDistrictIndex, REFRESH_MS } from './service.js';
import { createEarthquakeService, REFRESH_MS as EQ_REFRESH_MS } from './earthquakes.js';
import { createRouter } from './router.js';
import { parseBody } from './body.js';
import { applyCors } from './cors.js';
import { checkAdminAuth, getAdminToken } from './auth.js';
import { adminLimiter } from './rateLimiter.js';
import { clientIp } from './ip.js';

const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url));
const ROOT_ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url));
const PUBLIC_GET_ONLY_PATHS = new Set(['/healthz', '/api/alerts', '/api/earthquakes']);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function redactError(err) {
  let msg = err instanceof Error ? err.message : String(err);
  msg = msg.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  const token = process.env.ADMIN_TOKEN;
  if (token && token.length >= 8) {
    msg = msg.split(token).join('[REDACTED]');
  }
  return msg;
}

/**
 * Zero-dependency .env loader.
 * Uses process.loadEnvFile when available, otherwise parses KEY=VALUE lines.
 * Ignores missing files and never overrides variables already set in process.env.
 */
export function loadEnvFile(envPath = ROOT_ENV_PATH, { useNative = true } = {}) {
  if (!existsSync(envPath)) return false;

  if (useNative && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
    return true;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();

    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;

    const key = line.slice(0, eqIdx).trim();
    if (!key || key in process.env) continue;

    let value = line.slice(eqIdx + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2);
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      const commentIdx = value.search(/\s+#/);
      if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
    }

    process.env[key] = value;
  }
  return true;
}

function sendJson(res, status, payload, { headers = {}, head = false, noStore = false } = {}) {
  const outHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  };
  if (noStore && !('Cache-Control' in outHeaders)) {
    outHeaders['Cache-Control'] = 'no-store';
  }
  res.writeHead(status, outHeaders);
  res.end(head ? undefined : JSON.stringify(payload));
}

async function tryServeStatic(req, res, pathname) {
  if (!existsSync(DIST_DIR)) return false;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const resolvedPath = path.resolve(DIST_DIR, relativePath);
  if (resolvedPath !== DIST_DIR && !resolvedPath.startsWith(DIST_DIR + path.sep)) {
    return false;
  }

  let targetFile = resolvedPath;
  let stat = await fs.stat(targetFile).catch(() => null);
  if (stat?.isDirectory()) {
    targetFile = path.join(targetFile, 'index.html');
    stat = await fs.stat(targetFile).catch(() => null);
  }

  if (!stat?.isFile()) {
    // SPA fallback for client routes without a file extension
    if (path.extname(relativePath)) return false;
    targetFile = path.join(DIST_DIR, 'index.html');
    stat = await fs.stat(targetFile).catch(() => null);
    if (!stat?.isFile()) return false;
  }

  const ext = path.extname(targetFile).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const cacheControl = targetFile.startsWith(path.join(DIST_DIR, 'assets') + path.sep)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';

  const content = await fs.readFile(targetFile);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': content.length,
    'Cache-Control': cacheControl,
  });
  res.end(req.method === 'HEAD' ? undefined : content);
  return true;
}

export function createHandler(alertsService, earthquakeService, { getViteMiddlewares, router: customRouter } = {}) {
  const router = customRouter || createRouter();

  // Future routes (admin, subscribe, etc.) will be added by other modules.

  return async (req, res) => {
    let isAdminPath = false;
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const method = String(req.method || 'GET').toUpperCase();
      const isHead = method === 'HEAD';
      isAdminPath = url.pathname.startsWith('/api/admin/');

      if (isAdminPath) {
        res.setHeader('Cache-Control', 'no-store');
      }

      const reqMethod = String(req.headers?.['access-control-request-method'] || '').toUpperCase();
      const isCorsPublic =
        method === 'OPTIONS'
          ? !isAdminPath && (reqMethod === 'GET' || reqMethod === 'HEAD' || (!reqMethod && PUBLIC_GET_ONLY_PATHS.has(url.pathname)))
          : !isAdminPath && (method === 'GET' || isHead);

      const corsHandled = applyCors(req, res, { public: isCorsPublic });
      if (corsHandled) return; // OPTIONS preflight already ended

      // Unknown HTTP methods (such as PATCH) => 405
      if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'].includes(method)) {
        const allow = PUBLIC_GET_ONLY_PATHS.has(url.pathname)
          ? 'GET, HEAD, OPTIONS'
          : 'GET, HEAD, POST, PUT, DELETE, OPTIONS';
        sendJson(res, 405, { error: 'Method not allowed' }, {
          headers: { Allow: allow },
          head: isHead,
          noStore: isAdminPath,
        });
        return;
      }

      // Public GET/HEAD-only endpoints handled BEFORE auth, rate-limit, and body parsing
      if (PUBLIC_GET_ONLY_PATHS.has(url.pathname)) {
        if (method !== 'GET' && !isHead) {
          sendJson(res, 405, { error: 'Method not allowed' }, {
            headers: { Allow: 'GET, HEAD, OPTIONS' },
          });
          return;
        }

        if (url.pathname === '/healthz') {
          sendJson(res, 200, { ok: true }, { head: isHead });
          return;
        }

        if (url.pathname === '/api/alerts') {
          const payload = alertsService?.getPayload();
          if (!payload) {
            sendJson(res, 503, {
              generatedAt: null,
              upstreamOk: false,
              alerts: [],
              unresolvedCount: 0,
              error: 'Alert data not available yet',
            }, {
              headers: { 'Cache-Control': 'no-store' },
              head: isHead,
            });
            return;
          }
          sendJson(res, 200, payload, {
            headers: { 'Cache-Control': 'public, max-age=300' },
            head: isHead,
          });
          return;
        }

        if (url.pathname === '/api/earthquakes') {
          const payload = earthquakeService?.getPayload();
          if (!payload) {
            sendJson(res, 503, {
              generatedAt: null,
              ok: false,
              quakes: [],
              totalCount: 0,
              error: 'Earthquake data not available yet',
            }, {
              headers: { 'Cache-Control': 'no-store' },
              head: isHead,
            });
            return;
          }
          sendJson(res, 200, payload, {
            headers: { 'Cache-Control': 'public, max-age=300' },
            head: isHead,
          });
          return;
        }
      }

      // Admin rate-limit then auth applies ONLY to paths starting with /api/admin/
      if (isAdminPath) {
        const limit = adminLimiter.hit(clientIp(req));
        if (!limit.allowed) {
          const retryAfterSec = String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000)));
          sendJson(res, 429, { error: 'Rate limit exceeded' }, {
            headers: { 'Retry-After': retryAfterSec },
            head: isHead,
            noStore: true,
          });
          return;
        }

        const r = await checkAdminAuth(req);
        if (!r.ok) {
          const errBody = typeof r.error === 'string' ? { error: r.error } : r.error;
          sendJson(res, r.status, errBody, {
            headers: r.headers || {},
            head: isHead,
            noStore: true,
          });
          return;
        }
      }

      // Parse JSON bodies for POST/PUT
      if (method === 'POST' || method === 'PUT') {
        const bodyResult = await parseBody(req);
        if (!bodyResult.ok) {
          const { status, body, closeConnection } = bodyResult.error;
          sendJson(res, status, body, {
            headers: closeConnection ? { Connection: 'close' } : {},
            noStore: isAdminPath,
          });
          return;
        }
        req.body = bodyResult.data;
      }

      const match = router.match(req);
      if (match) {
        req.params = match.params;
        await match.handler(req, res);
        if (!res.writableEnded && !res.ended) res.end();
        return;
      }

      if (req.routeError) {
        sendJson(res, req.routeError.status, { error: req.routeError.error }, {
          head: isHead,
          noStore: isAdminPath,
        });
        return;
      }

      if ((method === 'GET' || isHead) && !url.pathname.startsWith('/api/')) {
        if (getViteMiddlewares) {
          const middlewares = await getViteMiddlewares();
          if (middlewares) {
            await new Promise((resolve, reject) => {
              middlewares(req, res, (err) => (err ? reject(err) : resolve()));
            });
            if (res.writableEnded || res.ended) return;
          }
        }
        const served = await tryServeStatic(req, res, url.pathname);
        if (served) return;
      }

      sendJson(res, 404, { error: 'Not found' }, { head: isHead, noStore: isAdminPath });
    } catch (err) {
      console.error(new Date().toISOString(), '[request error]', redactError(err));
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'Internal server error' }, {
          head: req?.method === 'HEAD',
          noStore: isAdminPath,
        });
      } else if (!res.writableEnded && !res.ended) {
        res.end();
      }
    }
  };
}

export function start() {
  loadEnvFile();
  const log = (...a) => console.log(new Date().toISOString(), ...a);

  if (!getAdminToken()) {
    log('Warning: ADMIN_TOKEN is missing or shorter than 24 characters — admin API disabled');
  }

  const alertsService = createAlertsService({ districtIndex: loadDistrictIndex(), log });
  alertsService.refresh();
  const alertsTimer = setInterval(() => alertsService.refresh(), REFRESH_MS);
  alertsTimer.unref?.();

  const earthquakeService = createEarthquakeService({ log });
  earthquakeService.refresh();
  const eqTimer = setInterval(() => earthquakeService.refresh(), EQ_REFRESH_MS);
  eqTimer.unref?.();

  const isProd = process.env.NODE_ENV === 'production';
  let vitePromise = null;
  const getViteMiddlewares = isProd
    ? null
    : () => {
        if (!vitePromise) {
          vitePromise = import('vite')
            .then(({ createServer }) =>
              createServer({
                server: { middlewareMode: true, hmr: false, allowedHosts: true },
                appType: 'spa',
              }),
            )
            .then((vite) => vite.middlewares)
            .catch((err) => {
              log('Vite middleware unavailable, falling back to static dist:', err.message);
              return null;
            });
        }
        return vitePromise;
      };

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  const server = http.createServer(createHandler(alertsService, earthquakeService, { getViteMiddlewares }));

  server.on('error', (err) => {
    if (err?.code === 'EADDRINUSE') {
      console.error(new Date().toISOString(), `Port ${port} on ${host} is already in use (EADDRINUSE).`);
    } else {
      console.error(new Date().toISOString(), '[server error]', redactError(err));
    }
    process.exit(1);
  });

  server.listen(port, host, () => log(`Server listening on http://${host}:${port} (alerts + earthquakes)`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.on('uncaughtException', (err) => console.error(new Date().toISOString(), '[uncaughtException]', redactError(err)));
  process.on('unhandledRejection', (reason) => console.error(new Date().toISOString(), '[unhandledRejection]', redactError(reason)));
  start();
}
