// Admin authentication module.
// Exposes getAdminToken(), checkAdminAuth(req, opts), and resetAuthFailures().
// Returns { ok, status?, error?, headers? } and never writes to res.

import crypto from 'node:crypto';
import { auditLog } from './audit.js';
import { clientIp } from './ip.js';

const LOCKOUT_LIMIT = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_SWEEP_PER_CALL = 256;

// ip -> number[] (failure timestamps within sliding window)
const failures = new Map();

export function getAdminToken() {
  const t = process.env.ADMIN_TOKEN;
  if (!t || t.length < 24) return null;
  return t;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

function sweepOldEntries(currentNow) {
  const cutoff = currentNow - LOCKOUT_WINDOW_MS;
  let scanned = 0;
  for (const [ip, timestamps] of failures.entries()) {
    if (scanned >= MAX_SWEEP_PER_CALL) break;
    scanned += 1;
    const active = timestamps.filter((ts) => ts > cutoff);
    if (active.length === 0) {
      failures.delete(ip);
    } else if (active.length !== timestamps.length) {
      failures.set(ip, active);
    }
  }
}

function recordFailure(ip, currentNow) {
  const cutoff = currentNow - LOCKOUT_WINDOW_MS;
  const active = (failures.get(ip) || []).filter((ts) => ts > cutoff);
  active.push(currentNow);
  failures.set(ip, active);
  return active;
}

export function resetAuthFailures() {
  failures.clear();
}

/**
 * Pure admin authentication check.
 * Never touches res.
 * @param {import('node:http').IncomingMessage} req
 * @param {{ now?: () => number }} [opts]
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: { error: string }, headers?: Record<string, string> }>}
 */
export async function checkAdminAuth(req, { now = Date.now } = {}) {
  const currentNow = now();
  sweepOldEntries(currentNow);

  const ip = clientIp(req);
  const token = getAdminToken();

  // Missing or short token configuration – fail closed.
  if (!token) {
    await auditLog({ type: 'admin_auth_missing', ip });
    return { ok: false, status: 503, error: { error: 'Admin API not configured' } };
  }

  // LOCK FIRST: check existing failure count BEFORE inspecting the token.
  const cutoff = currentNow - LOCKOUT_WINDOW_MS;
  const active = (failures.get(ip) || []).filter((ts) => ts > cutoff);
  if (active.length > 0) {
    failures.set(ip, active);
  } else {
    failures.delete(ip);
  }

  if (active.length >= LOCKOUT_LIMIT) {
    const retryAfterSec = Math.max(1, Math.ceil((active[0] + LOCKOUT_WINDOW_MS - currentNow) / 1000));
    await auditLog({ type: 'admin_auth_locked', ip });
    return {
      ok: false,
      status: 429,
      headers: { 'Retry-After': String(retryAfterSec) },
      error: { error: 'Too many failed auth attempts' },
    };
  }

  const authHeader = req?.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    recordFailure(ip, currentNow);
    await auditLog({ type: 'admin_auth_failure', ip, reason: 'missing' });
    return { ok: false, status: 401, error: { error: 'Missing or invalid Authorization header' } };
  }

  const provided = authHeader.slice('Bearer '.length).trim();
  const match = crypto.timingSafeEqual(sha256(token), sha256(provided));
  if (!match) {
    recordFailure(ip, currentNow);
    await auditLog({ type: 'admin_auth_failure', ip, reason: 'invalid' });
    return { ok: false, status: 401, error: { error: 'Invalid admin token' } };
  }

  // Successful auth (only reached when IP is not locked) – clear failure record.
  failures.delete(ip);
  return { ok: true };
}
