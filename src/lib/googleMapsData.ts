import type { DisasterEvent } from '../data/types';
import type { IndiaFeature } from '../hooks/useIndiaGeo';
import type { Earthquake } from './earthquakes';
import { magColor } from './earthquakes';
import { SEVERITY_COLOR, type AlertSeverity, type SachetAlert } from './sachet';
import { categoryColor } from '../data/categories';

export type GoogleMapTypeId = 'roadmap' | 'terrain' | 'hybrid';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface LatLngBoundsBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface StateGeoSummary {
  name: string;
  center: LatLngPoint;
  bounds: LatLngBoundsBox;
}

export interface AlertPolygonOverlay {
  id: string;
  alert: SachetAlert;
  paths: LatLngPoint[];
  color: string;
}

export interface AlertCircleOverlay {
  id: string;
  alert: SachetAlert;
  center: LatLngPoint;
  radiusMeters: number;
  color: string;
}

export interface AlertMarkerItem {
  id: string;
  alert: SachetAlert;
  position: LatLngPoint;
  color: string;
  isCoastal: boolean;
  isApproximate: boolean;
}

export interface QuakeMarkerItem {
  id: string;
  quake: Earthquake;
  position: LatLngPoint;
  color: string;
}

export interface HistoricalMarkerItem {
  id: string;
  event: DisasterEvent;
  position: LatLngPoint;
  color: string;
}

export const INDIA_CENTER: LatLngPoint = { lat: 22.3511148, lng: 78.6677428 };
export const INDIA_DEFAULT_ZOOM = 4.7;

export function hasValidGoogleMapsKey(key: unknown): key is string {
  return typeof key === 'string' && key.trim().length > 0;
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function polygonCenter(coords: [number, number][]): LatLngPoint | null {
  if (!coords.length) return null;
  const last = coords[coords.length - 1];
  const n = coords.length >= 2 && coords[0][0] === last[0] && coords[0][1] === last[1]
    ? coords.length - 1
    : coords.length;
  if (n <= 0) return null;
  let sumLat = 0;
  let sumLng = 0;
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    const [lat, lng] = coords[i];
    if (!isValidLatLng(lat, lng)) continue;
    sumLat += lat;
    sumLng += lng;
    count += 1;
  }
  if (count === 0) return null;
  return { lat: sumLat / count, lng: sumLng / count };
}

function alertColor(hazard: SachetAlert['hazard'], severity: AlertSeverity): string {
  return hazard === 'coastal' ? '#0e7c86' : SEVERITY_COLOR[severity] ?? '#6f7f90';
}

export function sachetAlertsToMapOverlays(
  alerts: SachetAlert[],
  stateCenters: Record<string, LatLngPoint> = {},
): {
  polygons: AlertPolygonOverlay[];
  circles: AlertCircleOverlay[];
  markers: AlertMarkerItem[];
} {
  const polygons: AlertPolygonOverlay[] = [];
  const circles: AlertCircleOverlay[] = [];
  const markers: AlertMarkerItem[] = [];

  for (const alert of alerts) {
    const color = alertColor(alert.hazard, alert.severity);
    let primaryPosition: LatLngPoint | null = null;
    let isApproximate = alert.placement === 'geocode' || alert.placement === 'sender';

    alert.shapes.forEach((shape, idx) => {
      if (shape.kind === 'polygon') {
        const paths = shape.coords
          .filter(([lat, lng]) => isValidLatLng(lat, lng))
          .map(([lat, lng]) => ({ lat, lng }));
        if (paths.length >= 3) {
          polygons.push({
            id: `${alert.id}-poly-${idx}`,
            alert,
            paths,
            color,
          });
          if (!primaryPosition) {
            primaryPosition = polygonCenter(shape.coords);
          }
        }
      } else if (shape.kind === 'circle') {
        if (isValidLatLng(shape.lat, shape.lon)) {
          const center = { lat: shape.lat, lng: shape.lon };
          circles.push({
            id: `${alert.id}-circle-${idx}`,
            alert,
            center,
            radiusMeters: Math.max(5000, shape.radiusKm * 1000),
            color,
          });
          if (!primaryPosition) {
            primaryPosition = center;
          }
        }
      }
    });

    if (!primaryPosition && alert.states.length > 0) {
      for (const st of alert.states) {
        const center = stateCenters[st];
        if (center && isValidLatLng(center.lat, center.lng)) {
          primaryPosition = center;
          isApproximate = true;
          break;
        }
      }
    }

    if (primaryPosition) {
      markers.push({
        id: alert.id,
        alert,
        position: primaryPosition,
        color,
        isCoastal: alert.hazard === 'coastal',
        isApproximate,
      });
    }
  }

  // Sort north-to-south so southern markers render cleanly in front
  markers.sort((a, b) => b.position.lat - a.position.lat);

  return { polygons, circles, markers };
}

export function earthquakesToMapMarkers(quakes: Earthquake[]): QuakeMarkerItem[] {
  const out: QuakeMarkerItem[] = [];
  const seen: Record<string, boolean> = {};

  for (const quake of quakes) {
    if (seen[quake.id]) continue;
    if (!isValidLatLng(quake.latitude, quake.longitude)) continue;
    seen[quake.id] = true;
    out.push({
      id: quake.id,
      quake,
      position: { lat: quake.latitude, lng: quake.longitude },
      color: magColor(quake.magnitude),
    });
  }

  out.sort((a, b) => b.position.lat - a.position.lat);
  return out;
}

export function historicalEventsToMapMarkers(events: DisasterEvent[]): HistoricalMarkerItem[] {
  const out: HistoricalMarkerItem[] = [];
  for (const event of events) {
    if (!isValidLatLng(event.lat, event.lon)) continue;
    out.push({
      id: event.id,
      event,
      position: { lat: event.lat, lng: event.lon },
      color: categoryColor(event.category),
    });
  }
  out.sort((a, b) => b.position.lat - a.position.lat);
  return out;
}

function scanRings(rings: number[][][], bounds: LatLngBoundsBox): void {
  for (const ring of rings) {
    for (const pt of ring) {
      const lng = pt[0];
      const lat = pt[1];
      if (!isValidLatLng(lat, lng)) continue;
      if (lat > bounds.north) bounds.north = lat;
      if (lat < bounds.south) bounds.south = lat;
      if (lng > bounds.east) bounds.east = lng;
      if (lng < bounds.west) bounds.west = lng;
    }
  }
}

export function computeStateGeoSummaries(features: IndiaFeature[]): Record<string, StateGeoSummary> {
  const out: Record<string, StateGeoSummary> = {};
  for (const feature of features) {
    const name = feature.properties?.st_nm;
    const geom = feature.geometry;
    if (!name || !geom) continue;

    const bounds: LatLngBoundsBox = {
      north: -90,
      south: 90,
      east: -180,
      west: 180,
    };

    if (geom.type === 'Polygon') {
      scanRings(geom.coordinates, bounds);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        scanRings(poly, bounds);
      }
    }

    if (bounds.north >= bounds.south && bounds.east >= bounds.west) {
      out[name] = {
        name,
        center: {
          lat: (bounds.north + bounds.south) / 2,
          lng: (bounds.east + bounds.west) / 2,
        },
        bounds,
      };
    }
  }
  return out;
}
