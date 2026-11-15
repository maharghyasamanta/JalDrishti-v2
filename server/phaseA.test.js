import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { join } from 'node:path';
import os from 'node:os';
import fsSync, { promises as fs } from 'node:fs';

const prevSmsDataDir = process.env.SMS_DATA_DIR;
const testDataDir = fsSync.mkdtempSync(join(os.tmpdir(), 'jaldrishti-test-'));
process.env.SMS_DATA_DIR = testDataDir;

import { checkAdminAuth } from './auth.js';
import { applyCors } from './cors.js';
import { parseBody } from './body.js';
import { createRouter } from './router.js';
const { Store } = await import('./store.js');

const VALID_TOKEN = 'A'.repeat(32);

// Helper to create mock req/res (no real sockets)
function mockReq({ method = 'GET', headers = {}, url = '/', body = null, socketRemote = '127.0.0.1' } = {}) {
  const stream = new PassThrough();
  if (body) stream.end(body);
  else stream.end();
  return Object.assign(stream, {
    method,
    headers,
    url,
    socket: { remoteAddress: socketRemote },
  });
}
function mockRes() {
  const chunks = [];
  const res = {
    statusCode: null,
    headers: {},
    writeHead(status, hdrs) { this.statusCode = status; Object.assign(this.headers, hdrs); },
    end(data) { if (data) chunks.push(data); this.body = Buffer.concat(chunks).toString(); },
    setHeader(name, value) { this.headers[name] = value; },
  };
  return res;
}

describe('Phase A tests', () => {
  beforeEach(() => {
    process.env.ADMIN_TOKEN = VALID_TOKEN;
  });

  test('admin auth missing token => 503', async () => {
    delete process.env.ADMIN_TOKEN;
    const req = mockReq({ headers: { authorization: `Bearer ${VALID_TOKEN}` }, socketRemote: '10.0.0.1' });
    const result = await checkAdminAuth(req);
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
  });

  test('admin auth short token => 503', async () => {
    process.env.ADMIN_TOKEN = 'too-short';
    const req = mockReq({ headers: { authorization: 'Bearer too-short' }, socketRemote: '10.0.0.2' });
    const result = await checkAdminAuth(req);
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
  });

  test('admin auth wrong token => 401', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer wrong-token' }, socketRemote: '10.0.0.3' });
    const result = await checkAdminAuth(req);
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
  });

  test('admin auth correct token => ok (200)', async () => {
    const req = mockReq({ headers: { authorization: `Bearer ${VALID_TOKEN}` }, socketRemote: '10.0.0.4' });
    const result = await checkAdminAuth(req);
    assert.equal(result.ok, true);
  });

  test('admin auth lockout: 6th failed attempt => 429', async () => {
    for (let i = 1; i <= 6; i++) {
      const req = mockReq({ headers: { authorization: 'Bearer wrong-token' }, socketRemote: '10.0.0.5' });
      const result = await checkAdminAuth(req);
      assert.equal(result.ok, false);
      if (i < 5) {
        assert.equal(result.status, 401);
      } else {
        assert.equal(result.status, 429);
      }
    }
  });

  test('router param extraction', () => {
    const r = createRouter();
    r.add('GET', '/api/admin/subscribers/:id', (req, res) => {});
    const fakeReq = { method: 'GET', url: '/api/admin/subscribers/SUB-001', headers: {} };
    const match = r.match(fakeReq);
    assert.ok(match);
    assert.equal(match.params.id, 'SUB-001');
  });

  test('body parser rejects non‑JSON content‑type', async () => {
    const req = mockReq({ method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'test' });
    const result = await parseBody(req);
    assert.equal(result.ok, false);
    assert.equal(result.error.status, 415);
  });

  test('body parser rejects oversized payload', async () => {
    const large = 'a'.repeat(16 * 1024 + 1);
    const req = mockReq({ method: 'POST', headers: { 'content-type': 'application/json' }, body: large });
    const result = await parseBody(req);
    assert.equal(result.ok, false);
    assert.equal(result.error.status, 413);
  });

  after(() => {
    fsSync.rmSync(testDataDir, { recursive: true, force: true });
    if (prevSmsDataDir === undefined) delete process.env.SMS_DATA_DIR;
    else process.env.SMS_DATA_DIR = prevSmsDataDir;
  });

  test('store write/read atomic and corrupt recovery', async () => {
    const key = 'teststore';
    const data = { foo: 'bar' };
    await Store.write(key, data);
    const read1 = await Store.read(key);
    assert.equal(read1.foo, 'bar');
    // Corrupt the file manually
    const filePath = join(testDataDir, `${key}.json`);
    await fs.writeFile(filePath, '{ not json', 'utf8');
    const read2 = await Store.read(key);
    // Should return fresh object (no foo) and not throw
    assert.ok(!read2.foo);
    // A .corrupt- file should exist (we can't know name, but file should be renamed)
    const files = await fs.readdir(testDataDir);
    const corrupt = files.find(f => f.startsWith(`${key}.json.corrupt-`));
    assert.ok(corrupt, 'corrupt file created');
  });

  test('CORS handling for public GET vs protected POST', () => {
    const reqPublic = mockReq({ method: 'GET', headers: { origin: 'http://example.com' } });
    const resPublic = mockRes();
    const handledPublic = applyCors(reqPublic, resPublic, { public: true, allowedOrigin: undefined });
    assert.equal(resPublic.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(handledPublic, false);

    const reqPost = mockReq({ method: 'POST', headers: { origin: 'http://example.com' } });
    const resPost = mockRes();
    const handledPost = applyCors(reqPost, resPost, { public: false, allowedOrigin: 'http://localhost:5173' });
    assert.equal(resPost.headers['Access-Control-Allow-Origin'], 'http://localhost:5173');
    assert.equal(handledPost, false);
  });
});
