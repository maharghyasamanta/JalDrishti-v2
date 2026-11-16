// Body parser for our zero-dependency server.
// Parses plain JSON objects up to 16 KB.
// Returns { ok: true, data } or { ok: false, error: { status, body, closeConnection? } }.

const MAX_SIZE = 16 * 1024; // 16 KB

export async function parseBody(req) {
  // Case-insensitive Content-Type check BEFORE waiting for the body.
  const rawCt = req?.headers?.['content-type'];
  const contentType = typeof rawCt === 'string' ? rawCt.split(';')[0].trim().toLowerCase() : '';
  if (contentType !== 'application/json') {
    return {
      ok: false,
      error: { status: 415, body: { error: 'Unsupported Media Type' } },
    };
  }

  // Check Content-Length up front before reading stream.
  const clHeader = req?.headers?.['content-length'];
  if (clHeader !== undefined) {
    const contentLength = Number(clHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_SIZE) {
      req.resume?.();
      return {
        ok: false,
        error: {
          status: 413,
          body: { error: 'Payload Too Large' },
          closeConnection: true,
        },
      };
    }
  }

  return new Promise((resolve) => {
    const chunks = [];
    let received = 0;
    let tooLarge = false;
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      resolve(result);
    }

    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buf.length;
      if (received > MAX_SIZE) {
        if (!tooLarge) {
          tooLarge = true;
          chunks.length = 0;
        }
        return; // Drain stream without calling req.destroy().
      }
      if (!tooLarge) {
        chunks.push(buf);
      }
    });

    req.on('end', () => {
      if (tooLarge) {
        finish({
          ok: false,
          error: {
            status: 413,
            body: { error: 'Payload Too Large' },
            closeConnection: true,
          },
        });
        return;
      }

      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        finish({ ok: true, data: {} });
        return;
      }

      try {
        const data = JSON.parse(raw);
        if (data === null || typeof data !== 'object' || Array.isArray(data)) {
          finish({
            ok: false,
            error: { status: 400, body: { error: 'JSON body must be a plain object' } },
          });
          return;
        }
        finish({ ok: true, data });
      } catch {
        finish({
          ok: false,
          error: { status: 400, body: { error: 'Invalid JSON' } },
        });
      }
    });

    req.on('error', () => {
      finish({
        ok: false,
        error: { status: 400, body: { error: 'Bad Request' } },
      });
    });
  });
}
