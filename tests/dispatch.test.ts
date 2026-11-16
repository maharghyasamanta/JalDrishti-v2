import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTBOX_MAX,
  SMS_MAX_LEN,
  appendToOutbox,
  buildAlertSms,
  buildQuakeSms,
  planDeliveries,
  toGsmSafe,
  type OutboxState,
} from '../src/lib/dispatch';
import type { Earthquake } from '../src/lib/earthquakes';
import type { SachetAlert } from '../src/lib/sachet';
import type { Subscription } from '../src/lib/subscriptions';

const SAMPLE_SUBS: Subscription[] = [
  {
    id: 'SUB-V1',
    pincode: '781001',
    phone: '9876543210',
    state: 'Assam',
    district: 'Kamrup Metropolitan',
    hazards: ['water', 'earthquake'],
    status: 'Verified',
    subscribedDate: '2026-11-10',
    verifiedDate: '2026-11-10',
  },
  {
    id: 'SUB-V2',
    pincode: '682001',
    phone: '9847012345',
    state: 'Kerala',
    district: 'Ernakulam',
    hazards: ['water'],
    status: 'Verified',
    subscribedDate: '2026-11-12',
    verifiedDate: '2026-11-12',
  },
  {
    id: 'SUB-P1',
    pincode: '400001',
    phone: '9765432109',
    state: 'Maharashtra',
    district: 'Mumbai',
    hazards: ['water', 'storm', 'earthquake'],
    status: 'Pending',
    subscribedDate: '2026-11-14',
  },
  {
    id: 'SUB-U1',
    pincode: '800001',
    phone: '9123456780',
    state: 'Bihar',
    district: 'Patna',
    hazards: ['water', 'cold', 'earthquake'],
    status: 'Unsubscribed',
    subscribedDate: '2026-11-08',
  },
];

const NOW = Date.parse('2026-11-16T12:00:00Z');

const SAMPLE_ALERTS: SachetAlert[] = [
  {
    id: 'al-1',
    headline: 'Heavy rainfall warning',
    event: 'Heavy Rain and Flash Flood Warning with Prolonged Waterlogging Risk',
    hazard: 'water',
    severity: 'Severe',
    description: '',
    instruction: '',
    areaDesc: 'Kamrup Metropolitan; Barpeta; Nalbari; Darrang; Goalpara; Dhubri; Bongaigaon',
    states: ['Assam'],
    placement: 'text',
    shapes: [],
    unresolved: false,
    unresolvedAreas: [],
    sender: 'ASDMA',
    sent: '2026-11-16T10:30:00Z',
    expires: null,
    detailsInOriginal: false,
    link: '',
  },
  {
    id: 'al-2',
    headline: 'Heatwave',
    event: 'Heat Wave',
    hazard: 'heat',
    severity: 'Moderate',
    description: '',
    instruction: '',
    areaDesc: 'Mumbai; Thane',
    states: ['Maharashtra'],
    placement: 'text',
    shapes: [],
    unresolved: false,
    unresolvedAreas: [],
    sender: 'IMD',
    sent: '2026-11-16T09:00:00Z',
    expires: null,
    detailsInOriginal: false,
    link: '',
  },
];

const SAMPLE_QUAKES: Earthquake[] = [
  {
    id: 'eq-assam',
    magnitude: 4.3,
    time: '2026-11-16T08:00:00Z',
    latitude: 26.15,
    longitude: 91.74,
    depth: 10,
    region: 'Assam',
    location: '18 km NNW of Guwahati, Kamrup Metropolitan District, Assam, India',
    type: 'earthquake',
    source: 'NCS',
    inIndia: true,
    state: 'Assam',
  },
  {
    id: 'eq-old',
    magnitude: 3.9,
    time: '2026-11-10T08:00:00Z', // 6 days ago
    latitude: 23.0,
    longitude: 70.0,
    depth: 12,
    region: 'Gujarat',
    location: 'Bhuj, Gujarat, India',
    type: 'earthquake',
    source: 'USGS',
    inIndia: true,
    state: 'Gujarat',
  },
  {
    id: 'eq-nepal',
    magnitude: 5.1,
    time: '2026-11-16T09:00:00Z',
    latitude: 27.7,
    longitude: 85.3,
    depth: 15,
    region: 'Nepal',
    location: 'Kathmandu, Nepal',
    type: 'earthquake',
    source: 'USGS',
    inIndia: false,
    state: null,
  },
];

test('consent rule: Pending and Unsubscribed NEVER receive SMS in broadcast or targeted mode', () => {
  for (const mode of ['broadcast', 'targeted'] as const) {
    const res = planDeliveries({
      subs: SAMPLE_SUBS,
      alerts: SAMPLE_ALERTS,
      quakes: SAMPLE_QUAKES,
      mode,
      lookbackHours: 720,
      sentKeys: new Set(),
      now: NOW,
    });

    const recipients = new Set(res.messages.map((m) => m.subscriptionId));
    assert.equal(recipients.has('SUB-P1'), false, `Pending subscriber leaked in ${mode}`);
    assert.equal(recipients.has('SUB-U1'), false, `Unsubscribed subscriber leaked in ${mode}`);
    assert.equal(res.skippedUnconsented, 2);
  }
});

test('broadcast vs targeted matching and non-India earthquake filtering', () => {
  const broadcast = planDeliveries({
    subs: SAMPLE_SUBS,
    alerts: SAMPLE_ALERTS,
    quakes: SAMPLE_QUAKES,
    mode: 'broadcast',
    lookbackHours: 24,
    sentKeys: new Set(),
    now: NOW,
  });

  // 2 verified subs x (2 alerts + 1 India quake in 24h) = 6 messages; Nepal excluded
  assert.equal(broadcast.indiaQuakesInWindow.length, 1);
  assert.equal(broadcast.messages.length, 6);
  assert.ok(broadcast.messages.every((m) => !m.eventKey.includes('eq-nepal')));

  const targeted = planDeliveries({
    subs: SAMPLE_SUBS,
    alerts: SAMPLE_ALERTS,
    quakes: SAMPLE_QUAKES,
    mode: 'targeted',
    lookbackHours: 24,
    sentKeys: new Set(),
    now: NOW,
  });

  // SUB-V1 matches Assam water alert (al-1) and Assam quake (eq-assam)
  // SUB-V2 (Kerala, water only) matches neither Assam alert, Maharashtra heat alert, nor quake
  assert.equal(targeted.messages.length, 2);
  assert.deepEqual(
    targeted.messages.map((m) => m.id).sort(),
    ['SUB-V1|alert:al-1', 'SUB-V1|quake:eq-assam'],
  );
});

test('dedupe skips already sent subscriptionId + eventKey combinations', () => {
  const sent = new Set(['SUB-V1|alert:al-1']);
  const res = planDeliveries({
    subs: SAMPLE_SUBS,
    alerts: SAMPLE_ALERTS,
    quakes: SAMPLE_QUAKES,
    mode: 'targeted',
    lookbackHours: 24,
    sentKeys: sent,
    now: NOW,
  });

  assert.equal(res.messages.length, 1);
  assert.equal(res.messages[0].id, 'SUB-V1|quake:eq-assam');
});

test('SMS bodies stay <= 160 chars, GSM-safe ASCII, and always contain DEMO and 112', () => {
  const longAlert: SachetAlert = {
    ...SAMPLE_ALERTS[0],
    event: 'Extremely Severe Cyclonic Storm and Coastal Storm Surge Warning — Alert',
    areaDesc: 'Srikakulam; Vizianagaram; Visakhapatnam; Anakapalli; Kakinada; Konaseema; East Godavari; West Godavari',
  };
  const alertSms = buildAlertSms(longAlert, SAMPLE_SUBS[0]);
  assert.ok(alertSms.length <= SMS_MAX_LEN, `alertSms too long: ${alertSms.length}`);
  assert.match(alertSms, /DEMO/);
  assert.match(alertSms, /112/);
  assert.match(alertSms, /^[\x20-\x7E]+$/);

  const quakeSms = buildQuakeSms(SAMPLE_QUAKES[0], SAMPLE_SUBS[0]);
  assert.ok(quakeSms.length <= SMS_MAX_LEN, `quakeSms too long: ${quakeSms.length}`);
  assert.match(quakeSms, /DEMO/);
  assert.match(quakeSms, /112/);
  assert.match(quakeSms, /^[\x20-\x7E]+$/);

  assert.equal(toGsmSafe('‘Hello’ — Mumbai… 🚨'), "'Hello' - Mumbai...");
});

test('outbox caps at 500 newest messages and tracks droppedCount', () => {
  let state: OutboxState = { messages: [], droppedCount: 0 };
  const batch = Array.from({ length: 520 }, (_, i) => ({
    id: `SUB-V1|alert:a-${i}`,
    eventKey: `alert:a-${i}`,
    kind: 'alert' as const,
    subscriptionId: 'SUB-V1',
    toMasked: '+91 ******3210',
    state: 'Assam',
    pincode: '781001',
    body: 'JalDrishti DEMO: Test. Emergency 112.',
    createdAt: new Date(NOW + i * 1000).toISOString(),
    read: false,
    eventLabel: `Alert ${i}`,
    badgeText: 'Moderate',
    locationLabel: 'Assam',
    source: 'NDMA SACHET',
  }));

  state = appendToOutbox(state, batch);
  assert.equal(state.messages.length, OUTBOX_MAX);
  assert.equal(state.droppedCount, 20);
});
