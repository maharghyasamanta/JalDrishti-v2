import type { Position } from 'geojson';
import type { IndiaFeature } from '../hooks/useIndiaGeo';

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function toUnitVec(lat: number, lon: number): Vec3 {
  const phi = lat * DEG_TO_RAD;
  const lambda = lon * DEG_TO_RAD;
  const cosPhi = Math.cos(phi);
  return {
    x: cosPhi * Math.cos(lambda),
    y: cosPhi * Math.sin(lambda),
    z: Math.sin(phi),
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm(v: Vec3): number {
  return Math.sqrt(dot(v, v));
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function pointToSegmentKm(p: Vec3, pLat: number, pLon: number, ptA: Position, ptB: Position): number {
  const aLon = ptA[0];
  const aLat = ptA[1];
  const bLon = ptB[0];
  const bLat = ptB[1];

  const a = toUnitVec(aLat, aLon);
  const b = toUnitVec(bLat, bLon);
  const n = cross(a, b);
  const nLen = norm(n);

  if (nLen < 1e-12) {
    return haversineKm(pLat, pLon, aLat, aLon);
  }

  const nHat: Vec3 = { x: n.x / nLen, y: n.y / nLen, z: n.z / nLen };
  const pDotN = dot(p, nHat);
  const proj: Vec3 = {
    x: p.x - pDotN * nHat.x,
    y: p.y - pDotN * nHat.y,
    z: p.z - pDotN * nHat.z,
  };
  const projLen = norm(proj);

  if (projLen > 1e-12) {
    const q: Vec3 = { x: proj.x / projLen, y: proj.y / projLen, z: proj.z / projLen };
    // Check if closest point Q lies along minor great-circle arc AB
    if (dot(cross(a, q), n) >= 0 && dot(cross(q, b), n) >= 0) {
      const centralAngle = Math.acos(Math.min(1, Math.max(-1, dot(p, q))));
      return centralAngle * EARTH_RADIUS_KM;
    }
  }

  return Math.min(
    haversineKm(pLat, pLon, aLat, aLon),
    haversineKm(pLat, pLon, bLat, bLon),
  );
}

function pointInRing(lat: number, lon: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lat: number, lon: number, rings: Position[][]): boolean {
  if (!rings.length || !pointInRing(lat, lon, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(lat, lon, rings[i])) return false;
  }
  return true;
}

function ringMinDistanceKm(p: Vec3, lat: number, lon: number, ring: Position[]): number {
  let minKm = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const ptA = ring[i];
    const ptB = ring[(i + 1) % ring.length];
    if (!ptA || !ptB || ptA.length < 2 || ptB.length < 2) continue;
    const dist = pointToSegmentKm(p, lat, lon, ptA, ptB);
    if (dist < minKm) minKm = dist;
  }
  return minKm;
}

function featureBboxQuickReject(
  lat: number,
  lon: number,
  radiusKm: number,
  polygons: Position[][][],
): boolean {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const poly of polygons) {
    const outer = poly[0];
    if (!outer) continue;
    for (const pt of outer) {
      if (pt[0] < minLon) minLon = pt[0];
      if (pt[0] > maxLon) maxLon = pt[0];
      if (pt[1] < minLat) minLat = pt[1];
      if (pt[1] > maxLat) maxLat = pt[1];
    }
  }

  if (!Number.isFinite(minLon)) return true;

  const clampedLat = Math.min(Math.max(lat, minLat), maxLat);
  const clampedLon = Math.min(Math.max(lon, minLon), maxLon);
  return haversineKm(lat, lon, clampedLat, clampedLon) > radiusKm + 1;
}

export interface OverlappingState {
  name: string;
  containsEpicenter: boolean;
  minDistanceKm: number;
}

/**
 * Find all Indian states / union territories from the already-loaded GeoJSON
 * whose boundaries overlap a circle of `radiusKm` centered at `(lat, lon)`.
 */
export function findOverlappingStates(
  lat: number,
  lon: number,
  radiusKm: number,
  features: IndiaFeature[],
): OverlappingState[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusKm) || radiusKm <= 0) {
    return [];
  }

  const p = toUnitVec(lat, lon);
  const matches: OverlappingState[] = [];

  for (const feature of features) {
    const name = typeof feature?.properties?.st_nm === 'string' ? feature.properties.st_nm.trim() : '';
    const geom = feature?.geometry;
    if (!name || !geom) continue;

    const polygons: Position[][][] =
      geom.type === 'Polygon'
        ? [geom.coordinates]
        : geom.type === 'MultiPolygon'
          ? geom.coordinates
          : [];

    if (polygons.length === 0 || featureBboxQuickReject(lat, lon, radiusKm, polygons)) {
      continue;
    }

    let containsEpicenter = false;
    let minDistanceKm = Infinity;

    for (const poly of polygons) {
      if (pointInPolygon(lat, lon, poly)) {
        containsEpicenter = true;
        minDistanceKm = 0;
        break;
      }
      for (const ring of poly) {
        const d = ringMinDistanceKm(p, lat, lon, ring);
        if (d < minDistanceKm) minDistanceKm = d;
      }
    }

    if (containsEpicenter || minDistanceKm <= radiusKm) {
      matches.push({
        name,
        containsEpicenter,
        minDistanceKm: Math.round(minDistanceKm * 10) / 10,
      });
    }
  }

  matches.sort((a, b) => {
    if (a.containsEpicenter !== b.containsEpicenter) {
      return a.containsEpicenter ? -1 : 1;
    }
    if (a.minDistanceKm !== b.minDistanceKm) {
      return a.minDistanceKm - b.minDistanceKm;
    }
    return a.name.localeCompare(b.name);
  });

  return matches;
}
