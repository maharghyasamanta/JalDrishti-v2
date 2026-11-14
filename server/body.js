// Body parser for our zero‑dependency server.
// Parses JSON bodies up to 16 KB.
// Returns an object { ok: boolean, data?: any, error?: { status, body } }

import { readFile, writeFile } from 'node:fs/promises';

const MAX_SIZE = 16 * 1024; // 16 KB

export async function parseBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let received = 0;
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_SIZE) {
        // Too large – abort reading
        req.destroy();
        resolve({ ok: false, error: { status: 413, body: { error: 'Payload Too Large' } } });
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const contentType = req.headers['content-type']?.split(';')[0];
      if (contentType !== 'application/json') {
        resolve({ ok: false, error: { status: 415, body: { error: 'Unsupported Media Type' } } });
        return;
      }
      if (!raw) {
        // Empty body -> treat as {}
        resolve({ ok: true, data: {} });
        return;
      }
      try {
        const data = JSON.parse(raw);
        resolve({ ok: true, data });
      } catch (_) {
        resolve({ ok: false, error: { status: 400, body: { error: 'Invalid JSON' } } });
      }
    });
    req.on('error', () => {
      resolve({ ok: false, error: { status: 400, body: { error: 'Bad Request' } } });
    });
  });
}
