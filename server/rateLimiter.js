// Sliding-window rate limiter factory with sweeping and injectable clock.
import { clientIp } from './ip.js';

const MAX_SWEEP_PER_CALL = 256;

/**
 * Create a sliding-window rate limiter.
 * @param {{ windowMs?: number, max?: number, now?: () => number }} [opts]
 */
export function createLimiter({ windowMs = 60 * 1000, max = 100, now = Date.now } = {}) {
  /** @type {Map<string, number[]>} */
  const store = new Map();

  function sweep(currentNow) {
    const cutoff = currentNow - windowMs;
    let scanned = 0;
    for (const [k, timestamps] of store.entries()) {
      if (scanned >= MAX_SWEEP_PER_CALL) break;
      scanned += 1;
      const active = timestamps.filter((ts) => ts > cutoff);
      if (active.length === 0) {
        store.delete(k);
      } else if (active.length !== timestamps.length) {
        store.set(k, active);
      }
    }
  }

  /**
   * Record a hit for `key` and return rate-limit status.
   * @param {string} key
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
   */
  function hit(key) {
    const currentNow = now();
    sweep(currentNow);

    const k = String(key ?? '');
    const cutoff = currentNow - windowMs;
    const active = (store.get(k) || []).filter((ts) => ts > cutoff);

    if (active.length >= max) {
      store.set(k, active);
      const retryAfterMs = Math.max(0, active[0] + windowMs - currentNow);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    active.push(currentNow);
    store.set(k, active);
    return {
      allowed: true,
      remaining: Math.max(0, max - active.length),
      retryAfterMs: 0,
    };
  }

  /**
   * Reset rate-limit state for a single key, or all keys when omitted.
   * @param {string} [key]
   */
  function reset(key) {
    if (key === undefined) {
      store.clear();
    } else {
      store.delete(String(key));
    }
  }

  return { hit, reset };
}

export const adminLimiter = createLimiter({ windowMs: 60 * 1000, max: 100 });

export function hitAdminRequest(req) {
  return adminLimiter.hit(clientIp(req));
}
