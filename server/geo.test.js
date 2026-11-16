import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pointInIndia } from './geo.js';
import { parseNcsTime, parseNCSHtml, classifyQuakeLocation, createEarthquakeService } from './earthquakes.js';

describe('pointInIndia polygon lookup', () => {
  test('Guwahati resolves to Assam', () => {
    assert.equal(pointInIndia(26.14, 91.74), 'Assam');
  });

  test('Mumbai resolves to Maharashtra', () => {
    assert.equal(pointInIndia(19.07, 72.88), 'Maharashtra');
  });

  test('Kathmandu resolves to null', () => {
    assert.equal(pointInIndia(27.7, 85.3), null);
  });

  test('Arabian Sea point resolves to null', () => {
    assert.equal(pointInIndia(15.0, 65.0), null);
  });

  test('Lakshadweep island point resolves to Lakshadweep', () => {
    assert.equal(pointInIndia(8.2714, 73.0421), 'Lakshadweep');
  });
});

describe('earthquake enrichment and parsing fixes', () => {
  test('classifyQuakeLocation falls back to state text or ", India" suffix', () => {
    assert.deepEqual(
      classifyQuakeLocation({ latitude: 10.5, longitude: 94.2, region: 'Andaman Sea, India', location: '' }),
      { inIndia: true, state: null },
    );
    assert.deepEqual(
      classifyQuakeLocation({ latitude: 11.0, longitude: 95.0, region: 'Offshore near Andaman and Nicobar Islands', location: '' }),
      { inIndia: true, state: 'Andaman and Nicobar Islands' },
    );
    assert.deepEqual(
      classifyQuakeLocation({ latitude: 27.7, longitude: 85.3, region: 'Nepal', location: 'Kathmandu' }),
      { inIndia: false, state: null },
    );
  });

  test('parseNcsTime parses zone-less timestamps as IST and rejects invalid strings', () => {
    assert.equal(parseNcsTime('2026-11-16 14:30:00'), '2026-11-16T09:00:00.000Z');
    assert.equal(parseNcsTime('not-a-time'), null);
  });

  test('parseNCSHtml skips invalid origin times and counts skipped rows', () => {
    const logs = [];
    const html = `
      <li data-json='{"id":"1","magnitude":"4.1","latitude":"26.14","longitude":"91.74","depth":"10","origin_time":"2026-11-16 14:30:00","region":"Assam"}'></li>
      <li data-json='{"id":"2","magnitude":"3.5","latitude":"26.14","longitude":"91.74","depth":"10","origin_time":"bad-date","region":"Assam"}'></li>
    `;
    const quakes = parseNCSHtml(html, (m) => logs.push(m));
    assert.equal(quakes.length, 1);
    assert.equal(quakes[0].id, 'ncs-1');
    assert.ok(logs.some((m) => m.includes('skipped 1')));
  });

  test('USGS service drops null/NaN magnitudes and includes indiaCount', async () => {
    const nowMs = Date.now() - 60_000;
    const svc = createEarthquakeService({
      fetchImpl: async (url) => {
        if (String(url).includes('riseq.seismo.gov.in')) {
          return { ok: false, status: 503 };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            features: [
              {
                id: 'eq-null',
                properties: { mag: null, time: nowMs, place: 'Assam, India', type: 'earthquake' },
                geometry: { coordinates: [91.74, 26.14, 10] },
              },
              {
                id: 'eq-in',
                properties: { mag: 4.2, time: nowMs, place: 'Guwahati, India', type: 'earthquake' },
                geometry: { coordinates: [91.74, 26.14, 15] },
              },
              {
                id: 'eq-np',
                properties: { mag: 4.8, time: nowMs, place: 'Kathmandu, Nepal', type: 'earthquake' },
                geometry: { coordinates: [85.3, 27.7, 12] },
              },
            ],
          }),
        };
      },
    });

    await svc.refresh();
    const payload = svc.getPayload();
    assert.equal(payload.totalCount, 2);
    assert.equal(payload.indiaCount, 1);
    assert.equal(payload.quakes.find((q) => q.id === 'eq-null'), undefined);
    const indiaQuake = payload.quakes.find((q) => q.id === 'eq-in');
    assert.equal(indiaQuake.inIndia, true);
    assert.equal(indiaQuake.state, 'Assam');
  });
});
