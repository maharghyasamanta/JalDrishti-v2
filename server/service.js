// Fetches the SACHET RSS + CAP messages, caches immutable CAP messages by identifier,
// and serves normalised alerts. In-memory only; no database.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRss } from './rss.js';
import { parseCap, selectActive, normalizeAlert } from './cap.js';

export const RSS_URL = 'https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml';
export const CAP_URL = 'https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile';
export const REFRESH_MS = 10 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 10_000;
export const CONCURRENCY = 4;
/** ALERT_SCOPE=water keeps only water hazards; anything else (default) keeps every hazard type. */
export const WATER_ONLY = (process.env.ALERT_SCOPE || 'all').toLowerCase() === 'water';
export const USER_AGENT = process.env.SACHET_USER_AGENT
  || 'JalDrishti-AlertsProxy/1.0 (independent hazard-alert dashboard; caches public SACHET CAP feed, 1 request per new alert, refresh every 10 min)';
const MAX_BYTES = 10 * 1024 * 1024;

export async function httpFetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml, text/xml;q=0.9, */*;q=0.5' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error(`Response too large (${len} bytes)`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('Response too large');
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

/**
 * @param {{ fetchText?: (url:string)=>Promise<string>, districtIndex: Record<string,string[]>, now?: ()=>number, log?: (...a:any[])=>void }} opts
 */
export function createAlertsService({ fetchText = httpFetchText, districtIndex, now = Date.now, log = () => {} }) {
  const capCache = new Map();   // guid -> parsed CAP message (CAP messages are immutable)
  let lastGood = null;          // { generatedAt, messages }
  let lastRefreshOk = null;     // null until first attempt finishes
  let lastMissing = 0;
  let running = null;

  async function refreshOnce() {
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
    if (items.length > 0 && capCache.size === 0) { lastRefreshOk = false; lastMissing = failed; return; }

    lastGood = { generatedAt: new Date(now()).toISOString(), messages: items.map((i) => capCache.get(i.guid)).filter(Boolean) };
    lastMissing = failed;
    lastRefreshOk = failed === 0;
    log(`Refreshed: ${items.length} items, ${fresh.length} new${failed > 0 ? `, ${failed} incomplete` : ''}`);
  }

  function refresh() {
    if (!running) running = refreshOnce().catch((e) => { lastRefreshOk = false; log('Refresh error:', e.message); }).finally(() => { running = null; });
    return running;
  }

  /** Current public payload, or null before the first successful refresh. Expiry is applied at request time. */
  function getPayload() {
    if (!lastGood) return null;
    const alerts = selectActive(lastGood.messages, now(), { waterOnly: WATER_ONLY }).map((m) => normalizeAlert(m, districtIndex));
    return {
      generatedAt: lastGood.generatedAt,
      upstreamOk: lastRefreshOk === true,
      alerts,
      unresolvedCount: alerts.filter((a) => a.unresolved).length,
      missingCount: lastMissing,
    };
  }

  return { refresh, getPayload, _cache: capCache };
}
