import { useEffect, useState } from 'react';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import { rewindForD3 } from '../lib/geo';

export interface StateProps { st_nm: string; st_code?: string; }
export type IndiaFeature = Feature<Geometry, StateProps>;
export type IndiaFC = FeatureCollection<Geometry, StateProps>;

interface GeoState {
  data: IndiaFC | null;
  loading: boolean;
  error: string | null;
}

// Module-level cache: the GeoJSON is fetched (and rewound) once and shared by every component.
let settled: GeoState | null = null;
let inflight: Promise<GeoState> | null = null;

function loadGeo(): Promise<GeoState> {
  if (settled) return Promise.resolve(settled);
  if (!inflight) {
    const url = `${import.meta.env.BASE_URL}data/india-states.geojson`;
    inflight = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: IndiaFC): GeoState => (settled = { data: rewindForD3(json), loading: false, error: null }))
      .catch((e): GeoState => {
        inflight = null; // allow a retry on the next mount
        return { data: null, loading: false, error: String(e.message || e) };
      });
  }
  return inflight;
}

export function useIndiaGeo(): GeoState {
  const [state, setState] = useState<GeoState>(settled ?? { data: null, loading: true, error: null });

  useEffect(() => {
    let alive = true;
    if (settled) { setState(settled); return; }
    loadGeo().then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, []);

  return state;
}
