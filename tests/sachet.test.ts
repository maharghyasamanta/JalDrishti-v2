import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSachetAlerts } from '../src/lib/sachet';
import { fetchEarthquakes } from '../src/lib/earthquakes';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_ALERTS_BODY = {
  generatedAt: '2026-11-16T23:41:28.268Z',
  upstreamOk: true,
  alerts: [
    {
      id: 'IN-TEST-1',
      headline: 'High Waves along coast',
      event: 'High Waves',
      hazard: 'coastal',
      severity: 'Moderate',
      description: 'Heavy waves possible.',
      instruction: 'Avoid beaches.',
      areaDesc: 'Visakhapatnam',
      states: ['Andhra Pradesh'],
      placement: 'polygon-coast',
      shapes: [],
      unresolved: false,
      unresolvedAreas: [],
      sender: 'Andhra-Pradesh-SDMA',
      sent: '2026-11-16T05:00:00Z',
      expires: '2026-11-17T12:00:00Z',
      detailsInOriginal: false,
      link: 'https://sachet.ndma.gov.in/test',
    },
  ],
  unresolvedCount: 0,
};

const VALID_QUAKES_BODY = {
  generatedAt: '2026-11-16T23:41:28.268Z',
  source: 'NCS',
  ok: true,
  totalCount: 1,
  indiaCount: 1,
  maxMagnitude: 3.5,
  avgMagnitude: 3.5,
  byMagnitude: { minor: 0, light: 1, moderate: 0, strong: 0, major: 0 },
  quakes: [
    {
      id: 'ncs-1',
      magnitude: 3.5,
      time: '2026-11-16T18:00:00Z',
      latitude: 19.5,
      longitude: 78.9,
      depth: 10,
      region: 'Maharashtra',
      location: 'Nagpur, Maharashtra, India',
      type: 'Reviewed',
      source: 'NCS',
      inIndia: true,
      state: 'Maharashtra',
    },
  ],
};

test('fetchSachetAlerts retries HTTP 503 warmup responses and succeeds once ready', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls < 3) {
      return jsonResponse({ error: 'Alert data not available yet', alerts: [], upstreamOk: false }, 503);
    }
    return jsonResponse(VALID_ALERTS_BODY, 200);
  }) as typeof fetch;

  try {
    const data = await fetchSachetAlerts(undefined, { maxWarmupRetries: 4, warmupDelayMs: 5 });
    assert.equal(calls, 3);
    assert.equal(data.upstreamOk, true);
    assert.equal(data.alerts.length, 1);
    assert.equal(data.alerts[0]?.id, 'IN-TEST-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchSachetAlerts rejects immediately on non-warmup HTTP 500 without retrying', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse({ error: 'Internal error' }, 500);
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchSachetAlerts(undefined, { maxWarmupRetries: 4, warmupDelayMs: 5 }),
      /HTTP 500/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchSachetAlerts aborts cleanly during warmup backoff when AbortSignal fires', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const ctl = new AbortController();
  globalThis.fetch = (async () => {
    calls += 1;
    setTimeout(() => ctl.abort(), 10);
    return jsonResponse({ error: 'Alert data not available yet' }, 503);
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchSachetAlerts(ctl.signal, { maxWarmupRetries: 5, warmupDelayMs: 500 }),
      (err: unknown) => err instanceof Error && err.name === 'AbortError',
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchEarthquakes retries HTTP 503 warmup responses and succeeds once ready', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse({ error: 'Earthquake data not available yet', quakes: [], ok: false }, 503);
    }
    return jsonResponse(VALID_QUAKES_BODY, 200);
  }) as typeof fetch;

  try {
    const data = await fetchEarthquakes(undefined, { maxWarmupRetries: 3, warmupDelayMs: 5 });
    assert.equal(calls, 2);
    assert.equal(data.indiaCount, 1);
    assert.equal(data.quakes.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
