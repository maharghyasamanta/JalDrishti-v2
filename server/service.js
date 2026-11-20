// Fetches the SACHET RSS + CAP messages, caches immutable CAP messages by identifier,
// caches SACHET Polygon URL geometries in memory keyed by polygon URL, and serves normalised alerts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRss } from './rss.js';
import { parseCap, parsePolygonXml, selectActive, normalizeAlert, effectiveExpiry } from './cap.js';
import { stateAtPoint, nearestStateWithin } from './geo.js';

export const RSS_URL = 'https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml';
export const CAP_URL = 'https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile';
export const REFRESH_MS = 10 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 15_000;
export const CONCURRENCY = 12;

export const POLYGON_CONCURRENCY = 1;
export const POLYGON_MIN_INTERVAL_MS = 5_000;
export const POLYGON_MAX_PER_CYCLE = 20;
export const POLYGON_TIMEOUT_MS = 10_000;
export const POLYGON_MAX_BYTES = 1_048_576; // 1 MB
export const POLYGON_BACKOFF_INITIAL_MS = 15 * 60 * 1000; // 15 min
export const POLYGON_BACKOFF_MAX_MS = 60 * 60 * 1000; // 1 h
export const POLYGON_CACHE_MAX_ENTRIES = 200;
export const POLYGON_CACHE_MAX_BYTES = 20 * 1024 * 1024; // 20 MB (binding limit)

/** ALERT_SCOPE=water keeps only water hazards; anything else (default) keeps every hazard type. */
export const WATER_ONLY = (process.env.ALERT_SCOPE || 'all').toLowerCase() === 'water';
export const USER_AGENT = process.env.SACHET_USER_AGENT
  || 'JalDrishti-AlertsProxy/1.0 (independent hazard-alert dashboard; caches public SACHET CAP feed, 1 request per new alert, refresh every 10 min)';
const MAX_BYTES = 10 * 1024 * 1024;

export async function httpFetchText(url, { timeoutMs = REQUEST_TIMEOUT_MS, maxBytes = MAX_BYTES } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml, text/xml;q=0.9, */*;q=0.5' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) {
    const err = new Error(`Response too large (${len} bytes)`);
    err.code = 'RESPONSE_TOO_LARGE';
    throw err;
  }
  const text = await res.text();
  const actualBytes = Buffer.byteLength(text, 'utf8');
  if (actualBytes > maxBytes) {
    const err = new Error(`Response too large (${actualBytes} bytes)`);
    err.code = 'RESPONSE_TOO_LARGE';
    throw err;
  }
  return text;
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function loadDistrictIndex(path) {
  const p = path || process.env.DISTRICT_INDEX_PATH
    || fileURLToPath(new URL('../public/data/india-districts-index.json', import.meta.url));
  return JSON.parse(readFileSync(p, 'utf8'));
}

function messagePolygonUrls(msg) {
  if (Array.isArray(msg.polygonUrls) && msg.polygonUrls.length > 0) return msg.polygonUrls;
  return msg.polygonUrl ? [msg.polygonUrl] : [];
}

function parseSentMs(msg) {
  if (!msg.sent) return Infinity;
  const parsed = Date.parse(msg.sent);
  return Number.isNaN(parsed) ? Infinity : parsed;
}

function isBackoffTriggerError(err) {
  if (!err) return false;
  if (err.code === 'RESPONSE_TOO_LARGE') return false;
  const status = typeof err.status === 'number' ? err.status : null;
  if (status === 403 || status === 429 || (status !== null && status >= 500 && status < 600)) {
    return true;
  }
  const message = String(err.message || '');
  if (/\bHTTP\s+(?:403|429|5\d\d)\b/i.test(message)) {
    return true;
  }
  if (
    err.name === 'AbortError' ||
    err.name === 'TimeoutError' ||
    err.name === 'TypeError' ||
    err.code === 'POLYGON_TIMEOUT' ||
    /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR_|network|timeout|fetch failed)\b/i.test(
      `${err.code || ''} ${message}`,
    )
  ) {
    return true;
  }
  return false;
}

function runWithTimeout(promiseFactory, timeoutMs) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Polygon fetch timed out after ${timeoutMs}ms`);
      err.code = 'POLYGON_TIMEOUT';
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([
    Promise.resolve().then(promiseFactory),
    timeoutPromise,
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * In-memory alerts + polygon service.
 * Note: Because the polygon cache lives in memory, after a server restart the first refresh
 * cycle refetches polygons (capped at 20 requests, >=5 s spacing, 1 in-flight, with backoff).
 *
 * @param {{
 *   fetchText?: (url:string, opts?:{timeoutMs?:number, maxBytes?:number})=>Promise<string>,
 *   fetchPolygonText?: (url:string, opts?:{timeoutMs?:number, maxBytes?:number})=>Promise<string>,
 *   districtIndex: Record<string,string[]>,
 *   now?: ()=>number,
 *   sleep?: (ms:number)=>Promise<void>,
 *   log?: (...a:any[])=>void,
 *   geo?: { stateAtPoint?: Function, nearestStateWithin?: Function },
 *   polygonMinIntervalMs?: number,
 *   polygonMaxPerCycle?: number,
 *   polygonTimeoutMs?: number,
 *   polygonMaxBytes?: number,
 *   polygonMaxCacheEntries?: number,
 *   polygonMaxCacheBytes?: number,
 *   polygonBackoffInitialMs?: number,
 *   polygonBackoffMaxMs?: number,
 * }} opts
 */
export function createAlertsService({
  fetchText = httpFetchText,
  fetchPolygonText,
  districtIndex,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = () => {},
  geo = { stateAtPoint, nearestStateWithin },
  polygonMinIntervalMs = POLYGON_MIN_INTERVAL_MS,
  polygonMaxPerCycle = POLYGON_MAX_PER_CYCLE,
  polygonTimeoutMs = POLYGON_TIMEOUT_MS,
  polygonMaxBytes = POLYGON_MAX_BYTES,
  polygonMaxCacheEntries = POLYGON_CACHE_MAX_ENTRIES,
  polygonMaxCacheBytes = POLYGON_CACHE_MAX_BYTES,
  polygonBackoffInitialMs = POLYGON_BACKOFF_INITIAL_MS,
  polygonBackoffMaxMs = POLYGON_BACKOFF_MAX_MS,
}) {
  const capCache = new Map();     // guid -> parsed CAP message (immutable per CAP identifier)
  const polygonCache = new Map(); // polygonUrl -> { url, shapes, bytes, expiresAtMs }
  let polygonCacheTotalBytes = 0;

  let lastGood = null;            // { generatedAt, messages }
  let lastRefreshOk = null;       // null until first attempt finishes
  let lastMissing = 0;
  let running = null;

  let lastPolygonStartMs = null;
  let polygonBackoffMs = 0;
  let polygonPausedUntil = 0;

  const polygonFetcher = fetchPolygonText || ((url, opts) => fetchText(url, opts));

  function deleteCachedPolygon(url) {
    const existing = polygonCache.get(url);
    if (!existing) return false;
    polygonCacheTotalBytes = Math.max(0, polygonCacheTotalBytes - existing.bytes);
    polygonCache.delete(url);
    return true;
  }

  function touchCachedPolygon(url) {
    const entry = polygonCache.get(url);
    if (!entry) return null;
    polygonCache.delete(url);
    polygonCache.set(url, entry);
    return entry;
  }

  function evictExpiredPolygons(currentTime) {
    for (const [url, entry] of polygonCache.entries()) {
      if (entry.expiresAtMs !== null && entry.expiresAtMs <= currentTime) {
        deleteCachedPolygon(url);
      }
    }
  }

  function setCachedPolygon(url, shapes, rawBytes, expiresAtMs, currentTime) {
    evictExpiredPolygons(currentTime);
    const serializedBytes = Buffer.byteLength(url, 'utf8') + Buffer.byteLength(JSON.stringify(shapes), 'utf8');
    const entryBytes = Math.max(rawBytes, serializedBytes);

    if (entryBytes > polygonMaxCacheBytes) {
      return false;
    }

    if (polygonCache.has(url)) {
      deleteCachedPolygon(url);
    }

    // Both 200-entry and 20 MB limits apply; 20 MB total is the binding limit.
    while (
      polygonCache.size > 0 &&
      (polygonCache.size >= polygonMaxCacheEntries || polygonCacheTotalBytes + entryBytes > polygonMaxCacheBytes)
    ) {
      const oldestUrl = polygonCache.keys().next().value;
      if (oldestUrl === undefined) break;
      deleteCachedPolygon(oldestUrl);
    }

    if (polygonCache.size >= polygonMaxCacheEntries || polygonCacheTotalBytes + entryBytes > polygonMaxCacheBytes) {
      return false;
    }

    polygonCache.set(url, { url, shapes, bytes: entryBytes, expiresAtMs });
    polygonCacheTotalBytes += entryBytes;
    return true;
  }

  function syncCacheExpiries(activeMessages) {
    const maxExpiryByUrl = new Map();
    for (const msg of activeMessages) {
      const exp = effectiveExpiry(msg);
      for (const url of messagePolygonUrls(msg)) {
        const prev = maxExpiryByUrl.get(url);
        if (prev === undefined) {
          maxExpiryByUrl.set(url, exp);
        } else if (prev === null || exp === null) {
          maxExpiryByUrl.set(url, null);
        } else if (exp > prev) {
          maxExpiryByUrl.set(url, exp);
        }
      }
    }

    for (const [url, entry] of polygonCache.entries()) {
      if (maxExpiryByUrl.has(url)) {
        entry.expiresAtMs = maxExpiryByUrl.get(url);
      }
    }
  }

  function selectUncachedPolygonTargets(activeMessages) {
    // Oldest alerts first; round-robin across alerts so inland district alerts are never starved.
    const candidates = activeMessages
      .map((msg, idx) => ({
        msg,
        idx,
        sentMs: parseSentMs(msg),
        expiresAtMs: effectiveExpiry(msg),
        urls: Array.isArray(msg.shapes) && msg.shapes.length === 0
          ? messagePolygonUrls(msg).filter((u) => !polygonCache.has(u))
          : [],
      }))
      .filter((item) => item.urls.length > 0)
      .sort((a, b) => (a.sentMs - b.sentMs) || (a.idx - b.idx));

    const queue = [];
    const seenUrls = new Set();
    let depth = 0;

    while (queue.length < polygonMaxPerCycle) {
      let addedInRound = false;
      for (const item of candidates) {
        if (depth < item.urls.length) {
          const url = item.urls[depth];
          addedInRound = true;
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            queue.push({ url, expiresAtMs: item.expiresAtMs });
            if (queue.length >= polygonMaxPerCycle) break;
          }
        }
      }
      if (!addedInRound) break;
      depth += 1;
    }

    return queue;
  }

  async function fillPolygonCache(activeMessages) {
    const currentTime = now();
    syncCacheExpiries(activeMessages);
    evictExpiredPolygons(currentTime);

    if (currentTime < polygonPausedUntil) {
      return;
    }

    const targets = selectUncachedPolygonTargets(activeMessages);
    if (targets.length === 0) return;

    // Strictly 1 in-flight request at a time, spaced >= polygonMinIntervalMs apart.
    for (const target of targets) {
      if (now() < polygonPausedUntil) break;

      if (lastPolygonStartMs !== null && polygonMinIntervalMs > 0) {
        const elapsed = now() - lastPolygonStartMs;
        const remaining = polygonMinIntervalMs - elapsed;
        if (remaining > 0) {
          await sleep(remaining);
        }
      }

      const startTime = now();
      if (startTime < polygonPausedUntil) break;
      lastPolygonStartMs = startTime;

      try {
        const polyXml = await runWithTimeout(
          () => polygonFetcher(target.url, { timeoutMs: polygonTimeoutMs, maxBytes: polygonMaxBytes }),
          polygonTimeoutMs,
        );
        const xmlStr = typeof polyXml === 'string' ? polyXml : String(polyXml ?? '');
        const rawBytes = Buffer.byteLength(xmlStr, 'utf8');
        if (rawBytes > polygonMaxBytes) {
          log(`Polygon skipped (${rawBytes} bytes > ${polygonMaxBytes} limit): ${target.url}`);
          continue;
        }
        const shapes = parsePolygonXml(xmlStr);
        setCachedPolygon(target.url, shapes, rawBytes, target.expiresAtMs, now());
        polygonBackoffMs = 0;
        polygonPausedUntil = 0;
      } catch (err) {
        if (isBackoffTriggerError(err)) {
          polygonBackoffMs = polygonBackoffMs === 0
            ? polygonBackoffInitialMs
            : Math.min(polygonBackoffMs * 2, polygonBackoffMaxMs);
          polygonPausedUntil = now() + polygonBackoffMs;
          log(`Polygon fetch paused ${Math.round(polygonBackoffMs / 60000)}m after error (${target.url}):`, err.message);
          break;
        }
        log(`Polygon fetch skipped for ${target.url}:`, err.message);
      }
    }
  }

  async function refreshOnce() {
    const cycleNow = now();
    evictExpiredPolygons(cycleNow);

    let items;
    try {
      items = parseRss(await fetchText(RSS_URL));
    } catch (e) {
      log('RSS fetch failed:', e.message);
      lastRefreshOk = false;
      return;
    }
    items = items.filter((i) => i.guid);
    const wanted = new Set(items.map((i) => i.guid));
    for (const k of capCache.keys()) if (!wanted.has(k)) capCache.delete(k);

    const fresh = items.filter((i) => !capCache.has(i.guid));
    let failed = 0;
    await mapLimit(fresh, CONCURRENCY, async (it) => {
      try {
        const url = `${CAP_URL}?identifier=${encodeURIComponent(it.guid)}`;
        const msg = parseCap(await fetchText(url), { id: it.guid, pubDate: it.pubDate, title: it.title, link: it.link || url });
        capCache.set(it.guid, msg);
      } catch (e) {
        failed += 1;
        log(`CAP fetch failed for ${it.guid}:`, e.message);
      }
    });

    // If every new item failed and nothing usable is cached, treat it as an upstream failure rather than publishing "nothing".
    if (items.length > 0 && capCache.size === 0) {
      lastRefreshOk = false;
      lastMissing = failed;
      return;
    }

    const currentMessages = items.map((i) => capCache.get(i.guid)).filter(Boolean);
    lastGood = { generatedAt: new Date(now()).toISOString(), messages: currentMessages };
    lastMissing = failed;
    lastRefreshOk = failed === 0;
    log(`Refreshed: ${items.length} items, ${fresh.length} new${failed > 0 ? `, ${failed} incomplete` : ''}`);

    const activeMessages = selectActive(currentMessages, now(), { waterOnly: WATER_ONLY });
    await fillPolygonCache(activeMessages);
  }

  function refresh() {
    if (!running) {
      running = refreshOnce()
        .catch((e) => {
          lastRefreshOk = false;
          log('Refresh error:', e.message);
        })
        .finally(() => {
          running = null;
        });
    }
    return running;
  }

  /** Current public payload, or null before the first successful refresh. Expiry is applied at request time. */
  function getPayload() {
    if (!lastGood) return null;
    const currentNow = now();
    evictExpiredPolygons(currentNow);

    const alerts = selectActive(lastGood.messages, currentNow, { waterOnly: WATER_ONLY }).map((m) => {
      if (Array.isArray(m.shapes) && m.shapes.length === 0) {
        const urls = messagePolygonUrls(m);
        if (urls.length > 0) {
          const cachedShapes = [];
          for (const url of urls) {
            const entry = touchCachedPolygon(url);
            if (entry && (entry.expiresAtMs === null || entry.expiresAtMs > currentNow)) {
              for (const sh of entry.shapes) cachedShapes.push(sh);
            }
          }
          if (cachedShapes.length > 0) {
            return normalizeAlert({ ...m, shapes: cachedShapes }, districtIndex, geo);
          }
        }
      }
      return normalizeAlert(m, districtIndex, geo);
    });

    return {
      generatedAt: lastGood.generatedAt,
      upstreamOk: lastRefreshOk === true,
      alerts,
      unresolvedCount: alerts.filter((a) => a.unresolved).length,
      missingCount: lastMissing,
    };
  }

  return {
    refresh,
    getPayload,
    _cache: capCache,
    _polygonCache: polygonCache,
    _polygonState: () => ({
      entries: polygonCache.size,
      totalBytes: polygonCacheTotalBytes,
      backoffMs: polygonBackoffMs,
      pausedUntil: polygonPausedUntil,
    }),
  };
}
