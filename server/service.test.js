import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAlertsService, RSS_URL, CAP_URL } from './service.js';
import { createHandler } from './index.js';
import http from 'node:http';

const index = { pune: ['Maharashtra'] };
const NOW = Date.parse('2026-11-12T10:00:00Z');
const rss = (ids) => `<rss version="2.0"><channel><title>x</title>${ids.map((i) =>
  `<item><title>t ${i}</title><guid>${i}</guid><link>https://example.test/${i}</link><pubDate>Thu, 12 Nov 2026 12:00:00 +0530</pubDate></item>`).join('')}</channel></rss>`;
const capXml = (id, type = 'Alert', refs = '') => `<alert><identifier>${id}</identifier><sent>2026-11-12T08:00:00Z</sent><status>Actual</status><msgType>${type}</msgType>
  ${refs ? `<references>s,${refs},2026-11-12T07:00:00Z</references>` : ''}<info><language>en</language><event>Flood</event><severity>Severe</severity>
  <expires>2026-11-12T20:00:00Z</expires><senderName>S</senderName><area><areaDesc>Pune</areaDesc></area></info></alert>`;

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
