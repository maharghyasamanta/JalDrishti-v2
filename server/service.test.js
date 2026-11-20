import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAlertsService,
  RSS_URL,
  CAP_URL,
  POLYGON_CONCURRENCY,
  POLYGON_MIN_INTERVAL_MS,
  POLYGON_MAX_PER_CYCLE,
  POLYGON_TIMEOUT_MS,
  POLYGON_MAX_BYTES,
  POLYGON_BACKOFF_INITIAL_MS,
  POLYGON_BACKOFF_MAX_MS,
  POLYGON_CACHE_MAX_ENTRIES,
  POLYGON_CACHE_MAX_BYTES,
} from './service.js';
import { createHandler } from './index.js';
import http from 'node:http';

const index = { pune: ['Maharashtra'], puri: ['Odisha'] };
const NOW = Date.parse('2026-11-12T10:00:00Z');
const rss = (ids) => `<rss version="2.0"><channel><title>x</title>${ids.map((i) =>
  `<item><title>t ${i}</title><guid>${i}</guid><link>https://example.test/${i}</link><pubDate>Thu, 12 Nov 2026 12:00:00 +0530</pubDate></item>`).join('')}</channel></rss>`;
const capXml = (id, type = 'Alert', refs = '') => `<alert><identifier>${id}</identifier><sent>2026-11-12T08:00:00Z</sent><status>Actual</status><msgType>${type}</msgType>
  ${refs ? `<references>s,${refs},2026-11-12T07:00:00Z</references>` : ''}<info><language>en</language><event>Flood</event><severity>Severe</severity>
  <expires>2026-11-12T20:00:00Z</expires><senderName>S</senderName><area><areaDesc>Pune</areaDesc></area></info></alert>`;

const polyCapXml = ({
  id,
  sent = '2026-11-12T08:00:00Z',
  expires = '2026-11-12T20:00:00Z',
  event = 'Heavy Rain',
  areaDesc = 'Pune',
  polygonUrls = [],
}) => `<alert><identifier>${id}</identifier><sent>${sent}</sent><status>Actual</status><msgType>Alert</msgType>
  <info><language>en</language><event>${event}</event><severity>Severe</severity>
  <expires>${expires}</expires><senderName>IMD</senderName>
  ${polygonUrls.map((u) => `<parameter><valueName>Polygon URL</valueName><value>${u}</value></parameter>`).join('')}
  <area><areaDesc>${areaDesc}</areaDesc></area></info></alert>`;

const samplePolygonXml = (id, padBytes = 0) => {
  const comment = padBytes > 0 ? `<!--${'x'.repeat(padBytes)}-->` : '';
  return `<alert><identifier>${id}</identifier>${comment}<polygon>19.80,85.80 19.85,85.85 19.75,85.88 19.80,85.80</polygon></alert>`;
};

function fakeUpstream() {
  const calls = [];
  const state = { ids: ['A', 'B'], rssFails: false, capFails: new Set(), types: {} };
  const fetchText = async (url) => {
    calls.push(url);
    if (url === RSS_URL) { if (state.rssFails) throw new Error('boom'); return rss(state.ids); }
    const id = new URL(url).searchParams.get('identifier');
    if (state.capFails.has(id)) throw new Error('cap boom');
    const t = state.types[id];
    return capXml(id, t?.type, t?.refs);
  };
  return { state, calls, fetchText };
}

test('only NEW items are fetched on later runs (CAP cache)', async () => {
  const up = fakeUpstream();
  const svc = createAlertsService({ fetchText: up.fetchText, districtIndex: index, now: () => NOW });
  await svc.refresh();
  assert.equal(up.calls.filter((u) => u.startsWith(CAP_URL)).length, 2);
  up.state.ids = ['A', 'B', 'C'];
  await svc.refresh();
  assert.equal(up.calls.filter((u) => u.startsWith(CAP_URL)).length, 3);
  assert.equal(svc.getPayload().alerts.length, 3);
});

test('upstream RSS failure keeps last good data with old generatedAt and upstreamOk=false', async () => {
  const up = fakeUpstream();
  let t = NOW;
  const svc = createAlertsService({ fetchText: up.fetchText, districtIndex: index, now: () => t });
  assert.equal(svc.getPayload(), null);
  await svc.refresh();
  const first = svc.getPayload();
  assert.equal(first.upstreamOk, true);
  t += 600_000; up.state.rssFails = true;
  await svc.refresh();
  const second = svc.getPayload();
  assert.equal(second.upstreamOk, false);
  assert.equal(second.generatedAt, first.generatedAt);
  assert.equal(second.alerts.length, 2);
});

test('first refresh failing yields no payload (503), not an empty all-clear', async () => {
  const up = fakeUpstream(); up.state.rssFails = true;
  const svc = createAlertsService({ fetchText: up.fetchText, districtIndex: index, now: () => NOW });
  await svc.refresh();
  assert.equal(svc.getPayload(), null);
});

test('HTML error page instead of RSS is a failure', async () => {
  const svc = createAlertsService({ fetchText: async () => '<html><body>Error</body></html>', districtIndex: index, now: () => NOW });
  await svc.refresh();
  assert.equal(svc.getPayload(), null);
});

test('all CAP fetches failing is a failure, partial failure is flagged', async () => {
  const up = fakeUpstream(); up.state.capFails = new Set(['A', 'B']);
  const svc = createAlertsService({ fetchText: up.fetchText, districtIndex: index, now: () => NOW });
  await svc.refresh();
  assert.equal(svc.getPayload(), null);
  up.state.capFails = new Set(['B']);
  await svc.refresh();
  const p = svc.getPayload();
  assert.equal(p.alerts.length, 1);
  assert.equal(p.upstreamOk, false);
  assert.equal(p.missingCount, 1);
});

test('a genuinely empty feed is ok with zero alerts', async () => {
  const up = fakeUpstream(); up.state.ids = [];
  const svc = createAlertsService({ fetchText: up.fetchText, districtIndex: index, now: () => NOW });
  await svc.refresh();
  const p = svc.getPayload();
  assert.deepEqual([p.upstreamOk, p.alerts.length], [true, 0]);
});

test('Cancel message in the feed removes the referenced alert', async () => {
  const up = fakeUpstream(); up.state.ids = ['A', 'C'];
  up.state.types = { C: { type: 'Cancel', refs: 'A' } };
  const svc = createAlertsService({ fetchText: up.fetchText, districtIndex: index, now: () => NOW });
  await svc.refresh();
  assert.deepEqual(svc.getPayload().alerts.map((a) => a.id), []);
});

test('unresolved alerts are returned and counted', async () => {
  const up = fakeUpstream();
  const svc = createAlertsService({ fetchText: up.fetchText, districtIndex: {}, now: () => NOW });
  await svc.refresh();
  const p = svc.getPayload();
  assert.equal(p.alerts.length, 2);
  assert.equal(p.unresolvedCount, 2);
});

test('HTTP: 503 before data, 200 with Cache-Control after', async () => {
  const up = fakeUpstream();
  const svc = createAlertsService({ fetchText: up.fetchText, districtIndex: index, now: () => NOW });
  const server = http.createServer(createHandler(svc));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let r = await fetch(`${base}/api/alerts`);
    assert.equal(r.status, 503);
    assert.deepEqual((await r.json()).alerts, []);
    await svc.refresh();
    r = await fetch(`${base}/api/alerts`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=300');
    const body = await r.json();
    assert.deepEqual(Object.keys(body).slice(0, 4), ['generatedAt', 'upstreamOk', 'alerts', 'unresolvedCount']);
  } finally { server.close(); }
});

test('polygon constants enforce required rate, size, cache, and backoff limits', () => {
  assert.equal(POLYGON_CONCURRENCY, 1);
  assert.equal(POLYGON_MIN_INTERVAL_MS, 5_000);
  assert.equal(POLYGON_MAX_PER_CYCLE, 20);
  assert.equal(POLYGON_TIMEOUT_MS, 10_000);
  assert.equal(POLYGON_MAX_BYTES, 1_048_576);
  assert.equal(POLYGON_BACKOFF_INITIAL_MS, 15 * 60 * 1000);
  assert.equal(POLYGON_BACKOFF_MAX_MS, 60 * 60 * 1000);
  assert.equal(POLYGON_CACHE_MAX_ENTRIES, 200);
  assert.equal(POLYGON_CACHE_MAX_BYTES, 20 * 1024 * 1024);
});

test('polygon queue runs 1 in-flight, >=5s apart, oldest uncached round-robin across alerts', async () => {
  let clock = NOW;
  let inFlight = 0;
  let maxInFlight = 0;
  const polyStarts = [];
  const sleepCalls = [];

  const u = (n) => `https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=${n}`;
  const alertsById = {
    INLAND_OLD: polyCapXml({
      id: 'INLAND_OLD',
      sent: '2026-11-12T06:00:00Z',
      event: 'Heavy Rain',
      areaDesc: 'Puri district of Odisha',
      polygonUrls: [u('I1'), u('I2')],
    }),
    COASTAL_NEW: polyCapXml({
      id: 'COASTAL_NEW',
      sent: '2026-11-12T09:00:00Z',
      event: 'High Waves',
      areaDesc: 'Coastal Zone',
      polygonUrls: [u('C1')],
    }),
    INLAND_MID: polyCapXml({
      id: 'INLAND_MID',
      sent: '2026-11-12T07:30:00Z',
      event: 'Flood',
      areaDesc: 'Pune district',
      polygonUrls: [u('M1')],
    }),
  };

  const fetchText = async (url) => {
    if (url === RSS_URL) return rss(['COASTAL_NEW', 'INLAND_MID', 'INLAND_OLD']);
    if (url.startsWith(CAP_URL)) {
      return alertsById[new URL(url).searchParams.get('identifier')];
    }
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    polyStarts.push({ url, at: clock });
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return samplePolygonXml(url);
  };

  const svc = createAlertsService({
    fetchText,
    districtIndex: index,
    now: () => clock,
    sleep: async (ms) => {
      sleepCalls.push(ms);
      clock += ms;
    },
  });

  await svc.refresh();

  assert.equal(maxInFlight, 1);
  // Oldest uncached round-robin: round 0 => INLAND_OLD(I1), INLAND_MID(M1), COASTAL_NEW(C1); round 1 => INLAND_OLD(I2)
  assert.deepEqual(
    polyStarts.map((x) => x.url),
    [u('I1'), u('M1'), u('C1'), u('I2')],
  );
  for (let i = 1; i < polyStarts.length; i += 1) {
    assert.ok(polyStarts[i].at - polyStarts[i - 1].at >= 5_000);
  }
  assert.deepEqual(sleepCalls, [5_000, 5_000, 5_000]);

  const payload = svc.getPayload();
  const oldAlert = payload.alerts.find((a) => a.id === 'INLAND_OLD');
  assert.equal(oldAlert.shapes.length, 2);
});

test('restart / cold cache caps at 20 fetches per cycle and finishes remainder on next cycle', async () => {
  let clock = NOW;
  const polyFetches = [];
  const ids = Array.from({ length: 25 }, (_, i) => `A${String(i).padStart(2, '0')}`);
  const u = (id) => `https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=${id}`;

  const fetchText = async (url) => {
    if (url === RSS_URL) return rss(ids);
    if (url.startsWith(CAP_URL)) {
      const id = new URL(url).searchParams.get('identifier');
      const idx = Number(id.slice(1));
      const sent = new Date(NOW - (25 - idx) * 60_000).toISOString();
      return polyCapXml({ id, sent, polygonUrls: [u(id)] });
    }
    polyFetches.push(url);
    return samplePolygonXml(url);
  };

  const svc = createAlertsService({
    fetchText,
    districtIndex: index,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
  });

  await svc.refresh();
  assert.equal(polyFetches.length, 20);
  assert.equal(svc._polygonState().entries, 20);

  await svc.refresh();
  assert.equal(polyFetches.length, 25);
  assert.equal(svc._polygonState().entries, 25);
});

test('enforces 1 MB polygon limit and 10s timeout + 15m -> 30m -> 1h backoff reset on success', async () => {
  let clock = NOW;
  let mode = '429';
  const polyCalls = [];
  const u1 = 'https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=P1';
  const uBig = 'https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=BIG';

  const fetchText = async (url) => {
    if (url === RSS_URL) return rss(['BIG', 'P1']);
    if (url.startsWith(CAP_URL)) {
      const id = new URL(url).searchParams.get('identifier');
      if (id === 'BIG') return polyCapXml({ id, sent: '2026-11-12T05:00:00Z', polygonUrls: [uBig] });
      return polyCapXml({ id, sent: '2026-11-12T06:00:00Z', polygonUrls: [u1] });
    }
    polyCalls.push(url);
    if (url === uBig) {
      return samplePolygonXml('BIG', POLYGON_MAX_BYTES + 100); // > 1 MB
    }
    if (mode === '429') {
      const err = new Error('HTTP 429 Too Many Requests');
      err.status = 429;
      throw err;
    }
    if (mode === '403') {
      const err = new Error('HTTP 403 Forbidden');
      err.status = 403;
      throw err;
    }
    if (mode === '503') {
      const err = new Error('HTTP 503 Unavailable');
      err.status = 503;
      throw err;
    }
    if (mode === 'timeout') {
      return new Promise(() => {}); // hangs until polygonTimeoutMs
    }
    return samplePolygonXml('P1');
  };

  const svc = createAlertsService({
    fetchText,
    districtIndex: index,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    polygonTimeoutMs: 25,
  });

  // BIG (>1MB) is skipped without crashing, P1 hits 429 => 15 min backoff
  await svc.refresh();
  assert.equal(svc._polygonState().backoffMs, 15 * 60 * 1000);
  assert.equal(svc._polygonState().entries, 0);

  // During 15 min pause, P1 is NOT refetched
  const countBefore = polyCalls.length;
  clock += 10 * 60 * 1000;
  await svc.refresh();
  assert.equal(polyCalls.length, countBefore);

  // After 15 min elapses, 403 doubles backoff to 30 min
  clock += 5 * 60 * 1000 + 1;
  mode = '403';
  await svc.refresh();
  assert.equal(svc._polygonState().backoffMs, 30 * 60 * 1000);

  // After 30 min, 503 doubles backoff to 1 hour (cap)
  clock += 30 * 60 * 1000 + 1;
  mode = '503';
  await svc.refresh();
  assert.equal(svc._polygonState().backoffMs, 60 * 60 * 1000);

  // After 1 hour, timeout keeps backoff capped at 1 hour
  clock += 60 * 60 * 1000 + 1;
  mode = 'timeout';
  await svc.refresh();
  assert.equal(svc._polygonState().backoffMs, 60 * 60 * 1000);

  // After 1 hour, success stores P1 and resets backoff immediately to 0
  clock += 60 * 60 * 1000 + 1;
  mode = 'ok';
  await svc.refresh();
  assert.equal(svc._polygonState().backoffMs, 0);
  assert.equal(svc._polygonState().pausedUntil, 0);
  assert.equal(svc._polygonState().entries, 1);
  assert.equal(svc.getPayload().alerts.find((a) => a.id === 'P1').shapes.length, 1);
});

test('caches by Polygon URL, enforces 200-entry limit and binding 20 MB limit', async () => {
  let clock = NOW;
  const sharedUrl = 'https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=SHARED';
  let polyFetchCount = 0;

  // 1. Two CAP IDs sharing one Polygon URL create 1 cache entry and 1 polygon fetch
  const svcShared = createAlertsService({
    fetchText: async (url) => {
      if (url === RSS_URL) return rss(['C1', 'C2']);
      if (url.startsWith(CAP_URL)) {
        const id = new URL(url).searchParams.get('identifier');
        return polyCapXml({ id, polygonUrls: [sharedUrl] });
      }
      polyFetchCount += 1;
      return samplePolygonXml(url);
    },
    districtIndex: index,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
  });
  await svcShared.refresh();
  assert.equal(polyFetchCount, 1);
  assert.equal(svcShared._polygonState().entries, 1);
  assert.equal(svcShared._polygonCache.has(sharedUrl), true);

  // 2. 200-entry cap across 210 small polygons
  const ids210 = Array.from({ length: 210 }, (_, i) => `E${i}`);
  let currentIds = ids210;
  const svcEntries = createAlertsService({
    fetchText: async (url) => {
      if (url === RSS_URL) return rss(currentIds);
      if (url.startsWith(CAP_URL)) {
        const id = new URL(url).searchParams.get('identifier');
        const idx = Number(id.slice(1));
        return polyCapXml({
          id,
          sent: new Date(NOW - (210 - idx) * 1000).toISOString(),
          polygonUrls: [`https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=${id}`],
        });
      }
      return samplePolygonXml(url);
    },
    districtIndex: index,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    polygonMinIntervalMs: 0,
  });
  for (let c = 0; c < 11; c += 1) {
    await svcEntries.refresh();
  }
  assert.equal(svcEntries._polygonState().entries, 200);
  assert.equal(svcEntries._polygonCache.has('https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=E0'), false);
  assert.equal(svcEntries._polygonCache.has('https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=E209'), true);

  // 3. Binding 20 MB limit evicts BEFORE 200 entries when 23 ~960 KB polygons are loaded
  const ids23 = Array.from({ length: 23 }, (_, i) => `B${i}`);
  const largePad = 960 * 1024; // < 1 MB per fetch, 23 * 960 KB = 21.5 MB > 20 MB
  const svcBytes = createAlertsService({
    fetchText: async (url) => {
      if (url === RSS_URL) return rss(ids23);
      if (url.startsWith(CAP_URL)) {
        const id = new URL(url).searchParams.get('identifier');
        const idx = Number(id.slice(1));
        return polyCapXml({
          id,
          sent: new Date(NOW - (23 - idx) * 1000).toISOString(),
          polygonUrls: [`https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=${id}`],
        });
      }
      return samplePolygonXml(url, largePad);
    },
    districtIndex: index,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    polygonMinIntervalMs: 0,
  });
  await svcBytes.refresh();
  await svcBytes.refresh();
  assert.ok(svcBytes._polygonState().totalBytes <= POLYGON_CACHE_MAX_BYTES);
  assert.ok(svcBytes._polygonState().entries <= 21);
  assert.equal(svcBytes._polygonCache.has('https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=B0'), false);
  assert.equal(svcBytes._polygonCache.has('https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=B22'), true);
});

test('evicts expired alert polygons and keeps last good copy when refresh fails', async () => {
  let clock = NOW;
  let failRss = false;
  const uKeep = 'https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=KEEP';
  const uExpire = 'https://sachet.ndma.gov.in/cap_public_website/FetchPolygonXMLFile?identifier=EXPIRE';

  const svc = createAlertsService({
    fetchText: async (url) => {
      if (url === RSS_URL) {
        if (failRss) throw new Error('RSS outage');
        return rss(['KEEP', 'EXPIRE']);
      }
      if (url.startsWith(CAP_URL)) {
        const id = new URL(url).searchParams.get('identifier');
        const expires = id === 'KEEP' ? '2026-11-12T20:00:00Z' : '2026-11-12T12:00:00Z';
        return polyCapXml({ id, expires, polygonUrls: [id === 'KEEP' ? uKeep : uExpire] });
      }
      return samplePolygonXml(url);
    },
    districtIndex: index,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    polygonMinIntervalMs: 0,
  });

  await svc.refresh();
  assert.equal(svc._polygonState().entries, 2);

  // Subsequent refresh failure preserves last good polygon cache for non-expired alerts
  failRss = true;
  await svc.refresh();
  assert.equal(svc.getPayload().upstreamOk, false);
  assert.equal(svc._polygonState().entries, 2);
  assert.equal(svc.getPayload().alerts.find((a) => a.id === 'KEEP').shapes.length, 1);

  // Advance clock past EXPIRE alert's expiry -> EXPIRE entry evicted, KEEP retained
  clock = Date.parse('2026-11-12T12:05:00Z');
  await svc.refresh();
  assert.equal(svc._polygonCache.has(uExpire), false);
  assert.equal(svc._polygonCache.has(uKeep), true);
  assert.equal(svc._polygonState().entries, 1);
  assert.equal(svc.getPayload().alerts.find((a) => a.id === 'KEEP').shapes.length, 1);
});

