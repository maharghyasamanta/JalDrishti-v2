// Shared mock request/response helpers for server unit tests (no real sockets).
import { PassThrough } from 'node:stream';

/**
 * Create a mock IncomingMessage backed by a PassThrough stream.
 * @param {{ method?: string, headers?: Record<string, string>, url?: string, body?: string|Buffer|null, remoteAddress?: string, socketRemote?: string, autoEnd?: boolean }} [opts]
 */
export function mockReq({
  method = 'GET',
  headers = {},
  url = '/',
  body = null,
  remoteAddress = '127.0.0.1',
  socketRemote,
  autoEnd = true,
} = {}) {
  const stream = new PassThrough();
  const normalizedHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) normalizedHeaders[k.toLowerCase()] = v;
  }

  if (autoEnd) {
    if (body !== null && body !== undefined) stream.end(body);
    else stream.end();
  }

  return Object.assign(stream, {
    method,
    headers: normalizedHeaders,
    url,
    socket: { remoteAddress: socketRemote ?? remoteAddress },
  });
}

/**
 * Create a mock ServerResponse recording statusCode, headers, ended, headersSent, and body.
 */
export function mockRes() {
  const chunks = [];
  const res = {
    statusCode: 200,
    headers: {},
    headersSent: false,
    ended: false,
    writableEnded: false,
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    getHeader(name) {
      const target = name.toLowerCase();
      for (const [k, v] of Object.entries(this.headers)) {
        if (k.toLowerCase() === target) return v;
      }
      return undefined;
    },
    removeHeader(name) {
      const target = name.toLowerCase();
      for (const k of Object.keys(this.headers)) {
        if (k.toLowerCase() === target) delete this.headers[k];
      }
    },
    writeHead(status, hdrs) {
      this.statusCode = status;
      this.headersSent = true;
      if (hdrs && typeof hdrs === 'object') {
        for (const [k, v] of Object.entries(hdrs)) {
          this.headers[k] = v;
        }
      }
      return this;
    },
    write(chunk) {
      this.headersSent = true;
      if (chunk !== undefined && chunk !== null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return true;
    },
    end(data) {
      this.headersSent = true;
      if (data !== undefined && data !== null) {
        chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
      }
      this.body = Buffer.concat(chunks).toString('utf8');
      this.ended = true;
      this.writableEnded = true;
      return this;
    },
  };
  return res;
}
