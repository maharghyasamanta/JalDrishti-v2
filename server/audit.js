// Audit logger – append-only JSONL with serialization, per-call path resolution, and PII/secret redaction.
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getDataDir } from './paths.js';

const REDACT_KEYS = new Set(['phone', 'otp', 'authkey', 'token', 'authorization']);
const ERROR_THROTTLE_MS = 60_000;

let writeChain = Promise.resolve();
let lastErrorLogAt = 0;

function maskPhoneStrings(str) {
  return str
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\+91[\s-]?(?:\d[\s-]?){6}(\d{4})(?!\d)/g, '+91******$1');
}

function redactValue(val, seen = new WeakSet()) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') return maskPhoneStrings(val);
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (typeof val === 'bigint') return val.toString();
  if (val instanceof Date) return val.toISOString();
  if (val instanceof Error) {
    return {
      name: val.name,
      message: maskPhoneStrings(val.message || ''),
    };
  }
  if (typeof val !== 'object') return String(val);

  if (seen.has(val)) return '[Circular]';
  seen.add(val);

  if (Array.isArray(val)) {
    return val.map((item) => redactValue(item, seen));
  }

  const out = {};
  for (const [k, v] of Object.entries(val)) {
    const norm = k.toLowerCase().replace(/[_-]/g, '');
    if (REDACT_KEYS.has(norm)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactValue(v, seen);
    }
  }
  return out;
}

export function auditLog(entry) {
  let line;
  try {
    const safeEntry = redactValue(
      entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : { detail: entry },
    );
    line = `${JSON.stringify({ timestamp: new Date().toISOString(), ...safeEntry })}\n`;
  } catch {
    line = `${JSON.stringify({ timestamp: new Date().toISOString(), type: 'audit_unserializable' })}\n`;
  }

  const task = async () => {
    try {
      const dataDir = getDataDir();
      const logPath = join(dataDir, 'audit.log');
      await mkdir(dataDir, { recursive: true });
      await appendFile(logPath, line, { encoding: 'utf8' });
    } catch (err) {
      const now = Date.now();
      if (now - lastErrorLogAt >= ERROR_THROTTLE_MS) {
        lastErrorLogAt = now;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(new Date().toISOString(), '[audit error]', msg);
      }
    }
  };

  writeChain = writeChain.then(task, task);
  return writeChain;
}
