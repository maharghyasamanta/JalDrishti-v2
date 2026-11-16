// Zero-dependency India Post pincode resolver with 24h bounded cache, 10s timeout, and 1 MB cap.
import { STATE_NAMES } from './states.js';

export const POSTAL_API_BASE = 'https://api.postalpincode.in/pincode';
export const REQUEST_TIMEOUT_MS = 10_000;
export const MAX_RESPONSE_BYTES = 1024 * 1024;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 2000;
export const PIN_RE = /^[1-9]\d{5}$/;

const STATE_ALIASES = {
  'orissa': 'Odisha',
  'pondicherry': 'Puducherry',
  'nct of delhi': 'Delhi',
  'new delhi': 'Delhi',
  'uttaranchal': 'Uttarakhand',
  'chattisgarh': 'Chhattisgarh',
  'chhatisgarh': 'Chhattisgarh',
  'telengana': 'Telangana',
  'andaman and nicobar': 'Andaman and Nicobar Islands',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'dadra and nagar haveli and daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
};

const CANONICAL_STATES = new Map([
  ...STATE_NAMES.map((s) => [s.toLowerCase(), s]),
  ...Object.entries(STATE_ALIASES),
]);

export function canonicalizeState(rawState) {
  if (typeof rawState !== 'string') return null;
  const key = rawState
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return CANONICAL_STATES.get(key) || null;
}

async function readJsonWithCap(res, maxBytes) {
  const lenHeader = res.headers?.get?.('content-length');
  if (lenHeader) {
    const contentLength = Number(lenHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`Upstream response exceeds ${maxBytes} bytes`);
    }
  }

  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const buf = Buffer.from(value);
        total += buf.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(`Upstream response exceeds ${maxBytes} bytes`);
        }
        chunks.push(buf);
      }
    } finally {
      reader.releaseLock?.();
    }
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8'));
  }

  if (typeof res.text === 'function') {
    const text = await res.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error(`Upstream response exceeds ${maxBytes} bytes`);
    }
    return JSON.parse(text);
  }

  const data = await res.json();
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > maxBytes) {
    throw new Error(`Upstream response exceeds ${maxBytes} bytes`);
  }
  return data;
}

export function createPincodeService({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  ttlMs = CACHE_TTL_MS,
  maxEntries = CACHE_MAX_ENTRIES,
  timeoutMs = REQUEST_TIMEOUT_MS,
  maxBytes = MAX_RESPONSE_BYTES,
  log = () => {},
} = {}) {
  const cache = new Map();

  function getCached(pin) {
    const entry = cache.get(pin);
    if (!entry) return null;
    if (now() - entry.cachedAt >= ttlMs) {
      cache.delete(pin);
      return null;
    }
    return entry.value;
  }

  function setCached(pin, value) {
    if (cache.has(pin)) {
      cache.delete(pin);
    } else if (cache.size >= maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    cache.set(pin, { value, cachedAt: now() });
  }

  async function lookup(rawPin) {
    const pin = String(rawPin ?? '').trim();
    if (!PIN_RE.test(pin)) {
      return { pincode: pin, ok: false };
    }

    const hit = getCached(pin);
    if (hit) return hit;

    try {
      const res = await fetchImpl(`${POSTAL_API_BASE}/${pin}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'JalDrishti/1.0 (independent disaster dashboard)',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res || !res.ok) {
        log(`Pincode ${pin}: upstream HTTP ${res?.status ?? 'error'}`);
        return { pincode: pin, ok: false };
      }

      const payload = await readJsonWithCap(res, maxBytes);
      const record = Array.isArray(payload) ? payload[0] : payload;
      const offices = Array.isArray(record?.PostOffice) ? record.PostOffice : [];

      if (record?.Status !== 'Success' || offices.length === 0) {
        return { pincode: pin, ok: false };
      }

      const places = [];
      for (const office of offices) {
        const name = typeof office?.Name === 'string' ? office.Name.trim() : '';
        const district = typeof office?.District === 'string' ? office.District.trim() : '';
        const state = canonicalizeState(office?.State);
        if (!state || !district || !name) continue;
        places.push({ name, district, state });
      }

      if (places.length === 0) {
        return { pincode: pin, ok: false };
      }

      const result = {
        pincode: pin,
        ok: true,
        district: places[0].district,
        state: places[0].state,
        places,
      };
      setCached(pin, result);
      return result;
    } catch (err) {
      log(`Pincode ${pin} lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      return { pincode: pin, ok: false };
    }
  }

  return { lookup };
}
