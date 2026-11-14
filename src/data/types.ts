// Structured data model for the disaster intelligence platform.
// Kept independent of UI + map geometry so a real backend / historical
// database can be connected later without touching components.

export type RegionKey =
  | 'North'
  | 'South'
  | 'East'
  | 'West'
  | 'Northeast'
  | 'Central'
  | 'Islands';

export interface StateMeta {
  /** Must match `properties.st_nm` in the boundary GeoJSON exactly. */
  name: string;
  code: string;
  type: 'State' | 'Union Territory';
  region: RegionKey;
  capital: string;
}

export type CategoryKey =
  | 'river-flood'
  | 'flash-flood'
  | 'urban-flood'
  | 'extreme-rainfall'
  | 'cloudburst'
  | 'dam-failure'
  | 'embankment-breach'
  | 'coastal-flood'
  | 'glof'
  | 'landslide';

export interface CategoryMeta {
  key: CategoryKey;
  label: string;
  short: string;
  /** Marker / legend colour. */
  color: string;
  description: string;
}

/**
 * Verification status is shown on every record.
 * - documented: widely reported / officially referenced major event.
 * - reported: appears in agency / media reports, still to be cross-checked.
 * - demo: illustrative sample record — NOT a verified historical claim.
 */
export type Verification = 'documented' | 'reported' | 'demo';

export type Severity = 'moderate' | 'major' | 'severe';

export interface DisasterEvent {
  id: string;
  state: string;
  district: string;
  name: string;
  category: CategoryKey;
  /** ISO date (YYYY-MM-DD). Use the documented onset date. */
  date: string;
  /** Optional end date for multi-day events. */
  endDate?: string;
  location: string;
  lat: number;
  lon: number;
  coordinatePrecision: 'exact' | 'approximate' | 'district-level';
  description: string;
  affected?: string;
  severity?: Severity;
  source: string;
  sourceUrl: string;
  lastVerified: string;
  verification: Verification;
}