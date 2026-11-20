/**
 * Estimated Earthquake Affected Area Calculator
 *
 * Source: Szeliga, W., Hough, S., Martin, S., & Bilham, R. (2010),
 * "Intensity, Magnitude, Location, and Attenuation in India for Felt Earthquakes since 1762",
 * Bulletin of the Seismological Society of America (BSSA), Vol. 100, No. 2, pp. 570-584,
 * doi:10.1785/0120080329.
 *
 * Relationship (India-wide empirical intensity prediction equation):
 *   I = a + b * M + c * R + d * log10(R)
 * where:
 *   I = Intensity (MMI/EMS-98 approx.)
 *   M = Magnitude
 *   R = sqrt(D_epi^2 + h^2) hypocentral distance in km
 *       (D_epi = epicentral surface radius in km, h = focal depth in km)
 */

// Coefficients pending verification against Szeliga et al. (2010)
export const SZELIGA_2010_INDIA_COEFFICIENTS = {
  a: 5.57,
  b: 1.06,
  c: -0.0010,
  d: -3.37,
} as const;

export const MIN_ESTIMATE_MAGNITUDE = 4.0;
export const MAX_ESTIMATE_MAGNITUDE = 7.6;
export const MAX_CALIBRATED_DISTANCE_KM = 800;

export const INTENSITY_SCALE_LABEL = 'Intensity (MMI/EMS-98 approx.)';
export const IMPACT_METHOD_LABEL = 'Method: Szeliga et al. (2010), India-wide relationship';
export const MAGNITUDE_CAVEAT = 'Magnitude as reported by NCS (may not be moment magnitude)';
export const OUTSIDE_INDIA_NOTE = 'Estimate uses an India-calibrated formula and may be less accurate outside India.';
export const IMPACT_DISCLAIMER = 'Estimated area based on magnitude and depth. Not an official damage assessment.';
export const TOO_SMALL_MESSAGE = 'Too small to estimate an affected area.';

export type ImpactIntensityLevel = 'V' | 'IV' | 'III';

export interface ImpactRingSpec {
  level: ImpactIntensityLevel;
  intensity: 5 | 4 | 3;
  label: string;
  color: string;
}

export const IMPACT_RING_SPECS: readonly ImpactRingSpec[] = [
  { level: 'V', intensity: 5, label: 'Widely felt (V)', color: '#be185d' },
  { level: 'IV', intensity: 4, label: 'Felt (IV)', color: '#1d4ed8' },
  { level: 'III', intensity: 3, label: 'Weakly felt (III)', color: '#0f766e' },
] as const;

export interface ImpactRingEstimate extends ImpactRingSpec {
  radiusKm: number;
}

export type RingOutcome =
  | { spec: ImpactRingSpec; status: 'within_range'; radiusKm: number }
  | { spec: ImpactRingSpec; status: 'below_threshold'; radiusKm: 0 }
  | { spec: ImpactRingSpec; status: 'beyond_range'; omittedMessage: string };

export interface FeltRadiiResult {
  widelyFeltKm: number | null;
  feltKm: number | null;
  weaklyFeltKm: number | null;
}

export interface EarthquakeImpactEstimate {
  status: 'too_small' | 'out_of_range' | 'evaluated';
  message: string | null;
  rings: ImpactRingEstimate[];
  ringOutcomes: RingOutcome[];
  omittedNotices: string[];
  maxRenderedRadiusKm: number;
  scaleLabel: string;
  methodLabel: string;
  magnitudeCaveat: string;
  outsideIndiaNote: string | null;
  disclaimer: string;
}

const MIN_HYPO_KM = 0.01;
const BISECTION_STEPS = 64;

/**
 * Evaluate predicted intensity at a given magnitude and hypocentral distance R (km).
 */
export function evaluateSzeligaIntensity(magnitude: number, hypocentralKm: number): number {
  const { a, b, c, d } = SZELIGA_2010_INDIA_COEFFICIENTS;
  const safeR = Math.max(hypocentralKm, MIN_HYPO_KM);
  return a + b * magnitude + c * safeR + d * Math.log10(safeR);
}

type SolvedRingRadius =
  | { kind: 'within_range'; radiusKm: number }
  | { kind: 'below_threshold'; radiusKm: 0 }
  | { kind: 'beyond_range' };

function solveEpicentralRadiusKm(
  magnitude: number,
  depthKm: number,
  targetIntensity: number,
): SolvedRingRadius {
  const safeDepth = Math.max(0, depthKm);
  const rMin = Math.max(safeDepth, MIN_HYPO_KM);

  if (rMin > MAX_CALIBRATED_DISTANCE_KM) {
    return { kind: 'beyond_range' };
  }

  // Since c < 0 and d < 0, I(R) decreases strictly monotonically with R > 0.
  const intensityAtEpicenter = evaluateSzeligaIntensity(magnitude, rMin);
  if (intensityAtEpicenter <= targetIntensity) {
    return { kind: 'below_threshold', radiusKm: 0 };
  }

  const intensityAtMaxDist = evaluateSzeligaIntensity(magnitude, MAX_CALIBRATED_DISTANCE_KM);
  if (intensityAtMaxDist > targetIntensity) {
    return { kind: 'beyond_range' };
  }

  let lo = rMin;
  let hi = MAX_CALIBRATED_DISTANCE_KM;
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    if (evaluateSzeligaIntensity(magnitude, mid) > targetIntensity) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const solvedHypoKm = (lo + hi) / 2;
  const epicentralKm = Math.sqrt(Math.max(0, solvedHypoKm * solvedHypoKm - safeDepth * safeDepth));
  return {
    kind: 'within_range',
    radiusKm: Math.round(epicentralKm * 10) / 10,
  };
}

/**
 * Calculate the three surface felt radii (km) from magnitude and focal depth (km).
 * Returns null for a tier when outside calibrated bounds (M4.0-M7.6 or > 800 km),
 * or 0 when the event is too deep for that intensity level to reach the surface.
 */
export function estimateFeltRadiiKm(magnitude: number, depthKm: number): FeltRadiiResult {
  if (
    !Number.isFinite(magnitude) ||
    !Number.isFinite(depthKm) ||
    depthKm < 0 ||
    magnitude < MIN_ESTIMATE_MAGNITUDE ||
    magnitude > MAX_ESTIMATE_MAGNITUDE
  ) {
    return { widelyFeltKm: null, feltKm: null, weaklyFeltKm: null };
  }

  const v = solveEpicentralRadiusKm(magnitude, depthKm, 5);
  const iv = solveEpicentralRadiusKm(magnitude, depthKm, 4);
  const iii = solveEpicentralRadiusKm(magnitude, depthKm, 3);

  return {
    widelyFeltKm: v.kind === 'beyond_range' ? null : v.radiusKm,
    feltKm: iv.kind === 'beyond_range' ? null : iv.radiusKm,
    weaklyFeltKm: iii.kind === 'beyond_range' ? null : iii.radiusKm,
  };
}

/**
 * Evaluate the full Estimated Affected Area model for an earthquake event.
 */
export function estimateEarthquakeImpact(
  magnitude: number,
  depthKm: number,
  options?: { inIndia?: boolean },
): EarthquakeImpactEstimate {
  const outsideIndiaNote = options?.inIndia === false ? OUTSIDE_INDIA_NOTE : null;

  if (!Number.isFinite(magnitude) || !Number.isFinite(depthKm) || depthKm < 0) {
    return {
      status: 'out_of_range',
      message: 'Magnitude or focal depth is unavailable or invalid; cannot estimate an affected area.',
      rings: [],
      ringOutcomes: [],
      omittedNotices: [],
      maxRenderedRadiusKm: 0,
      scaleLabel: INTENSITY_SCALE_LABEL,
      methodLabel: IMPACT_METHOD_LABEL,
      magnitudeCaveat: MAGNITUDE_CAVEAT,
      outsideIndiaNote,
      disclaimer: IMPACT_DISCLAIMER,
    };
  }

  if (magnitude < MIN_ESTIMATE_MAGNITUDE) {
    return {
      status: 'too_small',
      message: TOO_SMALL_MESSAGE,
      rings: [],
      ringOutcomes: [],
      omittedNotices: [],
      maxRenderedRadiusKm: 0,
      scaleLabel: INTENSITY_SCALE_LABEL,
      methodLabel: IMPACT_METHOD_LABEL,
      magnitudeCaveat: MAGNITUDE_CAVEAT,
      outsideIndiaNote,
      disclaimer: IMPACT_DISCLAIMER,
    };
  }

  if (magnitude > MAX_ESTIMATE_MAGNITUDE) {
    return {
      status: 'out_of_range',
      message: `Magnitude M${magnitude.toFixed(1)} exceeds the M${MIN_ESTIMATE_MAGNITUDE.toFixed(1)}–M${MAX_ESTIMATE_MAGNITUDE.toFixed(1)} calibrated range; circles are omitted.`,
      rings: [],
      ringOutcomes: [],
      omittedNotices: [],
      maxRenderedRadiusKm: 0,
      scaleLabel: INTENSITY_SCALE_LABEL,
      methodLabel: IMPACT_METHOD_LABEL,
      magnitudeCaveat: MAGNITUDE_CAVEAT,
      outsideIndiaNote,
      disclaimer: IMPACT_DISCLAIMER,
    };
  }

  const ringOutcomes: RingOutcome[] = [];
  const rings: ImpactRingEstimate[] = [];
  const omittedNotices: string[] = [];

  for (const spec of IMPACT_RING_SPECS) {
    const solved = solveEpicentralRadiusKm(magnitude, depthKm, spec.intensity);
    if (solved.kind === 'within_range') {
      ringOutcomes.push({ spec, status: 'within_range', radiusKm: solved.radiusKm });
      if (solved.radiusKm > 0) {
        rings.push({ ...spec, radiusKm: solved.radiusKm });
      }
    } else if (solved.kind === 'below_threshold') {
      ringOutcomes.push({ spec, status: 'below_threshold', radiusKm: 0 });
    } else {
      const omittedMessage = `${spec.label} ring omitted: beyond the ${MAX_CALIBRATED_DISTANCE_KM} km calibrated range`;
      ringOutcomes.push({ spec, status: 'beyond_range', omittedMessage });
      omittedNotices.push(omittedMessage);
    }
  }

  const maxRenderedRadiusKm = rings.reduce((max, r) => Math.max(max, r.radiusKm), 0);

  let message: string | null = null;
  if (rings.length === 0 && omittedNotices.length > 0) {
    message = `All felt rings exceed the ${MAX_CALIBRATED_DISTANCE_KM} km calibrated range; no circles are shown.`;
  } else if (rings.length === 0) {
    message = 'Focal depth is too deep for estimated surface shaking to reach MMI/EMS-98 III.';
  }

  return {
    status: 'evaluated',
    message,
    rings,
    ringOutcomes,
    omittedNotices,
    maxRenderedRadiusKm,
    scaleLabel: INTENSITY_SCALE_LABEL,
    methodLabel: IMPACT_METHOD_LABEL,
    magnitudeCaveat: MAGNITUDE_CAVEAT,
    outsideIndiaNote,
    disclaimer: IMPACT_DISCLAIMER,
  };
}
