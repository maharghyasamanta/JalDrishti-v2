import { testDataDir, prevSmsDataDir } from './testEnv.js';
import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import fsSync, { promises as fs } from 'node:fs';

import { clientIp } from './ip.js';
import { checkAdminAuth, resetAuthFailures } from './auth.js';
import { createLimiter } from './rateLimiter.js';
import { applyCors } from './cors.js';
import { parseBody } from './body.js';
import { createRouter } from './router.js';
import { mockReq, mockRes } from './testUtils.js';
import { Store } from './store.js';
import { auditLog } from './audit.js';
import { getDataDir } from './paths.js';

const VALID_TOKEN = 'A'.repeat(32);
const SERVER_DIR = dirname(fileURLToPath(import.meta.url));

describe('Phase A & security regression tests', () => {
  const prevTrustProxy = process.env.TRUST_PROXY;
  const prevCorsOrigin = process.env.CORS_ORIGIN;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevAdminToken = process.env.ADMIN_TOKEN;

  beforeEach(() => {
    process.env.SMS_DATA_DIR = testDataDir;
    process.env.ADMIN_TOKEN = VALID_TOKEN;
    delete process.env.TRUST_PROXY;
    delete process.env.CORS_ORIGIN;
    delete process.env.NODE_ENV;
    resetAuthFailures();
  });

  after(() => {
    fsSync.rmSync(testDataDir, { recursive: true, force: true });
    if (prevSmsDataDir === undefined) delete process.env.SMS_DATA_DIR;
    else process.env.SMS_DATA_DIR = prevSmsDataDir;

    if (prevTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prevTrustProxy;

    if (prevCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = prevCorsOrigin;

    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;

    if (prevAdminToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = prevAdminToken;
  });

  // ---- ip.js ----
  test('clientIp ignores spoofed X-Forwarded-For when TRUST_PROXY is unset', () => {
    const req = mockReq({
      headers: { 'x-forwarded-for': '203.0.113.99, 10.0.0.1' },
      remoteAddress: '::ffff:198.51.100.4',
    });
    assert.equal(clientIp(req), '198.51.100.4');
  });

  test('clientIp uses first trimmed X-Forwarded-For entry when TRUST_PROXY=true and strips ::ffff:', () => {
    process.env.TRUST_PROXY = 'true';
    const req = mockReq({
      headers: { 'x-forwarded-for': '  ::ffff:203.0.113.50 , 10.0.0.2 ' },
      remoteAddress: '127.0.0.1',
    });
    assert.equal(clientIp(req), '203.0.113.50');
  });

  // ---- auth.js ----
  test('admin auth missing or short token => 503', async () => {
    delete process.env.ADMIN_TOKEN;
    const req1 = mockReq({ headers: { authorization: `Bearer ${VALID_TOKEN}` }, remoteAddress: '10.0.0.1' });
    const r1 = await checkAdminAuth(req1);
    assert.equal(r1.ok, false);
    assert.equal(r1.status, 503);
    assert.equal(r1.error.error, 'Admin API not configured');

    process.env.ADMIN_TOKEN = 'too-short';
    const req2 = mockReq({ headers: { authorization: 'Bearer too-short' }, remoteAddress: '10.0.0.2' });
    const r2 = await checkAdminAuth(req2);
    assert.equal(r2.ok, false);
    assert.equal(r2.status, 503);
  });

  test('admin auth lock-first: 5 wrong => 401 each, 6th => 429 even with correct token; other IP unaffected; XFF spoof ignored', async () => {
    const attackerIp = '198.51.100.10';
    for (let i = 1; i <= 5; i++) {
      const req = mockReq({ headers: { authorization: 'Bearer wrong-token' }, remoteAddress: attackerIp });
      const res = await checkAdminAuth(req);
      assert.equal(res.ok, false);
      assert.equal(res.status, 401);
    }

    // 6th attempt with wrong token => 429 + Retry-After
    const lockedWrong = await checkAdminAuth(
      mockReq({ headers: { authorization: 'Bearer wrong-token' }, remoteAddress: attackerIp }),
    );
    assert.equal(lockedWrong.ok, false);
    assert.equal(lockedWrong.status, 429);
    assert.ok(Number(lockedWrong.headers?.['Retry-After']) >= 1);

    // Correct token while locked MUST still return 429 (lock first!)
    const lockedCorrect = await checkAdminAuth(
      mockReq({ headers: { authorization: `Bearer ${VALID_TOKEN}` }, remoteAddress: attackerIp }),
    );
    assert.equal(lockedCorrect.ok, false);
    assert.equal(lockedCorrect.status, 429);

    // Spoofed X-Forwarded-For must NOT bypass lock when TRUST_PROXY is unset
    const spoofed = await checkAdminAuth(
      mockReq({
        headers: { authorization: `Bearer ${VALID_TOKEN}`, 'x-forwarded-for': '203.0.113.77' },
        remoteAddress: attackerIp,
      }),
    );
    assert.equal(spoofed.ok, false);
    assert.equal(spoofed.status, 429);

    // A different IP is unaffected
    const otherIp = await checkAdminAuth(
      mockReq({ headers: { authorization: `Bearer ${VALID_TOKEN}` }, remoteAddress: '198.51.100.20' }),
    );
    assert.equal(otherIp.ok, true);
  });

  // ---- rateLimiter.js ----
  test('createLimiter enforces limit, expires window with clock, and keeps keys independent', () => {
    let t = 1_000_000;
    const limiter = createLimiter({ windowMs: 1000, max: 2, now: () => t });

    const a1 = limiter.hit('ip-a');
    assert.deepEqual(a1, { allowed: true, remaining: 1, retryAfterMs: 0 });
    const a2 = limiter.hit('ip-a');
    assert.deepEqual(a2, { allowed: true, remaining: 0, retryAfterMs: 0 });
    const a3 = limiter.hit('ip-a');
    assert.equal(a3.allowed, false);
    assert.equal(a3.remaining, 0);
    assert.equal(a3.retryAfterMs, 1000);

    // Independent key is unaffected
    const b1 = limiter.hit('ip-b');
    assert.equal(b1.allowed, true);

    // Window expires
    t += 1001;
    const a4 = limiter.hit('ip-a');
    assert.equal(a4.allowed, true);
    assert.equal(a4.remaining, 1);

    limiter.reset('ip-a');
    assert.equal(limiter.hit('ip-a').remaining, 1);
  });

  // ---- cors.js ----
  test('CORS handles public GET *, preflight ended=true, echoed allowed origin, and omits ACAO for disallowed origin', () => {
    const reqPublic = mockReq({ method: 'GET', headers: { origin: 'http://example.com' } });
    const resPublic = mockRes();
    const handledPublic = applyCors(reqPublic, resPublic, { public: true });
    assert.equal(resPublic.getHeader('Access-Control-Allow-Origin'), '*');
    assert.equal(resPublic.getHeader('Vary'), 'Origin');
    assert.equal(handledPublic, false);

    // Non-public allowed preflight echoes origin and ends response
    process.env.CORS_ORIGIN = 'https://app.example, https://admin.example';
    const reqAllowedOpt = mockReq({ method: 'OPTIONS', headers: { origin: 'https://admin.example' } });
    const resAllowedOpt = mockRes();
    assert.equal(applyCors(reqAllowedOpt, resAllowedOpt, { public: false }), true);
    assert.equal(resAllowedOpt.ended, true);
    assert.equal(resAllowedOpt.statusCode, 204);
    assert.equal(resAllowedOpt.getHeader('Access-Control-Allow-Origin'), 'https://admin.example');
    assert.equal(resAllowedOpt.getHeader('Access-Control-Max-Age'), '600');

    // Disallowed origin gets 204 with no allow headers and ended === true
    const reqDisallowedOpt = mockReq({ method: 'OPTIONS', headers: { origin: 'http://evil.example' } });
    const resDisallowedOpt = mockRes();
    assert.equal(applyCors(reqDisallowedOpt, resDisallowedOpt, { public: false }), true);
    assert.equal(resDisallowedOpt.ended, true);
    assert.equal(resDisallowedOpt.statusCode, 204);
    assert.equal(resDisallowedOpt.getHeader('Access-Control-Allow-Origin'), undefined);

    // Non-public POST never returns '*'
    const reqDisallowedPost = mockReq({ method: 'POST', headers: { origin: 'http://evil.example' } });
    const resDisallowedPost = mockRes();
    assert.equal(applyCors(reqDisallowedPost, resDisallowedPost, { public: false }), false);
    assert.equal(resDisallowedPost.getHeader('Access-Control-Allow-Origin'), undefined);
  });

  // ---- body.js ----
  test('body parser rejects non-JSON 415, oversized 413 without req.destroy, non-object JSON 400, invalid JSON 400, and empty {}', async () => {
    const r415 = await parseBody(mockReq({ method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }));
    assert.equal(r415.ok, false);
    assert.equal(r415.error.status, 415);

    // Case-insensitive Content-Type + empty body => {}
    const rEmpty = await parseBody(mockReq({ method: 'POST', headers: { 'content-type': 'Application/JSON; charset=utf-8' }, body: '' }));
    assert.equal(rEmpty.ok, true);
    assert.deepEqual(rEmpty.data, {});

    // Oversized streaming body => 413, closeConnection: true, req.destroyed === false
    const large = 'a'.repeat(16 * 1024 + 100);
    const oversizedReq = mockReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body: large });
    const r413 = await parseBody(oversizedReq);
    assert.equal(r413.ok, false);
    assert.equal(r413.error.status, 413);
    assert.equal(r413.error.closeConnection, true);
    assert.equal(oversizedReq.destroyed, false);

    // Invalid JSON => 400
    const rBadJson = await parseBody(mockReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' }));
    assert.equal(rBadJson.ok, false);
    assert.equal(rBadJson.error.status, 400);

    // Array JSON => 400
    const rArray = await parseBody(mockReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body: '[1,2,3]' }));
    assert.equal(rArray.ok, false);
    assert.equal(rArray.error.status, 400);
  });

  // ---- router.js ----
  test('router static route export.csv wins over :id, escapes regex chars, decodes params, flags %ZZ as 400', () => {
    const r = createRouter();
    r.add('GET', '/api/admin/subscribers/:id', () => 'param');
    r.add('GET', '/api/admin/subscribers/export.csv', () => 'export');

    const mExport = r.match({ method: 'GET', url: '/api/admin/subscribers/export.csv', headers: {} });
    assert.ok(mExport);
    assert.equal(mExport.handler(), 'export');

    // Dot in export.csv must be escaped (must not match exportXcsv as static)
    const mNotExport = r.match({ method: 'GET', url: '/api/admin/subscribers/exportXcsv', headers: {} });
    assert.ok(mNotExport);
    assert.equal(mNotExport.handler(), 'param');
    assert.equal(mNotExport.params.id, 'exportXcsv');

    // Decoded param
    const mDecoded = r.match({ method: 'GET', url: '/api/admin/subscribers/SUB%20001', headers: {} });
    assert.ok(mDecoded);
    assert.equal(mDecoded.params.id, 'SUB 001');

    // Malformed %ZZ does not throw and flags 400
    const badReq = { method: 'GET', url: '/api/admin/subscribers/%ZZ', headers: {} };
    const mBad = r.match(badReq);
    assert.equal(mBad, null);
    assert.equal(badReq.routeError?.status, 400);
  });

  // ---- store.js & paths.js ----
  test('store update() finishes within 2s and releases mutex cleanly if updater throws', async () => {
    const key = 'update-fast';
    const start = Date.now();
    const updated = await Promise.race([
      Store.update(key, (cur) => ({ ...cur, count: 1 })),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Store.update timed out (>2s)')), 2000)),
    ]);
    assert.ok(Date.now() - start < 2000);
    assert.equal(updated.count, 1);

    await assert.rejects(
      () => Store.update(key, () => { throw new Error('updater boom'); }),
      /updater boom/,
    );

    // Live data untouched and mutex released for next update
    const afterErr = await Store.read(key);
    assert.equal(afterErr.count, 1);
    const next = await Store.update(key, (cur) => ({ ...cur, count: cur.count + 1 }));
    assert.equal(next.count, 2);
  });

  test('20 concurrent store.update() increments end at exactly 20', async () => {
    const key = 'concurrent-20';
    await Store.write(key, { count: 0 });
    await Promise.all(
      Array.from({ length: 20 }, () =>
        Store.update(key, (cur) => ({ ...cur, count: (cur.count || 0) + 1 })),
      ),
    );
    const finalDoc = await Store.read(key);
    assert.equal(finalDoc.count, 20);
  });

  test('live file exists throughout a write while backups rotate .1 to .5', async () => {
    const key = 'live-exists';
    const livePath = join(testDataDir, `${key}.json`);
    await Store.write(key, { step: 0 });
    assert.equal(fsSync.existsSync(livePath), true);

    let sawMissing = false;
    let checks = 0;

    for (let step = 1; step <= 6; step++) {
      let writing = true;
      const writePromise = Store.write(key, { step }).finally(() => {
        writing = false;
      });

      while (writing) {
        checks++;
        if (!fsSync.existsSync(livePath)) sawMissing = true;
        await new Promise((r) => setImmediate(r));
      }
      await writePromise;
      if (!fsSync.existsSync(livePath)) sawMissing = true;
    }

    assert.ok(checks > 0);
    assert.equal(sawMissing, false, 'live file must never be removed during write');
    assert.equal(fsSync.existsSync(join(testDataDir, `${key}.1.json`)), true);
    assert.equal(fsSync.existsSync(join(testDataDir, `${key}.5.json`)), true);
  });

  test('corrupt live JSON recovers from first valid backup; schema mismatch copies to .schema-*.bak', async () => {
    const key = 'recover-bak';
    await Store.write(key, { version: 1 });
    await Store.write(key, { version: 2 });

    const livePath = join(testDataDir, `${key}.json`);
    await fs.writeFile(livePath, '{ corrupt json', 'utf8');

    const recovered = await Store.read(key);
    assert.equal(recovered.version, 1);

    // Live file itself is restored to valid JSON
    const liveAfter = JSON.parse(await fs.readFile(livePath, 'utf8'));
    assert.equal(liveAfter.version, 1);

    // Schema mismatch copies to .schema-<ts>.bak and returns fresh object
    const schemaKey = 'schema-mismatch';
    const schemaPath = join(testDataDir, `${schemaKey}.json`);
    await fs.writeFile(schemaPath, JSON.stringify({ schemaVersion: 99, legacy: true }), 'utf8');

    const freshFromSchema = await Store.read(schemaKey);
    assert.equal(freshFromSchema.schemaVersion, 1);
    assert.equal(freshFromSchema.legacy, undefined);
    const dirFiles = await fs.readdir(testDataDir);
    assert.ok(dirFiles.some((f) => f.startsWith(`${schemaKey}.json.schema-`) && f.endsWith('.bak')));
  });

  test('store corrupt with no backup gives a fresh object plus a .corrupt file', async () => {
    const key = 'teststore';
    const data = { foo: 'bar' };
    await Store.write(key, data);
    const read1 = await Store.read(key);
    assert.equal(read1.foo, 'bar');

    const filePath = join(testDataDir, `${key}.json`);
    await fs.writeFile(filePath, '{ not json', 'utf8');
    const read2 = await Store.read(key);
    assert.equal(read2.schemaVersion, 1);
    assert.equal(read2.foo, undefined);

    const files = await fs.readdir(testDataDir);
    const corrupt = files.find((f) => f.startsWith(`${key}.json.corrupt-`));
    assert.ok(corrupt, 'corrupt file created');
  });

  // ---- audit.js & paths.js ----
  test('audit writes when dir does not exist and after process.chdir; redaction works', async () => {
    const origCwd = process.cwd();
    const missingDir = join(testDataDir, 'nested', 'missing-audit-dir');
    process.env.SMS_DATA_DIR = missingDir;

    try {
      process.chdir(os.tmpdir());

      // getDataDir uses <server>/data via import.meta.url when SMS_DATA_DIR is unset even after chdir
      delete process.env.SMS_DATA_DIR;
      assert.equal(getDataDir(), join(SERVER_DIR, 'data'));

      process.env.SMS_DATA_DIR = missingDir;
      await auditLog({
        type: 'redaction_check',
        phone: '+919876543210',
        otp: '482910',
        authkey: 'msg91-secret-authkey',
        token: 'admin-secret-token',
        authorization: 'Bearer super-secret-jwt',
        note: 'SMS failed for +91 98765 43210 and +919123456789',
      });
    } finally {
      process.chdir(origCwd);
      process.env.SMS_DATA_DIR = testDataDir;
    }

    const logFile = join(missingDir, 'audit.log');
    assert.equal(fsSync.existsSync(logFile), true);
    const raw = await fs.readFile(logFile, 'utf8');
    const parsed = JSON.parse(raw.trim().split('\n')[0]);

    assert.equal(parsed.type, 'redaction_check');
    assert.equal(parsed.phone, '[REDACTED]');
    assert.equal(parsed.otp, '[REDACTED]');
    assert.equal(parsed.authkey, '[REDACTED]');
    assert.equal(parsed.token, '[REDACTED]');
    assert.equal(parsed.authorization, '[REDACTED]');

    assert.equal(raw.includes('9876543210'), false);
    assert.equal(raw.includes('98765 43210'), false);
    assert.equal(raw.includes('482910'), false);
    assert.equal(raw.includes('msg91-secret-authkey'), false);
    assert.equal(raw.includes('admin-secret-token'), false);
    assert.equal(raw.includes('super-secret-jwt'), false);
    assert.equal(raw.includes('9123456789'), false);
    assert.equal(parsed.note.includes('+91******3210'), true);
    assert.equal(parsed.note.includes('+91******6789'), true);
  });
});
