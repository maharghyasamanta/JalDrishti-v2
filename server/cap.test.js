import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCap, parseReferences, selectActive, normalizeAlert, classifyHazard, DETAILS_IN_ORIGINAL } from './cap.js';

const index = { pune: ['Maharashtra'], aurangabad: ['Bihar', 'Maharashtra'], kamrup: ['Assam'] };
const NOW = Date.parse('2026-11-12T10:00:00Z');

const cap = ({ id = 'A1', msgType = 'Alert', sent = '2026-11-12T08:00:00+00:00', expires = '2026-11-12T20:00:00+00:00',
  refs = '', infos } = {}) => `<?xml version="1.0"?>
<cap:alert xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">
  <cap:identifier>${id}</cap:identifier><cap:sender>controlroom@ndma.gov.in</cap:sender>
  ${sent === null ? '' : `<cap:sent>${sent}</cap:sent>`}<cap:status>Actual</cap:status><cap:msgType>${msgType}</cap:msgType>
  ${refs ? `<cap:references>${refs}</cap:references>` : ''}
  ${infos ?? `<cap:info><cap:language>en-IN</cap:language><cap:category>Met</cap:category><cap:event>Heavy Rain</cap:event>
    <cap:severity>Severe</cap:severity>${expires ? `<cap:expires>${expires}</cap:expires>` : ''}
    <cap:senderName>IMD Pune</cap:senderName><cap:headline>Heavy rain likely</cap:headline>
    <cap:area><cap:areaDesc>Pune, Maharashtra</cap:areaDesc></cap:area>
    <cap:area><cap:areaDesc>Kamrup</cap:areaDesc></cap:area></cap:info>`}
</cap:alert>`;

test('uses English info block only and reads ALL areas', () => {
  const xml = cap({ infos: `
    <cap:info><cap:language>hi-IN</cap:language><cap:event>भारी बारिश</cap:event><cap:severity>Severe</cap:severity>
      <cap:headline>भारी बारिश की चेतावनी</cap:headline><cap:area><cap:areaDesc>पुणे</cap:areaDesc></cap:area></cap:info>
    <cap:info><cap:language>en-IN</cap:language><cap:event>Heavy Rain</cap:event><cap:severity>Severe</cap:severity>
      <cap:senderName>IMD</cap:senderName><cap:headline>Heavy rain</cap:headline>
      <cap:area><cap:areaDesc>Pune</cap:areaDesc></cap:area><cap:area><cap:areaDesc>Kamrup</cap:areaDesc></cap:area></cap:info>` });
  const m = parseCap(xml);
  assert.equal(m.english, true);
  assert.deepEqual(m.areaDescs, ['Pune', 'Kamrup']);
  assert.equal(m.headline, 'Heavy rain');
  const a = normalizeAlert(m, index);
  assert.equal(a.areaDesc, 'Pune; Kamrup');
  assert.deepEqual(a.states, ['Assam', 'Maharashtra']);
  assert.equal(a.sender, 'IMD');
});

test('first <info> is used when no language is declared', () => {
  const m = parseCap(cap({ infos: `<cap:info><cap:event>Flood</cap:event><cap:severity>Extreme</cap:severity>
    <cap:area><cap:areaDesc>Kamrup, Assam</cap:areaDesc></cap:area></cap:info>` }));
  assert.equal(m.english, true);
  assert.equal(m.severity, 'Extreme');
  assert.equal(m.waterRelated, true);
});

test('alert without English block is kept with "Details in original alert" and no foreign text', () => {
  const m = parseCap(cap({ infos: `<cap:info><cap:language>hi-IN</cap:language><cap:category>Met</cap:category><cap:event>Flood</cap:event>
    <cap:severity>Severe</cap:severity><cap:senderName>मौसम विभाग</cap:senderName><cap:headline>बाढ़ की चेतावनी</cap:headline>
    <cap:area><cap:areaDesc>पुणे</cap:areaDesc><cap:geocode><cap:valueName>SDMA</cap:valueName><cap:value>MH-27</cap:value></cap:geocode></cap:area></cap:info>` }),
    { link: 'https://sachet.ndma.gov.in/x' });
  assert.equal(m.english, false);
  assert.equal(m.waterRelated, true);              // via standardized <event>
  const a = normalizeAlert(m, index);
  assert.equal(a.headline, DETAILS_IN_ORIGINAL);
  assert.equal(a.detailsInOriginal, true);
  assert.equal(a.areaDesc, '');
  assert.equal(a.sender, null);
  // MH-27 places the alert via language-neutral state geocode; unmapped geocode stays unresolved
  assert.equal(a.placement, 'geocode');
  assert.deepEqual(a.states, ['Maharashtra']);
  assert.equal(a.unresolved, false);
  assert.deepEqual(a.areaCodes, [{ name: 'SDMA', value: 'MH-27' }]);
  assert.equal(a.severity, 'Severe');
  assert.ok(!/[ऀ-ॿ]/.test(JSON.stringify(a)), 'no Devanagari in output');

  const unmapped = parseCap(cap({ infos: `<cap:info><cap:language>hi-IN</cap:language><cap:category>Met</cap:category><cap:event>Flood</cap:event>
    <cap:severity>Severe</cap:severity><cap:senderName>मौसम विभाग</cap:senderName><cap:headline>बाढ़ की चेतावनी</cap:headline>
    <cap:area><cap:areaDesc>पुणे</cap:areaDesc><cap:geocode><cap:valueName>SDMA</cap:valueName><cap:value>XX-99</cap:value></cap:geocode></cap:area></cap:info>` }));
  const ua = normalizeAlert(unmapped, index);
  assert.equal(ua.placement, 'none');
  assert.equal(ua.unresolved, true);
});

test('parseReferences handles sender,identifier,sent triples', () => {
  assert.deepEqual(parseReferences('a@x.in,ID1,2026-01-01T00:00:00+05:30 b@x.in,ID2,2026-01-02T00:00:00+05:30').map((r) => r.identifier), ['ID1', 'ID2']);
});

test('Cancel removes the referenced alert and is not shown itself', () => {
  const a = parseCap(cap({ id: 'A1' }));
  const c = parseCap(cap({ id: 'C1', msgType: 'Cancel', refs: 'controlroom@ndma.gov.in,A1,2026-11-12T08:00:00+00:00' }));
  assert.deepEqual(selectActive([a, c], NOW).map((m) => m.id), []);
  assert.deepEqual(selectActive([a], NOW).map((m) => m.id), ['A1']);
});

test('Update replaces the referenced alert', () => {
  const a = parseCap(cap({ id: 'A1' }));
  const u = parseCap(cap({ id: 'U1', msgType: 'Update', refs: 'controlroom@ndma.gov.in,A1,2026-11-12T08:00:00+00:00' }));
  assert.deepEqual(selectActive([a, u], NOW).map((m) => m.id), ['U1']);
});

test('expired alerts are dropped; missing <expires> means sent + 24h', () => {
  const expired = parseCap(cap({ id: 'E', expires: '2026-11-12T09:00:00+00:00' }));
  const noExp = parseCap(cap({ id: 'N', expires: '', sent: '2026-11-11T11:00:00+00:00' }));   // expires 2026-11-12T11:00Z
  const noExpOld = parseCap(cap({ id: 'O', expires: '', sent: '2026-11-11T09:00:00+00:00' })); // expired 2026-11-12T09:00Z
  assert.deepEqual(selectActive([expired, noExp, noExpOld], NOW).map((m) => m.id), ['N']);
});

test('water hazards are flagged waterRelated (event, category or headline, case-insensitive)', () => {
  const mk = (event, headline = '', category = 'Met') => parseCap(cap({ infos: `<cap:info><cap:language>en</cap:language><cap:category>${category}</cap:category>
    <cap:event>${event}</cap:event><cap:severity>Moderate</cap:severity><cap:headline>${headline}</cap:headline>
    <cap:area><cap:areaDesc>Pune</cap:areaDesc></cap:area></cap:info>` }));
  for (const e of ['FLASH FLOOD', 'Very Heavy Rain', 'Cloudburst', 'Landslide', 'Cyclone', 'Dam release']) {
    const parsed = mk(e);
    assert.equal(parsed.waterRelated, true, e);
    assert.equal(parsed.hazard, 'water', e);
  }
  for (const e of ['Storm Surge', 'High Waves', 'Tsunami']) {
    const parsed = mk(e);
    assert.equal(parsed.waterRelated, true, e);
    assert.equal(parsed.hazard, 'coastal', e);
  }
  assert.equal(mk('Unknown', 'Flood warning for river').waterRelated, true, 'via headline');
  assert.equal(mk('Unknown', '', 'Flood').waterRelated, true, 'via category');
  for (const e of ['Heat Wave', 'Lightning', 'Forest Fire', 'Dust Storm', 'Damage assessment']) {
    assert.equal(mk(e).waterRelated, false, e);
  }
});

test('sent date: missing/invalid falls back to RSS pubDate, then null', () => {
  assert.equal(parseCap(cap({ sent: null }), { pubDate: 'Wed, 11 Nov 2026 10:00:00 +0530' }).sent, '2026-11-11T04:30:00.000Z');
  assert.equal(parseCap(cap({ sent: 'garbage' }), { pubDate: 'Wed, 11 Nov 2026 10:00:00 +0530' }).sent, '2026-11-11T04:30:00.000Z');
  assert.equal(parseCap(cap({ sent: 'garbage' }), { pubDate: 'also bad' }).sent, null);
  assert.equal(parseCap(cap({ sent: null })).sent, null);
});

test('sender comes from <senderName>', () => {
  assert.equal(normalizeAlert(parseCap(cap()), index).sender, 'IMD Pune');
});

test('Test/Exercise status alerts are not shown', () => {
  const m = parseCap(cap().replace('<cap:status>Actual</cap:status>', '<cap:status>Test</cap:status>'));
  assert.deepEqual(selectActive([m], NOW), []);
});

test('hazards are grouped: coastal first, then water, storm, heat, cold, other', () => {
  const cases = {
    'High Waves': 'coastal', 'Rough Sea': 'coastal', 'Swell Surge': 'coastal', 'High Tide': 'coastal',
    'Storm Surge': 'coastal', 'Tsunami': 'coastal', 'Kallakkadal': 'coastal', 'Fishermen warning': 'coastal',
    'Coastal flooding': 'coastal', 'Cyclone': 'water',
    'Heavy Rain': 'water', 'Flash Flood': 'water', 'Heavy rain with thunderstorm': 'water',
    'Thunderstorm': 'storm', 'Lightning': 'storm', 'Dust Storm': 'storm', 'Strong Winds': 'storm', 'Hailstorm': 'storm',
    'Heat Wave': 'heat', 'Hot weather': 'heat', 'Warm night': 'heat',
    'Cold Wave': 'cold', 'Dense Fog': 'cold', 'Snowfall': 'cold', 'Avalanche': 'cold',
    'Forest Fire': 'other', 'Earthquake': 'other', 'Hotel fire': 'other',
  };
  for (const [event, group] of Object.entries(cases)) assert.equal(classifyHazard([event]), group, event);
  assert.equal(classifyHazard(['Unknown', '', 'Heat wave warning for Vidarbha']), 'heat', 'via headline');
  assert.equal(classifyHazard([]), 'other');
});

test('every hazard type is kept by default; waterOnly keeps just water', () => {
  const mk = (id, event) => parseCap(cap({ id, infos: `<cap:info><cap:language>en</cap:language><cap:category>Met</cap:category>
    <cap:event>${event}</cap:event><cap:severity>Moderate</cap:severity><cap:headline></cap:headline>
    <cap:area><cap:areaDesc>Pune</cap:areaDesc></cap:area></cap:info>` }));
  const msgs = [mk('W', 'Heavy Rain'), mk('H', 'Heat Wave'), mk('L', 'Lightning')];
  assert.deepEqual(selectActive(msgs, NOW).map((m) => m.id), ['W', 'H', 'L']);
  assert.deepEqual(selectActive(msgs, NOW, { waterOnly: true }).map((m) => m.id), ['W']);
  assert.deepEqual(msgs.map((m) => normalizeAlert(m, index).hazard), ['water', 'heat', 'storm']);
});
