// Point-in-polygon state/UT lookup using India states GeoJSON (lon/lat order, holes, MultiPolygon, bbox prefilter).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GEOJSON_PATH = fileURLToPath(new URL('../public/data/india-states.geojson', import.meta.url));

let cachedFeatures = null;

function computeBbox(ring) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const pt of ring) {
    const lon = pt[0];
    const lat = pt[1];
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

function inBbox(lat, lon, bbox) {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}

function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      ((yi > lat) !== (yj > lat)) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lat, lon, rings) {
  if (!rings.length || !pointInRing(lat, lon, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lat, lon, rings[i])) return false;
  }
  return true;
}

function buildIndex() {
  if (cachedFeatures) return cachedFeatures;
  const raw = JSON.parse(readFileSync(GEOJSON_PATH, 'utf8'));
  const features = Array.isArray(raw?.features) ? raw.features : [];
  const indexed = [];

  for (const feature of features) {
    const name = typeof feature?.properties?.st_nm === 'string' ? feature.properties.st_nm.trim() : '';
    const geom = feature?.geometry;
    if (!name || !geom) continue;

    const rawPolygons =
      geom.type === 'Polygon'
        ? [geom.coordinates]
        : geom.type === 'MultiPolygon'
          ? geom.coordinates
          : [];

    const polygons = [];
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    for (const rings of rawPolygons) {
      if (!Array.isArray(rings) || rings.length === 0 || !Array.isArray(rings[0])) continue;
      const bbox = computeBbox(rings[0]);
      if (bbox.minLon < minLon) minLon = bbox.minLon;
      if (bbox.maxLon > maxLon) maxLon = bbox.maxLon;
      if (bbox.minLat < minLat) minLat = bbox.minLat;
      if (bbox.maxLat > maxLat) maxLat = bbox.maxLat;
      polygons.push({ rings, bbox });
    }

    if (polygons.length > 0) {
      indexed.push({ name, bbox: { minLon, maxLon, minLat, maxLat }, polygons });
    }
  }

  cachedFeatures = indexed;
  return cachedFeatures;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function bboxLowerBoundKm(lat, lon, bbox) {
  const clampedLat = Math.min(Math.max(lat, bbox.minLat), bbox.maxLat);
  const clampedLon = Math.min(Math.max(lon, bbox.minLon), bbox.maxLon);
  return haversineKm(lat, lon, clampedLat, clampedLon);
}

/**
 * Returns the canonical Indian state/UT name containing (lat, lon), or null if outside India.
 */
export function stateAtPoint(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const index = buildIndex();
  for (const feature of index) {
    if (!inBbox(lat, lon, feature.bbox)) continue;
    for (const poly of feature.polygons) {
      if (!inBbox(lat, lon, poly.bbox)) continue;
      if (pointInPolygon(lat, lon, poly.rings)) return feature.name;
    }
  }
  return null;
}

/**
 * Existing export preserved for earthquakes and existing tests.
 */
export function pointInIndia(lat, lon) {
  return stateAtPoint(lat, lon);
}

/**
 * Returns the closest canonical Indian state/UT whose boundary vertices lie within `km`, or null.
 */
export function nearestStateWithin(lat, lon, km) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(km) || km < 0) {
    return null;
  }
  const index = buildIndex();
  let bestName = null;
  let bestDist = Infinity;

  for (const feature of index) {
    if (bboxLowerBoundKm(lat, lon, feature.bbox) > km + 5) continue;
    for (const poly of feature.polygons) {
      if (bboxLowerBoundKm(lat, lon, poly.bbox) > km + 5) continue;
      for (const ring of poly.rings) {
        for (const pt of ring) {
          const d = haversineKm(lat, lon, pt[1], pt[0]);
          if (d < bestDist) {
            bestDist = d;
            bestName = feature.name;
          }
        }
      }
    }
  }

  return bestDist <= km ? bestName : null;
}

