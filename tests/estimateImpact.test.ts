import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  estimateEarthquakeImpact,
  estimateFeltRadiiKm,
  evaluateSzeligaIntensity,
  IMPACT_DISCLAIMER,
  IMPACT_METHOD_LABEL,
  INTENSITY_SCALE_LABEL,
  MAGNITUDE_CAVEAT,
  OUTSIDE_INDIA_NOTE,
  TOO_SMALL_MESSAGE,
} from '../src/lib/estimateImpact.ts';
import { findOverlappingStates } from '../src/lib/quakeGeoOverlap.ts';
import type { IndiaFeature } from '../src/hooks/useIndiaGeo.ts';

test('earthquakes below M4.0 return too_small message with no circles', () => {
  const res = estimateEarthquakeImpact(3.9, 10, { inIndia: true });
  assert.equal(res.status, 'too_small');
  assert.equal(res.message, TOO_SMALL_MESSAGE);
  assert.equal(res.rings.length, 0);
  assert.equal(res.disclaimer, IMPACT_DISCLAIMER);

  const radii = estimateFeltRadiiKm(3.5, 10);
  assert.deepEqual(radii, { widelyFeltKm: null, feltKm: null, weaklyFeltKm: null });
});

test('earthquakes above M7.6 return out_of_range with no circles', () => {
  const res = estimateEarthquakeImpact(7.8, 15, { inIndia: true });
  assert.equal(res.status, 'out_of_range');
  assert.equal(res.rings.length, 0);
  assert.ok(res.message?.includes('M4.0–M7.6'));
});

test('Szeliga 2010 radii solve intensity equation accurately and scale with magnitude and depth', () => {
  const shallow = estimateEarthquakeImpact(5.5, 10, { inIndia: true });
  assert.equal(shallow.status, 'evaluated');
  assert.equal(shallow.rings.length, 3);
  assert.equal(shallow.scaleLabel, INTENSITY_SCALE_LABEL);
  assert.equal(shallow.methodLabel, IMPACT_METHOD_LABEL);
  assert.equal(shallow.magnitudeCaveat, MAGNITUDE_CAVEAT);
  assert.equal(shallow.outsideIndiaNote, null);

  const [ringV, ringIV, ringIII] = shallow.rings;
  assert.equal(ringV.label, 'Widely felt (V)');
  assert.equal(ringIV.label, 'Felt (IV)');
  assert.equal(ringIII.label, 'Weakly felt (III)');
  assert.ok(ringV.radiusKm < ringIV.radiusKm && ringIV.radiusKm < ringIII.radiusKm);

  // Verify solved epicentral radius satisfies I(M, sqrt(r^2 + h^2)) == target intensity
  for (const ring of shallow.rings) {
    const hypocentral = Math.hypot(ring.radiusKm, 10);
    const predicted = evaluateSzeligaIntensity(5.5, hypocentral);
    assert.ok(Math.abs(predicted - ring.intensity) < 0.02);
  }

  // Deeper focus reduces surface felt radii
  const deep = estimateFeltRadiiKm(5.5, 120);
  assert.ok(deep.weaklyFeltKm !== null && deep.weaklyFeltKm < ringIII.radiusKm);
});

test('partial 800 km range check keeps valid inner rings and omits only outer beyond-range ring', () => {
  const res = estimateEarthquakeImpact(7.6, 10, { inIndia: true });
  assert.equal(res.status, 'evaluated');
  assert.equal(res.rings.map((r) => r.level).join(','), 'V,IV');
  assert.deepEqual(res.omittedNotices, [
    'Weakly felt (III) ring omitted: beyond the 800 km calibrated range',
  ]);
  assert.ok(res.maxRenderedRadiusKm > 0 && res.maxRenderedRadiusKm <= 800);
});

test('outside-India earthquakes attach accuracy caveat note', () => {
  const res = estimateEarthquakeImpact(5.2, 10, { inIndia: false });
  assert.equal(res.outsideIndiaNote, OUTSIDE_INDIA_NOTE);
});

test('findOverlappingStates uses existing india-states.geojson without new sources', () => {
  const raw = JSON.parse(readFileSync(new URL('../public/data/india-states.geojson', import.meta.url), 'utf8'));
  const features = raw.features as IndiaFeature[];

  // Guwahati, Assam (26.14 N, 91.74 E) with 120 km radius overlaps Assam + neighbors like Meghalaya
  const hits = findOverlappingStates(26.14, 91.74, 120, features);
  const names = hits.map((h) => h.name);
  assert.ok(names.includes('Assam'));
  assert.ok(names.includes('Meghalaya'));
  assert.equal(hits[0].containsEpicenter, true);

  // Far in central Indian Ocean: no Indian state/UT overlap
  const offshore = findOverlappingStates(-5.0, 80.0, 100, features);
  assert.equal(offshore.length, 0);
});
