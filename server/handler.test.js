import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import os from 'node:os';
import fsSync from 'node:fs';

import { createHandler, loadEnvFile } from './index.js';
import { createRouter } from './router.js';
import { resetAuthFailures } from './auth.js';
import { adminLimiter } from './rateLimiter.js';
import { mockReq, mockRes } from './testUtils.js';

const VALID_TOKEN = 'B'.repeat(32);

describe('createHandler and loadEnvFile tests', () => {
  const prevAdminToken = process.env.ADMIN_TOKEN;
  const prevCors = process.env.CORS_ORIGIN;

  beforeEach(() => {
    process.env.ADMIN_TOKEN = VALID_TOKEN;
    delete process.env.CORS_ORIGIN;
    resetAuthFailures();
    adminLimiter.reset();
  });

  after(() => {
    if (prevAdminToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = prevAdminToken;
    if (prevCors === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = prevCors;
  });

  test('405 on non-GET/HEAD/OPTIONS for /healthz, /api/alerts, /api/earthquakes and on unknown methods like PATCH', async () => {
    const handler = createHandler({ getPayload: () => null });

    for (const path of ['/healthz', '/api/alerts', '/api/earthquakes']) {
      const res = mockRes();
      await handler(mockReq({ method: 'POST', url: path }), res);
      assert.equal(res.statusCode, 405);
      assert.equal(res.getHeader('Allow'), 'GET, HEAD, OPTIONS');
      assert.equal(res.ended, true);
    }

    const patchRes = mockRes();
    await handler(mockReq({ method: 'PATCH', url: '/api/subscribe' }), patchRes);
    assert.equal(patchRes.statusCode, 405);
    assert.equal(patchRes.ended, true);
  });

  test('OPTIONS preflight ends with 204', async () => {
    process.env.CORS_ORIGIN = 'https://example.org';
    const handler = createHandler({ getPayload: () => null });
    const res = mockRes();
    await handler(
      mockReq({
        method: 'OPTIONS',
        url: '/api/admin/subscribers',
        headers: { origin: 'https://example.org', 'access-control-request-method': 'POST' },
      }),
      res,
    );
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
    assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'https://example.org');
  });

  test('oversized body returns 413 with Connection: close and req.destroyed === false', async () => {
    const handler = createHandler({ getPayload: () => null });
    const req = mockReq({
      method: 'POST',
      url: '/api/subscribe',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(16 * 1024 + 50),
    });
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 413);
    assert.equal(res.getHeader('Connection'), 'close');
    assert.equal(req.destroyed, false);
    assert.equal(res.ended, true);
  });

  test('admin routes return 503, 401, 429 with Cache-Control: no-store and Retry-After; public POST needs no token', async () => {
    const handler = createHandler({ getPayload: () => null });

    // 503 when token missing
    delete process.env.ADMIN_TOKEN;
    const res503 = mockRes();
    await handler(mockReq({ method: 'GET', url: '/api/admin/stats', remoteAddress: '198.51.100.1' }), res503);
    assert.equal(res503.statusCode, 503);
    assert.equal(res503.getHeader('Cache-Control'), 'no-store');

    // 401 x5 then 429 on 6th attempt
    process.env.ADMIN_TOKEN = VALID_TOKEN;
    for (let i = 1; i <= 5; i++) {
      const res401 = mockRes();
      await handler(
        mockReq({
          method: 'GET',
          url: '/api/admin/stats',
          headers: { authorization: 'Bearer wrong' },
          remoteAddress: '198.51.100.2',
        }),
        res401,
      );
      assert.equal(res401.statusCode, 401);
      assert.equal(res401.getHeader('Cache-Control'), 'no-store');
    }

    const res429 = mockRes();
    await handler(
      mockReq({
        method: 'GET',
        url: '/api/admin/stats',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
        remoteAddress: '198.51.100.2',
      }),
      res429,
    );
    assert.equal(res429.statusCode, 429);
    assert.ok(Number(res429.getHeader('Retry-After')) >= 1);
    assert.equal(res429.getHeader('Cache-Control'), 'no-store');

    // Public POST route does not require admin token (returns 404 when no route registered, never 401/503)
    const pubRes = mockRes();
    await handler(
      mockReq({
        method: 'POST',
        url: '/api/subscribe',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        remoteAddress: '198.51.100.3',
      }),
      pubRes,
    );
    assert.equal(pubRes.statusCode, 404);
  });

  test('throwing handler returns 500 Internal server error and ends response', async () => {
    const router = createRouter();
    router.add('GET', '/api/boom', () => {
      throw new Error(`boom Bearer ${VALID_TOKEN}`);
    });
    const handler = createHandler({ getPayload: () => null }, undefined, { router });
    const res = mockRes();
    await handler(mockReq({ method: 'GET', url: '/api/boom' }), res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.ended, true);
    assert.deepEqual(JSON.parse(res.body), { error: 'Internal server error' });
  });

  test('HEAD /healthz returns 200 with empty body and GET /api/alerts works with 1-arg createHandler', async () => {
    const sample = { generatedAt: '2026-11-15T00:00:00Z', upstreamOk: true, alerts: [], unresolvedCount: 0 };
    const handler = createHandler({ getPayload: () => sample });

    const headRes = mockRes();
    await handler(mockReq({ method: 'HEAD', url: '/healthz' }), headRes);
    assert.equal(headRes.statusCode, 200);
    assert.equal(headRes.body, '');
    assert.equal(headRes.ended, true);

    const alertsRes = mockRes();
    await handler(mockReq({ method: 'GET', url: '/api/alerts' }), alertsRes);
    assert.equal(alertsRes.statusCode, 200);
    assert.equal(alertsRes.getHeader('Cache-Control'), 'public, max-age=300');
    assert.equal(alertsRes.getHeader('Content-Type'), 'application/json; charset=utf-8');
    assert.deepEqual(JSON.parse(alertsRes.body), sample);
  });

  test('loadEnvFile parses temp .env, skips comments, strips quotes, and never overrides existing vars', () => {
    const tmpDir = fsSync.mkdtempSync(join(os.tmpdir(), 'jaldrishti-env-'));
    const envPath = join(tmpDir, '.env');
    fsSync.writeFileSync(
      envPath,
      [
        '# comment line',
        '',
        'TEST_ENV_A="hello world"',
        "TEST_ENV_B='single_quoted'",
        'TEST_ENV_EXISTING=from_file',
      ].join('\n'),
      'utf8',
    );

    process.env.TEST_ENV_EXISTING = 'already_set';
    delete process.env.TEST_ENV_A;
    delete process.env.TEST_ENV_B;

    try {
      const ok = loadEnvFile(envPath, { useNative: false });
      assert.equal(ok, true);
      assert.equal(process.env.TEST_ENV_A, 'hello world');
      assert.equal(process.env.TEST_ENV_B, 'single_quoted');
      assert.equal(process.env.TEST_ENV_EXISTING, 'already_set');

      // Missing file is ignored
      assert.equal(loadEnvFile(join(tmpDir, 'missing.env')), false);
    } finally {
      delete process.env.TEST_ENV_A;
      delete process.env.TEST_ENV_B;
      delete process.env.TEST_ENV_EXISTING;
      fsSync.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
