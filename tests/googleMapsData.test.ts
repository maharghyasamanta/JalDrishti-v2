import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStateGeoSummaries,
  earthquakesToMapMarkers,
  hasValidGoogleMapsKey,
  historicalEventsToMapMarkers,
  sachetAlertsToMapOverlays,
} from '../src/lib/googleMapsData';
import type { SachetAlert } from '../src/lib/sachet';
import type { Earthquake } from '../src/lib/earthquakes';
import type { DisasterEvent } from '../src/data/types';
import type { IndiaFeature } from '../src/hooks/useIndiaGeo';

test('hasValidGoogleMapsKey checks non-empty strings', () => {
  assert.equal(hasValidGoogleMapsKey(''), false);
  assert.equal(hasValidGoogleMapsKey('   '), false);
  assert.equal(hasValidGoogleMapsKey(undefined), false);
  assert.equal(hasValidGoogleMapsKey('AIzaExample123'), true);
});

test('sachetAlertsToMapOverlays maps polygons, circles, and state fallbacks', () => {
  const alerts: SachetAlert[] = [
    {
      id: 'coastal-1',
      headline: 'High Waves',
      event: 'High Waves',
      hazard: 'coastal',
      severity: 'Moderate',
      description: 'Waves along coast',
      instruction: '',
      areaDesc: 'Visakhapatnam coast',
      states: ['Andhra Pradesh'],
      placement: 'polygon-coast',
      shapes: [
        {
          kind: 'polygon',
          coords: [
            [17.64, 83.24],
            [18.14, 83.74],
            [17.98, 83.95],
          ],
        },
      ],
      unresolved: false,
      unresolvedAreas: [],
      sender: 'SACHET',
      sent: null,
      expires: null,
      detailsInOriginal: false,
      link: '',
    },
    {
      id: 'circle-1',
      headline: 'Storm Warning',
      event: 'Thunderstorm',
      hazard: 'storm',
      severity: 'Severe',
      description: 'Storm cell',
      instruction: '',
      areaDesc: 'Patna',
      states: ['Bihar'],
      placement: 'polygon',
      shapes: [{ kind: 'circle', lat: 25.6, lon: 85.1, radiusKm: 12 }],
      unresolved: false,
      unresolvedAreas: [],
      sender: 'SACHET',
      sent: null,
      expires: null,
      detailsInOriginal: false,
      link: '',
    },
    {
      id: 'state-fallback-1',
      headline: 'Heavy Rain',
      event: 'Heavy Rain',
      hazard: 'water',
      severity: 'Moderate',
      description: 'Statewide rain',
      instruction: '',
      areaDesc: 'Kerala districts',
      states: ['Kerala'],
      placement: 'geocode',
      shapes: [],
      unresolved: false,
      unresolvedAreas: [],
      sender: 'IMD',
      sent: null,
      expires: null,
      detailsInOriginal: false,
      link: '',
    },
  ];

  const { polygons, circles, markers } = sachetAlertsToMapOverlays(alerts, {
    Kerala: { lat: 10.5, lng: 76.2 },
  });

  assert.equal(polygons.length, 1);
  assert.equal(polygons[0].color, '#0e7c86');
  assert.equal(circles.length, 1);
  assert.equal(circles[0].radiusMeters, 12000);
  assert.equal(markers.length, 3);
  // North-to-south sort order: Bihar (25.6) -> Andhra Pradesh (~17.92) -> Kerala (10.5)
  assert.deepEqual(
    markers.map((m) => m.id),
    ['circle-1', 'coastal-1', 'state-fallback-1'],
  );
  assert.equal(markers[2].isApproximate, true);
  assert.equal(markers[1].isCoastal, true);
});

test('earthquakesToMapMarkers deduplicates and filters invalid coordinates', () => {
  const quakes: Earthquake[] = [
    {
      id: 'q1',
      magnitude: 4.5,
      time: '2026-11-18T10:00:00Z',
      latitude: 12.1,
      longitude: 92.8,
      depth: 10,
      region: 'Andaman Sea',
      location: 'Andaman Sea',
      type: 'earthquake',
      source: 'NCS',
      inIndia: true,
      state: 'Andaman and Nicobar Islands',
    },
    {
      id: 'q1',
      magnitude: 4.5,
      time: '2026-11-18T10:00:00Z',
      latitude: 12.1,
      longitude: 92.8,
      depth: 10,
      region: 'Andaman Sea',
      location: 'Andaman Sea',
      type: 'earthquake',
      source: 'NCS',
      inIndia: true,
      state: 'Andaman and Nicobar Islands',
    },
    {
      id: 'q2',
      magnitude: 3.4,
      time: '2026-11-18T09:00:00Z',
      latitude: 31.1,
      longitude: 77.2,
      depth: 5,
      region: 'Himachal Pradesh',
      location: 'Shimla',
      type: 'earthquake',
      source: 'NCS',
      inIndia: true,
      state: 'Himachal Pradesh',
    },
    {
      id: 'q-bad',
      magnitude: 2.0,
      time: '2026-11-18T08:00:00Z',
      latitude: 999,
      longitude: 77.2,
      depth: 5,
      region: 'Invalid',
      location: 'Invalid',
      type: 'earthquake',
      source: 'NCS',
      inIndia: false,
      state: null,
    },
  ];

  const markers = earthquakesToMapMarkers(quakes);
  assert.equal(markers.length, 2);
  assert.deepEqual(markers.map((m) => m.id), ['q2', 'q1']);
});

test('historicalEventsToMapMarkers maps events and sorts north-to-south', () => {
  const events: DisasterEvent[] = [
    {
      id: 'ev-south',
      state: 'Kerala',
      district: 'Wayanad',
      name: 'Wayanad Landslide',
      category: 'landslide',
      date: '2024-07-30',
      location: 'Meppadi',
      lat: 11.53,
      lon: 76.13,
      coordinatePrecision: 'approximate',
      description: 'Landslide',
      source: 'SDMA',
      lastVerified: '2026-11-07',
      verification: 'documented',
    },
    {
      id: 'ev-north',
      state: 'Uttarakhand',
      district: 'Chamoli',
      name: 'Chamoli Flash Flood',
      category: 'flash-flood',
      date: '2021-02-07',
      location: 'Tapovan',
      lat: 30.49,
      lon: 79.63,
      coordinatePrecision: 'approximate',
      description: 'Flash flood',
      source: 'NDMA',
      lastVerified: '2026-11-07',
      verification: 'documented',
    },
  ];

  const markers = historicalEventsToMapMarkers(events);
  assert.equal(markers.length, 2);
  assert.deepEqual(markers.map((m) => m.id), ['ev-north', 'ev-south']);
});

test('computeStateGeoSummaries computes accurate center and bounds from GeoJSON features', () => {
  const features: IndiaFeature[] = [
    {
      type: 'Feature',
      properties: { st_nm: 'Goa' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[73.7, 14.9], [74.3, 14.9], [74.3, 15.8], [73.7, 15.8], [73.7, 14.9]]],
      },
    },
  ];

  const summaries = computeStateGeoSummaries(features);
  assert.ok(summaries.Goa);
  assert.equal(summaries.Goa.bounds.south, 14.9);
  assert.equal(summaries.Goa.bounds.north, 15.8);
  assert.ok(Math.abs(summaries.Goa.center.lat - 15.35) < 1e-6);
  assert.ok(Math.abs(summaries.Goa.center.lng - 74.0) < 1e-6);
});
