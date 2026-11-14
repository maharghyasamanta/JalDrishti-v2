// Server entry point with extensible routing, body parsing, CORS, admin auth, rate limiting, and audit logging.
import http from 'node:http';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAlertsService, loadDistrictIndex, REFRESH_MS } from './service.js';
import { createEarthquakeService, REFRESH_MS as EQ_REFRESH_MS } from './earthquakes.js';
import { createRouter } from './router.js';
import { parseBody } from './body.js';
import { applyCors } from './cors.js';
import { checkAdminAuth } from './auth.js';
import { checkRateLimit } from './rateLimiter.js';
import { auditLog } from './audit.js';

const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url));

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

export function createHandler(alertsService, earthquakeService) {
  const router = createRouter();

  // Public GET routes – unchanged behavior
  router.add('GET', '/healthz', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  router.add('GET', '/api/alerts', (req, res) => {
    const payload = alertsService.getPayload();
    if (!payload) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ generatedAt: null, upstreamOk: false, alerts: [], unresolvedCount: 0, error: 'Alert data not available yet' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' });
    res.end(JSON.stringify(payload));
  });

  router.add('GET', '/api/earthquakes', (req, res) => {
    const payload = earthquakeService.getPayload();
    if (!payload) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ generatedAt: null, ok: false, quakes: [], totalCount: 0, error: 'Earthquake data not available yet' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' });
    res.end(JSON.stringify(payload));
  });

  // Future routes (admin, subscribe, etc.) will be added by other modules.

  return async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const isPublic = req.method === 'GET' || req.method === 'HEAD';
    const corsHandled = applyCors(req, res, { public: isPublic, allowedOrigin: process.env.CORS_ORIGIN || '*' });
    if (corsHandled) return; // OPTIONS preflight already sent

    // Only allow the listed HTTP methods
    if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'].includes(req.method)) {
      res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'GET, HEAD, POST, PUT, DELETE, OPTIONS' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // Admin/auth protection for admin paths or any non‑GET public POST routes
    const needsAuth = url.pathname.startsWith('/api/admin/') || (!isPublic && req.method !== 'GET' && req.method !== 'HEAD');
    if (needsAuth) {
      if (!checkRateLimit(req)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
        return;
      }
      const ok = await checkAdminAuth(req, res);
      if (!ok) return; // response already sent
    }

    // Parse JSON bodies for POST/PUT (future endpoints)
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const bodyResult = await parseBody(req);
      if (!bodyResult.ok) {
        const { status, body } = bodyResult.error;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
        return;
      }
      req.body = bodyResult.data;
    }

    const match = router.match(req);
    if (match) {
      req.params = match.params;
      return match.handler(req, res);
    }

    if (isPublic && !url.pathname.startsWith('/api/')) {
      const served = await tryServeStatic(req, res, url.pathname);
      if (served) return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  };
}

export function start() {
  const log = (...a) => console.log(new Date().toISOString(), ...a);

  const alertsService = createAlertsService({ districtIndex: loadDistrictIndex(), log });
  alertsService.refresh();
  const alertsTimer = setInterval(() => alertsService.refresh(), REFRESH_MS);
  alertsTimer.unref?.();

  const earthquakeService = createEarthquakeService({ log });
  earthquakeService.refresh();
  const eqTimer = setInterval(() => earthquakeService.refresh(), EQ_REFRESH_MS);
  eqTimer.unref?.();

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  const server = http.createServer(createHandler(alertsService, earthquakeService));
  server.listen(port, host, () => log(`Server listening on http://${host}:${port} (alerts + earthquakes)`));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.on('uncaughtException', (err) => console.error(new Date().toISOString(), '[uncaughtException]', err.message));
  process.on('unhandledRejection', (reason) => console.error(new Date().toISOString(), '[unhandledRejection]', reason?.message ?? reason));
  start();
}
