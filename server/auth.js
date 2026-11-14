// Admin authentication module (Phase A).
// Exposes getAdminToken() and a pure checkAdminAuth(req) returning an object.
// The request handler is responsible for sending HTTP responses.

import crypto from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function getAdminToken() {
  const t = process.env.ADMIN_TOKEN;
  if (!t || t.length < 24) return null;
  return t;
}

// Failure tracking for lock‑out (5 attempts within 15 min per IP).
const failures = new Map(); // ip -> { count, first }
const LOCKOUT_LIMIT = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

function now() { return Date.now(); }
function clean(ip) {
  const rec = failures.get(ip);
  if (rec && now() - rec.first > LOCKOUT_WINDOW_MS) failures.delete(ip);
}

async function auditLog(entry) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n';
  const logPath = resolve('server', 'data', 'audit.log');
  await appendFile(logPath, line, { encoding: 'utf8' }).catch(() => {});
}

/**
 * Pure auth check. Returns { ok: true } on success, otherwise { ok:false, status, error }.
 * Does NOT write to the response.
 */
export async function checkAdminAuth(req) {
  const token = getAdminToken();
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString();
  clean(ip);
  const rec = failures.get(ip) || { count: 0, first: now() };

  // Missing or short token configuration – fail closed.
  if (!token) {
    await auditLog({ type: 'admin_auth_missing', ip });
    return { ok: false, status: 503, error: { error: 'Admin API not configured' } };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    rec.count++;
    failures.set(ip, rec);
    if (rec.count >= LOCKOUT_LIMIT) {
      await auditLog({ type: 'admin_auth_failure', ip, reason: 'missing' });
      return { ok: false, status: 429, error: { error: 'Too many failed auth attempts' } };
    }
    await auditLog({ type: 'admin_auth_failure', ip, reason: 'missing' });
    return { ok: false, status: 401, error: { error: 'Missing or invalid Authorization header' } };
  }

  const provided = authHeader.slice('Bearer '.length).trim();
  const expected = Buffer.from(token, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  const match = expected.length === providedBuf.length && crypto.timingSafeEqual(expected, providedBuf);
  if (!match) {
    rec.count++;
    failures.set(ip, rec);
    if (rec.count >= LOCKOUT_LIMIT) {
      await auditLog({ type: 'admin_auth_failure', ip, reason: 'invalid' });
      return { ok: false, status: 429, error: { error: 'Too many failed auth attempts' } };
    }
    await auditLog({ type: 'admin_auth_failure', ip, reason: 'invalid' });
    return { ok: false, status: 401, error: { error: 'Invalid admin token' } };
  }

  // Successful auth – clear failures for ip.
  failures.delete(ip);
  return { ok: true };
}

export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
