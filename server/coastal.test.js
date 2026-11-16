import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCap, selectActive, normalizeAlert, placeAlert } from './cap.js';
import { stateAtPoint, nearestStateWithin } from './geo.js';
import { STATE_CODES } from './states.js';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const geo = { stateAtPoint, nearestStateWithin };

const wrapCap = (infoInner, { id = 'C1', sent = '2026-11-16T08:00:00Z' } = {}) => `<?xml version="1.0"?>
<cap:alert xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">
  <cap:identifier>${id}</cap:identifier>
  <cap:sender>incois@ndma.gov.in</cap:sender>
  <cap:sent>${sent}</cap:sent>
  <cap:status>Actual</cap:status>
  <cap:msgType>Alert</cap:msgType>
  <cap:info>
    <cap:language>en-IN</cap:language>
    ${infoInner}
  </cap:info>
</cap:alert>`;

test('parses valid polygon and circle shapes, strips consecutive duplicates, rounds to 3 decimals', () => {
  const xml = wrapCap(`
    <cap:event>High Wave Alert</cap:event>
    <cap:severity>Moderate</cap:severity>
    <cap:area>
      <cap:areaDesc>Palmanpeta - Bhimumipatnam</cap:areaDesc>
      <cap:polygon>17.88123,83.46111 17.88123,83.46121 17.92456,83.50199 17.84911,83.52988 17.88123,83.46111</cap:polygon>
      <cap:circle>17.8904,83.4508 25.555</cap:circle>
    </cap:area>
  `);
  const msg = parseCap(xml);
  assert.equal(msg.shapes.length, 2);
  assert.equal(msg.shapes[0].kind, 'polygon');
  assert.deepEqual(msg.shapes[0].coords[0], [17.881, 83.461]);
  // Second point had identical 3-decimal rounded coordinates so consecutive duplicate was dropped
  assert.equal(msg.shapes[0].coords.length, 4);
  assert.deepEqual(msg.shapes[1], { kind: 'circle', lat: 17.89, lon: 83.451, radiusKm: 25.56 });
});

test('drops invalid polygons and out-of-bounds circles cleanly', () => {
  const xml = wrapCap(`
    <cap:event>Rough Sea</cap:event>
    <cap:severity>Minor</cap:severity>
    <cap:area>
      <cap:areaDesc>Offshore</cap:areaDesc>
      <cap:polygon>17.5,83.2 17.6,83.3</cap:polygon>
      <cap:polygon>55.0,83.2 17.6,83.3 17.7,83.4 55.0,83.2</cap:polygon>
      <cap:polygon>bad,coords 17.6,83.3 17.7,83.4</cap:polygon>
      <cap:circle>17.5,120.2 30</cap:circle>
      <cap:circle>17.5,83.2 -5</cap:circle>
      <cap:polygon>17.65,83.25 17.75,83.35 17.68,83.42 17.65,83.25</cap:polygon>
    </cap:area>
  `);
  const msg = parseCap(xml);
  assert.equal(msg.shapes.length, 1);
  assert.equal(msg.shapes[0].kind, 'polygon');
});

test('caps polygon rings at 500 vertices and per-alert shapes at 20 / 1000 vertices', () => {
  const ringPts = [];
  for (let i = 0; i < 640; i += 1) {
    const angle = (i / 640) * Math.PI * 2;
    const lat = (17.5 + Math.sin(angle) * 0.4).toFixed(3);
    const lon = (83.2 + Math.cos(angle) * 0.4).toFixed(3);
    ringPts.push(`${lat},${lon}`);
  }
  const bigPoly = `<cap:polygon>${ringPts.join(' ')}</cap:polygon>`;
  const areas = Array.from({ length: 24 }, (_, idx) => `<cap:area><cap:areaDesc>Zone ${idx}</cap:areaDesc>${bigPoly}</cap:area>`).join('');
  const msg = parseCap(wrapCap(`<cap:event>Flood</cap:event><cap:severity>Severe</cap:severity>${areas}`));
  assert.ok(msg.shapes.length <= 20, `expected <= 20 shapes, got ${msg.shapes.length}`);
  for (const s of msg.shapes) {
    if (s.kind === 'polygon') assert.ok(s.coords.length <= 500);
  }
  const totalVertices = msg.shapes.reduce((sum, s) => sum + (s.kind === 'polygon' ? s.coords.length : 1), 0);
  assert.ok(totalVertices <= 1000, `expected <= 1000 total vertices, got ${totalVertices}`);
});

test('extracts description and instruction (trimmed, max 600 chars) and re-classifies SDMA Alert waves to coastal', () => {
  const longDesc = 'High waves in the range of 2.8 - 3.4 meters forecasted along coast. Fishermen advised not to venture into the sea. ' + 'x'.repeat(650);
  const xml = wrapCap(`
    <cap:event>SDMA Alert</cap:event>
    <cap:category>Other</cap:category>
    <cap:headline>INCOIS Bulletin</cap:headline>
    <cap:description>${longDesc}</cap:description>
    <cap:instruction>  Small vessels stay in harbour.  </cap:instruction>
    <cap:severity>Moderate</cap:severity>
    <cap:area><cap:areaDesc>Palmanpeta - Bhimumipatnam</cap:areaDesc></cap:area>
  `);
  const msg = parseCap(xml);
  assert.equal(msg.hazard, 'coastal');
  assert.equal(msg.waterRelated, true);
  assert.ok(msg.description.length <= 600);
  assert.equal(msg.instruction, 'Small vessels stay in harbour.');
  assert.equal(selectActive([msg], NOW, { waterOnly: true }).length, 1);
});

test('Palmanpeta - Bhimumipatnam coastal polygon places Andhra Pradesh without text district match', () => {
  // Fixture with shoreline + near-shore Bay of Bengal polygon around Bheemunipatnam (Visakhapatnam coast)
  const coastalXml = wrapCap(`
    <cap:event>High Wave Warning</cap:event>
    <cap:severity>Moderate</cap:severity>
    <cap:senderName>INCOIS</cap:senderName>
    <cap:description>High waves along Palmanpeta - Bhimumipatnam coast.</cap:description>
    <cap:area>
      <cap:areaDesc>Palmanpeta - Bhimumipatnam</cap:areaDesc>
      <cap:polygon>17.890,83.450 17.920,83.490 17.870,83.520 17.840,83.480 17.890,83.450</cap:polygon>
    </cap:area>
  `);
  const onshoreAlert = normalizeAlert(parseCap(coastalXml), {}, geo);
  assert.equal(onshoreAlert.hazard, 'coastal');
  assert.deepEqual(onshoreAlert.states, ['Andhra Pradesh']);
  assert.equal(onshoreAlert.placement, 'polygon');
  assert.equal(onshoreAlert.unresolved, false);

  // Purely offshore polygon (~6-10 km off Bhimumipatnam in Bay of Bengal) triggers 'polygon-coast' within 60 km
  const offshoreXml = wrapCap(`
    <cap:event>High Wave Warning</cap:event>
    <cap:severity>Moderate</cap:severity>
    <cap:senderName>INCOIS</cap:senderName>
    <cap:area>
      <cap:areaDesc>Palmanpeta - Bhimumipatnam Sea Zone</cap:areaDesc>
      <cap:polygon>17.850,83.550 17.870,83.590 17.820,83.600 17.810,83.560 17.850,83.550</cap:polygon>
    </cap:area>
  `);
  const offshoreAlert = normalizeAlert(parseCap(offshoreXml), {}, geo);
  assert.equal(offshoreAlert.hazard, 'coastal');
  assert.deepEqual(offshoreAlert.states, ['Andhra Pradesh']);
  assert.equal(offshoreAlert.placement, 'polygon-coast');
  assert.equal(offshoreAlert.unresolved, false);
});

test('multi-state polygon checks vertices and edge midpoints so every touched state is listed', () => {
  // Spans across Telangana (around 17.4, 78.5) into Andhra Pradesh (around 16.5, 80.6)
  const msg = parseCap(wrapCap(`
    <cap:event>Heavy Rain</cap:event>
    <cap:severity>Severe</cap:severity>
    <cap:area>
      <cap:areaDesc>Basin Sector A</cap:areaDesc>
      <cap:polygon>17.400,78.500 16.500,80.600 16.200,79.900 17.400,78.500</cap:polygon>
    </cap:area>
  `));
  const alert = normalizeAlert(msg, {}, geo);
  assert.equal(alert.placement, 'polygon');
  assert.deepEqual(alert.states, ['Andhra Pradesh', 'Telangana']);
});

test('geocode attribution uses STATE_CODES with alternates (AP, TG) and rejects unmapped prefixes', () => {
  assert.equal(STATE_CODES.TG, 'Telangana');
  assert.equal(STATE_CODES.TS, 'Telangana');

  const apMsg = parseCap(wrapCap(`
    <cap:event>Thunderstorm</cap:event>
    <cap:severity>Moderate</cap:severity>
    <cap:area>
      <cap:areaDesc>Coastal Belt</cap:areaDesc>
      <cap:geocode><cap:valueName>SDMA</cap:valueName><cap:value>AP-04</cap:value></cap:geocode>
      <cap:geocode><cap:valueName>SDMA</cap:valueName><cap:value>TG-11</cap:value></cap:geocode>
      <cap:geocode><cap:valueName>OTHER</cap:valueName><cap:value>ZZ-99</cap:value></cap:geocode>
    </cap:area>
  `));
  const res = placeAlert(apMsg, {}, geo);
  assert.equal(res.placement, 'geocode');
  assert.deepEqual(res.states, ['Andhra Pradesh', 'Telangana']);
  assert.equal(res.unresolved, false);
});

test('senderName state fallback yields placement "sender" and fails cleanly to "none"', () => {
  const senderMsg = parseCap(wrapCap(`
    <cap:event>High Waves</cap:event>
    <cap:severity>Severe</cap:severity>
    <cap:senderName>Andhra Pradesh SDMA</cap:senderName>
    <cap:area><cap:areaDesc>Coastal Sector 3</cap:areaDesc></cap:area>
  `));
  const res = placeAlert(senderMsg, {}, geo);
  assert.equal(res.placement, 'sender');
  assert.deepEqual(res.states, ['Andhra Pradesh']);
  assert.equal(res.unresolved, false);

  const noneMsg = parseCap(wrapCap(`
    <cap:event>High Waves</cap:event>
    <cap:severity>Minor</cap:severity>
    <cap:senderName>INCOIS</cap:senderName>
    <cap:area><cap:areaDesc>Open Sea Sector 9</cap:areaDesc></cap:area>
  `));
  const noneRes = placeAlert(noneMsg, {}, geo);
  assert.equal(noneRes.placement, 'none');
  assert.deepEqual(noneRes.states, []);
  assert.equal(noneRes.unresolved, true);
});
