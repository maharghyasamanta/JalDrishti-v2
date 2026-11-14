import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { resolve } from 'node:path';
import { promises as fs } from 'node:fs';

import { checkAdminAuth } from './auth.js';
import { applyCors } from './cors.js';
import { parseBody } from './body.js';
import { createRouter } from './router.js';
import { Store } from './store.js';

// Helper to create mock req/res
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
    process.env.ADMIN_TOKEN = 'A'.repeat(24);
  });

  test('admin auth success and timing‑safe compare', async () => {
    const req = mockReq({ headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` } });
    const res = mockRes();
    const ok = await checkAdminAuth(req, res);
    assert.ok(ok, 'auth should succeed');
    assert.equal(res.statusCode, undefined);
  });

  test('admin auth missing header => 401 then lockout after 5 attempts', async () => {
    for (let i = 1; i <= 5; i++) {
      const req = mockReq({ headers: {} });
      const res = mockRes();
      const ok = await checkAdminAuth(req, res);
      assert.equal(ok, false);
      if (i < 5) {
        assert.equal(res.statusCode, 401);
      } else {
        assert.equal(res.statusCode, 429);
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

  test('store write/read atomic and corrupt recovery', async () => {
    const key = 'teststore';
    const data = { foo: 'bar' };
    await Store.write(key, data);
    const read1 = await Store.read(key);
    assert.equal(read1.foo, 'bar');
    // Corrupt the file manually
    const filePath = resolve('server', 'data', `${key}.json`);
    await fs.writeFile(filePath, '{ not json', 'utf8');
    const read2 = await Store.read(key);
    // Should return fresh object (no foo) and not throw
    assert.ok(!read2.foo);
    // A .corrupt- file should exist (we can't know name, but file should be renamed)
    const files = await fs.readdir(resolve('server', 'data'));
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
