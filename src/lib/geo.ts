import { geoArea } from 'd3';
import type { FeatureCollection, Geometry, Position } from 'geojson';

export const VIEW_W = 800;
export const VIEW_H = 880;

// Islands shown as insets so the mainland can be drawn large and legibly.
export const ISLAND_NAMES = ['Andaman and Nicobar Islands', 'Lakshadweep'];

export interface ScreenPoint { x: number; y: number; }
export interface Cluster<T> { x: number; y: number; items: T[]; }

/** Greedy screen-space clustering: items within `dist` px collapse together. */
export function clusterPoints<T extends ScreenPoint>(points: T[], dist: number): Cluster<T>[] {
  const clusters: Cluster<T>[] = [];
  for (const p of points) {
    let target: Cluster<T> | undefined;
    let best = dist;
    for (const c of clusters) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < best) { best = d; target = c; }
    }
    if (target) {
      target.items.push(p);
      target.x = target.items.reduce((s, i) => s + i.x, 0) / target.items.length;
      target.y = target.items.reduce((s, i) => s + i.y, 0) / target.items.length;
    } else {
      clusters.push({ x: p.x, y: p.y, items: [p] });
    }
  }
  return clusters;
}

const HEMISPHERE = 2 * Math.PI;

function rewindRings(rings: Position[][]): void {
  // RFC-7946 (counter-clockwise) rings read as "whole globe minus region" in d3-geo's
  // spherical convention; flip any polygon whose spherical area exceeds a hemisphere.
  if (geoArea({ type: 'Polygon', coordinates: rings }) > HEMISPHERE) {
    for (const ring of rings) ring.reverse();
  }
}

/** Normalize polygon winding so d3-geo projections fit the actual region, not its complement. */
export function rewindForD3<G extends Geometry, P>(fc: FeatureCollection<G, P>): FeatureCollection<G, P> {
  for (const f of fc.features) {
    const g = f.geometry;
    if (g.type === 'Polygon') rewindRings(g.coordinates);
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) rewindRings(poly);
  }
  return fc;
}