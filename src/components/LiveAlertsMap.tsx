import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { geoArea, geoMercator, geoPath } from 'd3';
import type { GeoProjection } from 'd3';
import type { Feature, Polygon } from 'geojson';
import { useIndiaGeo } from '../hooks/useIndiaGeo';
import { ISLAND_NAMES, VIEW_W, VIEW_H } from '../lib/geo';
import { STATE_MAP } from '../data/states';
import {
  DEMO_COASTAL_ALERT, fetchSachetAlerts, compareAlerts, formatSent, formatUntil, buildByState, SEVERITY_COLOR, SEVERITY_RANK,
  HAZARD_ORDER, HAZARD_LABEL, HAZARD_SHORT,
  type AlertPlacement, type AlertSeverity, type AlertShape, type HazardGroup, type SachetAlert, type SachetData,
} from '../lib/sachet';

type Status = 'loading' | 'ok' | 'stale' | 'error';

const MAP_THEME = {
  sea: '#e9f1f7',
  land: '#d1dbe7',
  landHover: '#c2d0df',
  border: '#b4c1cd',
  alertBorder: '#6f7f90',
  darkOutline: '#1b2430',
  selected: '#0f766e',
  selectedTint: '#cce4e1',
  labelInk: '#1b2430',
  labelStroke: 'rgba(255, 255, 255, 0.92)',
  insetBg: 'rgba(255, 255, 255, 0.72)',
  insetBorder: '#9bb0c4',
  coastalSwatch: '#0e7c86',
};

/*
const DARK_MAP_THEME = {
  sea: '#0b2236',
  land: '#1c2b3a',
  landHover: '#26394d',
  border: '#3a4f63',
  alertBorder: '#6c859c',
  darkOutline: '#0b2236',
  selected: '#14b8a6',
  selectedTint: '#164e4b',
  labelInk: '#e6eff6',
  labelStroke: 'rgba(11, 34, 54, 0.9)',
  insetBg: 'rgba(15, 39, 61, 0.72)',
  insetBorder: '#3a4f63',
  coastalSwatch: '#22d3ee',
};
*/

const INSET_BOXES: Record<string, [number, number, number, number]> = {
  'Lakshadweep': [36, VIEW_H - 170, 148, 112],
  'Andaman and Nicobar Islands': [VIEW_W - 172, VIEW_H - 256, 144, 236],
};

const INSET_SHORT_LABELS: Record<string, string> = {
  'Lakshadweep': 'Lakshadweep',
  'Andaman and Nicobar Islands': 'Andaman & Nicobar Is.',
};

const STALE_AFTER_MS = 30 * 60 * 1000;
const REFRESH_MS = 5 * 60 * 1000;
const INITIAL_VISIBLE = 10;

interface Hover { name: string; px: number; py: number; line: string; isDemo?: boolean; }

interface StateVisualSummary {
  landMax: AlertSeverity | null;
  allMax: AlertSeverity | null;
  coastalAlerts: SachetAlert[];
  approxAlerts: SachetAlert[];
  totalCount: number;
}

const hhmm = (d: Date) => d.toLocaleTimeString('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const safeHref = (u: string) => (/^https?:\/\//i.test(u) ? u : null);

function maxSeverity(list: SachetAlert[]): AlertSeverity | null {
  let best: AlertSeverity | null = null;
  for (const a of list) {
    if (!best || SEVERITY_RANK[a.severity] > SEVERITY_RANK[best]) best = a.severity;
  }
  return best;
}

function polygonCentroidLatLon(coords: [number, number][]): [number, number] | null {
  if (!coords.length) return null;
  const last = coords[coords.length - 1];
  const n = coords.length >= 2 && coords[0][0] === last[0] && coords[0][1] === last[1]
    ? coords.length - 1
    : coords.length;
  if (n <= 0) return null;
  let sumLat = 0;
  let sumLon = 0;
  for (let i = 0; i < n; i += 1) {
    sumLat += coords[i][0];
    sumLon += coords[i][1];
  }
  return [sumLat / n, sumLon / n];
}

function shapeCenterLatLon(shape: AlertShape): [number, number] | null {
  return shape.kind === 'circle' ? [shape.lat, shape.lon] : polygonCentroidLatLon(shape.coords);
}

function polygonToGeoFeature(coords: [number, number][]): Feature<Polygon> {
  const ring = coords.map(([lat, lon]) => [lon, lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]]);
  }
  const feature: Feature<Polygon> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
  if (geoArea(feature) > Math.PI * 2) {
    ring.reverse();
  }
  return feature;
}

function circleRadiusPx(lat: number, lon: number, radiusKm: number, proj: GeoProjection): number {
  const center = proj([lon, lat]);
  if (!center) return 8;
  const km = Math.max(radiusKm, 5);
  const dLon = km / (111.32 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const edge = proj([lon + dLon, lat]);
  if (!edge) return 8;
  return Math.max(7, Math.hypot(edge[0] - center[0], edge[1] - center[1]));
}

function placementLabel(p: AlertPlacement, states: string[]): string | null {
  const stateText = states.length ? states.join(', ') : '';
  switch (p) {
    case 'polygon':
      return 'Placed from alert polygon';
    case 'polygon-coast':
      return stateText ? `Nearest coast: ${stateText}` : 'Nearest coast zone';
    case 'geocode':
      return stateText ? `Approximate: from state code (${stateText})` : 'Approximate: from state code';
    case 'sender':
      return stateText ? `Approximate: from issuing agency (${stateText})` : 'Approximate: from issuing agency';
    case 'none':
      return 'Location not matched';
    case 'text':
    default:
      return null;
  }
}

function compactAreas(areaDesc: string): string {
  const parts = areaDesc.split(';').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length <= 2) return parts.join(', ');
  return `${parts[0]}, ${parts[1]} +${parts.length - 2}`;
}

function alertTooltipLine(a: SachetAlert): string {
  const areas = compactAreas(a.areaDesc);
  const until = formatUntil(a.expires);
  const place = placementLabel(a.placement, a.states);
  return [areas, until, place].filter(Boolean).join(' · ') || `${HAZARD_SHORT[a.hazard]} alert`;
}

export default function LiveAlertsMap() {
  const geo = useIndiaGeo();
  const { search } = useLocation();
  const isDemoCoastal = useMemo(
    () => new URLSearchParams(search).get('demo') === 'coastal',
    [search],
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [data, setData] = useState<SachetData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [hover, setHover] = useState<Hover | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [hazard, setHazard] = useState<'all' | HazardGroup>('all');
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setRefreshing(true);
    fetchSachetAlerts(ctl.signal)
      .then((d) => { setData(d); setFailed(false); })
      .catch(() => { if (!ctl.signal.aborted) setFailed(true); })
      .finally(() => { if (!ctl.signal.aborted) { setLoaded(true); setRefreshing(false); } });
  }, []);

  useEffect(() => {
    load();
    const refresh = window.setInterval(load, REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { window.clearInterval(refresh); window.clearInterval(tick); abortRef.current?.abort(); };
  }, [load]);

  useEffect(() => {
    if (!failed) return;
    const t = window.setTimeout(load, 20_000);
    return () => window.clearTimeout(t);
  }, [failed, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedAlertId(null);
        setSelectedState(null);
        setHover(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const status: Status = useMemo(() => {
    if (!data) return loaded ? 'error' : 'loading';
    const age = data.generatedAt ? now - data.generatedAt.getTime() : Infinity;
    return failed || !data.upstreamOk || age > STALE_AFTER_MS ? 'stale' : 'ok';
  }, [data, loaded, failed, now]);

  const allAlerts = useMemo(() => {
    const base = data?.alerts ?? [];
    if (!isDemoCoastal) return base;
    return base.some((a) => a.id === DEMO_COASTAL_ALERT.id) ? base : [DEMO_COASTAL_ALERT, ...base];
  }, [data, isDemoCoastal]);

  const hazardCounts = useMemo(() => {
    const c: Record<string, number> = { all: allAlerts.length };
    HAZARD_ORDER.forEach((h) => { c[h] = 0; });
    allAlerts.forEach((a) => { c[a.hazard] += 1; });
    return c;
  }, [allAlerts]);

  const shownAlerts = useMemo(
    () => allAlerts.filter((a) => hazard === 'all' || a.hazard === hazard),
    [allAlerts, hazard],
  );

  const selectedAlert = useMemo(
    () => (selectedAlertId ? shownAlerts.find((a) => a.id === selectedAlertId) ?? null : null),
    [shownAlerts, selectedAlertId],
  );

  useEffect(() => {
    if (selectedAlertId && !selectedAlert) {
      setSelectedAlertId(null);
    }
  }, [selectedAlertId, selectedAlert]);

  const byState = useMemo(() => buildByState(shownAlerts), [shownAlerts]);

  const stateSummaries = useMemo(() => {
    const map = new Map<string, StateVisualSummary>();
    const perStateLists = new Map<string, {
      land: SachetAlert[];
      coastal: SachetAlert[];
      approx: SachetAlert[];
      all: SachetAlert[];
    }>();

    for (const a of shownAlerts) {
      for (const s of a.states) {
        let rec = perStateLists.get(s);
        if (!rec) {
          rec = { land: [], coastal: [], approx: [], all: [] };
          perStateLists.set(s, rec);
        }
        rec.all.push(a);
        if (a.hazard === 'coastal') {
          rec.coastal.push(a);
        } else if (a.placement === 'geocode' || a.placement === 'sender') {
          rec.approx.push(a);
        } else {
          rec.land.push(a);
        }
      }
    }

    for (const [name, rec] of perStateLists.entries()) {
      map.set(name, {
        landMax: maxSeverity(rec.land),
        allMax: maxSeverity(rec.all),
        coastalAlerts: rec.coastal,
        approxAlerts: rec.approx,
        totalCount: rec.all.length,
      });
    }
    return map;
  }, [shownAlerts]);

  const hazardWord = hazard === 'all' ? '' : `${HAZARD_SHORT[hazard].toLowerCase()} `;

  const features = geo.data?.features ?? [];
  const mainland = useMemo(() => features.filter((f) => !ISLAND_NAMES.includes(f.properties.st_nm)), [features]);
  const islands = useMemo(() => features.filter((f) => ISLAND_NAMES.includes(f.properties.st_nm)), [features]);

  const projection = useMemo<GeoProjection>(
    () => geoMercator().fitExtent([[32, 46], [VIEW_W - 32, VIEW_H - 140]], { type: 'FeatureCollection', features: mainland }),
    [mainland],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  const insets = useMemo(() => islands.map((f) => {
    const [bx, by, bw, bh] = INSET_BOXES[f.properties.st_nm] ?? [40, VIEW_H - 134, 152, 114];
    const proj = geoMercator().fitExtent([[bx + 10, by + 22], [bx + bw - 10, by + bh - 10]], f);
    if (f.properties.st_nm === 'Lakshadweep' && proj.scale() > 1100) {
      proj.center([72.9, 10.2]).scale(1100).translate([bx + bw / 2, by + bh / 2 + 6]);
    }
    return {
      f,
      name: f.properties.st_nm,
      box: [bx, by, bw, bh] as [number, number, number, number],
      proj,
      path: geoPath(proj),
    };
  }), [islands]);

  const stateCentroids = useMemo(() => {
    const map = new Map<string, [number, number]>();
    for (const f of mainland) {
      const c = path.centroid(f);
      if (Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        map.set(f.properties.st_nm, c);
      }
    }
    for (const ins of insets) {
      const c = ins.path.centroid(ins.f);
      if (Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        map.set(ins.name, c);
      }
    }
    return map;
  }, [mainland, insets, path]);

  const projectionForPoint = useCallback((lat: number, lon: number): GeoProjection => {
    for (const ins of insets) {
      if (ins.name === 'Lakshadweep' && lat >= 7.5 && lat <= 14.2 && lon >= 70.5 && lon <= 74.8) {
        return ins.proj;
      }
      if (ins.name === 'Andaman and Nicobar Islands' && lat >= 6 && lat <= 14.5 && lon >= 91.5 && lon <= 95) {
        return ins.proj;
      }
    }
    return projection;
  }, [insets, projection]);

  const projectionForAlert = useCallback((a: SachetAlert): GeoProjection => {
    if (a.states.length === 1) {
      const inset = insets.find((i) => i.name === a.states[0]);
      if (inset) return inset.proj;
    }
    const firstCenter = a.shapes[0] ? shapeCenterLatLon(a.shapes[0]) : null;
    if (firstCenter) return projectionForPoint(firstCenter[0], firstCenter[1]);
    return projection;
  }, [insets, projection, projectionForPoint]);

  const summaryFor = (name: string): string => {
    if (status === 'loading' && !isDemoCoastal) return 'Loading...';
    if (status === 'error' && !isDemoCoastal) return 'Alert data unavailable';
    const sv = stateSummaries.get(name);
    if (!sv) {
      return status === 'ok' ? `No active ${hazardWord}alerts` : 'No alerts in the last data received (may be outdated)';
    }
    if (!sv.landMax && sv.coastalAlerts.length > 0) {
      const first = sv.coastalAlerts[0];
      return `Coastal alert: ${first.event}${sv.coastalAlerts.length > 1 ? ` (+${sv.coastalAlerts.length - 1} more)` : ''}`;
    }
    if (!sv.landMax && sv.approxAlerts.length > 0) {
      return `Approximate: ${sv.approxAlerts[0].event}`;
    }
    const base = `${sv.totalCount} ${hazardWord}alert${sv.totalCount > 1 ? 's' : ''}, highest severity ${sv.allMax ?? 'Unknown'}`;
    const coastSuffix = sv.coastalAlerts.length > 0 ? ` (includes ${sv.coastalAlerts.length} coastal)` : '';
    const staleSuffix = status === 'stale' ? ' (data may be outdated)' : '';
    return `${base}${coastSuffix}${staleSuffix}`;
  };

  const relPos = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  const relPosFromTarget = (el: Element | null) => {
    const wrap = wrapRef.current;
    if (!wrap || !el) return null;
    const wr = wrap.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    return {
      px: er.left - wr.left + er.width / 2,
      py: er.top - wr.top + er.height / 2,
    };
  };

  const scrollAlertRowIntoView = useCallback((alertId: string) => {
    window.setTimeout(() => {
      const row = rowRefs.current.get(alertId);
      const panel = panelRef.current;
      if (!row || !panel) return;
      const isDesktop = typeof window !== 'undefined' && !window.matchMedia?.('(max-width: 1080px)').matches;
      if (isDesktop) {
        const panelRect = panel.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const top = panel.scrollTop + (rowRect.top - panelRect.top) - 18;
        panel.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      } else {
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 60);
  }, []);

  const selectState = (name: string) => {
    setSelectedAlertId(null);
    setSelectedState((cur) => (cur === name ? null : name));
    setShowAll(false);
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1080px)').matches) {
      window.setTimeout(() => panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    }
  };

  const sortedPlaced = useMemo(
    () => shownAlerts.filter((a) => a.states.length > 0).sort(compareAlerts),
    [shownAlerts],
  );
  const sortedUnresolved = useMemo(() => shownAlerts.filter((a) => a.unresolved).sort(compareAlerts), [shownAlerts]);
  const listed = useMemo(
    () => (selectedState ? sortedPlaced.filter((a) => a.states.includes(selectedState)) : sortedPlaced),
    [sortedPlaced, selectedState],
  );

  const toggleSelectAlert = (a: SachetAlert, fromList = false) => {
    setSelectedState(null);
    setSelectedAlertId((cur) => {
      const next = cur === a.id ? null : a.id;
      if (next && !fromList) {
        const idx = sortedPlaced.findIndex((item) => item.id === a.id);
        if (idx >= INITIAL_VISIBLE) setShowAll(true);
        scrollAlertRowIntoView(a.id);
      }
      return next;
    });
  };

  const visible = showAll ? listed : listed.slice(0, INITIAL_VISIBLE);
  const affected = byState.size;
  const hasData = status === 'ok' || status === 'stale';
  const hasAlertsVisible = hasData || isDemoCoastal;
  const showMapOverlays = (status !== 'loading' && status !== 'error') || isDemoCoastal;

  const updated = data?.generatedAt ? hhmm(data.generatedAt) : null;
  const staleBanner = status === 'stale'
    ? `Data may be outdated (${updated ? `last updated ${updated} IST` : 'last update time unknown'}).${data && data.missingCount > 0 ? ' Some alerts could not be loaded.' : ''}`
    : null;

  const stateStyleFor = (name: string) => {
    const sv = stateSummaries.get(name);
    const isStateSelected = selectedState === name;
    const isAlertTargetState = Boolean(selectedAlert && selectedAlert.states.includes(name));
    const hasLand = Boolean(sv?.landMax);
    const isCoastalOnly = Boolean(!hasLand && sv && sv.coastalAlerts.length > 0 && sv.approxAlerts.length === 0);
    const isCoastalOrApproxOnly = Boolean(!hasLand && sv && sv.allMax);
    const maxSev = sv?.allMax ?? 'Unknown';

    let fill = MAP_THEME.land;
    if (showMapOverlays) {
      if (hasLand && sv?.landMax) {
        fill = SEVERITY_COLOR[sv.landMax];
      } else if (isStateSelected && !sv) {
        fill = MAP_THEME.selectedTint;
      }
    }

    let stroke = MAP_THEME.border;
    let strokeWidth = 0.7;
    let strokeDasharray: string | undefined;

    if (showMapOverlays && isAlertTargetState && !hasLand) {
      stroke = selectedAlert?.hazard === 'coastal'
        ? MAP_THEME.coastalSwatch
        : (selectedAlert ? SEVERITY_COLOR[selectedAlert.severity] : MAP_THEME.selected);
      strokeWidth = 2.5;
      strokeDasharray = '5 3';
    } else if (showMapOverlays && isCoastalOrApproxOnly && sv?.allMax) {
      stroke = isCoastalOnly ? MAP_THEME.coastalSwatch : SEVERITY_COLOR[sv.allMax];
      strokeWidth = isStateSelected ? 2.6 : 2;
      strokeDasharray = '5 3';
    } else if (isStateSelected) {
      stroke = MAP_THEME.selected;
      strokeWidth = 2.2;
    } else if (showMapOverlays && hasLand && sv?.landMax) {
      stroke = sv.landMax === 'Moderate' || sv.landMax === 'Minor'
        ? 'rgba(27, 36, 48, 0.58)'
        : MAP_THEME.alertBorder;
      strokeWidth = 1;
    }

    return { fill, stroke, strokeWidth, strokeDasharray, isStateSelected, maxSev };
  };

  const stateProps = (name: string) => {
    const sv = stateSummaries.get(name);
    const isDemoOnlyState = Boolean(
      sv && sv.totalCount > 0 && !sv.landMax && sv.approxAlerts.length === 0 && sv.coastalAlerts.every((x) => x.isDemo),
    );
    return {
      tabIndex: 0,
      role: 'button' as const,
      'aria-label': `${name}. ${summaryFor(name)}`,
      'aria-pressed': selectedState === name,
      className: selectedState === name ? 'live-state selected' : 'live-state',
      onClick: () => selectState(name),
      onKeyDown: (e: ReactKeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectState(name); }
      },
      onMouseMove: (e: ReactMouseEvent) => {
        const { px, py } = relPos(e);
        setHover({ name, px, py, line: summaryFor(name), isDemo: isDemoOnlyState });
      },
      onMouseLeave: () => setHover(null),
    };
  };

  // Track shape-less coastal alert offsets per state so stacked badges remain distinct
  const unshapedBadgeOffsetMap = useMemo(() => {
    const counts = new Map<string, number>();
    const out = new Map<string, Array<{ stateName: string; x: number; y: number }>>();
    for (const a of shownAlerts) {
      if (a.hazard !== 'coastal' || a.shapes.length > 0) continue;
      const placements: Array<{ stateName: string; x: number; y: number }> = [];
      for (const st of a.states) {
        const c = stateCentroids.get(st);
        if (!c) continue;
        const idx = counts.get(st) ?? 0;
        counts.set(st, idx + 1);
        const dx = idx === 0 ? 0 : ((idx % 2 === 1 ? 1 : -1) * Math.ceil(idx / 2) * 18);
        placements.push({ stateName: st, x: c[0] + dx, y: c[1] });
      }
      out.set(a.id, placements);
    }
    return out;
  }, [shownAlerts, stateCentroids]);

  const shapeAlerts = useMemo(
    () => shownAlerts.filter((a) => a.shapes.length > 0),
    [shownAlerts],
  );

  const renderShapeAndBadgeHandlers = (a: SachetAlert) => ({
    tabIndex: 0,
    role: 'button' as const,
    'aria-label': `${a.event} (${a.severity}). ${alertTooltipLine(a)}`,
    'aria-pressed': selectedAlertId === a.id,
    onClick: (e: ReactMouseEvent) => {
      e.stopPropagation();
      toggleSelectAlert(a);
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        toggleSelectAlert(a);
      }
    },
    onMouseMove: (e: ReactMouseEvent) => {
      e.stopPropagation();
      const { px, py } = relPos(e);
      setHover({
        name: `${a.event} (${a.severity})`,
        px,
        py,
        line: alertTooltipLine(a),
        isDemo: a.isDemo,
      });
    },
    onFocus: (e: { currentTarget: Element }) => {
      const pos = relPosFromTarget(e.currentTarget);
      if (pos) {
        setHover({
          name: `${a.event} (${a.severity})`,
          px: pos.px,
          py: pos.py,
          line: alertTooltipLine(a),
          isDemo: a.isDemo,
        });
      }
    },
    onBlur: () => setHover(null),
    onMouseLeave: () => setHover(null),
  });

  const hintText = selectedAlert
    ? `Selected alert: ${selectedAlert.event}. Esc to clear.`
    : selectedState
      ? `Selected: ${selectedState}. Details in the alert panel.`
      : 'Tap, press Enter, or hover a state or zone for details';

  return (
    <section className="live-section" id="alerts">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Live Situational Awareness</span>
          <h2 className="section-title">Live Weather &amp; Hazard Alerts</h2>
          <p className="section-sub">Active alerts for rain, floods, coastal waves, storm, heat, cold and more, issued through SACHET, NDMA's Integrated Alert System</p>
        </div>

        <div className="live-toolbar">
          <span className="live-updated">{hasData && updated ? `Last updated ${updated} IST` : ''}</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link
              className="btn btn-outline btn-sm"
              to={isDemoCoastal ? '/live-alerts' : '/live-alerts?demo=coastal'}
            >
              {isDemoCoastal ? 'Exit coastal demo' : 'Preview coastal demo'}
            </Link>
            <button className="btn btn-outline btn-sm" onClick={load} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh data'}
            </button>
          </div>
        </div>

        {hasAlertsVisible && allAlerts.length > 0 && (
          <div className="hazard-chips" role="group" aria-label="Filter alerts by hazard type">
            {(['all', ...HAZARD_ORDER] as const).map((h) => (
              hazardCounts[h] > 0 || h === 'all' || h === hazard ? (
                <button
                  key={h}
                  type="button"
                  className={`hazard-chip${hazard === h ? ' active' : ''}${h !== 'all' ? ` hz-${h}` : ''}`}
                  aria-pressed={hazard === h}
                  onClick={() => { setHazard(h); setShowAll(false); }}
                >
                  {h === 'all' ? 'All alerts' : HAZARD_LABEL[h]}
                  <span className="hazard-count">{hazardCounts[h]}</span>
                </button>
              ) : null
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="live-status error" role="alert">
            <span>Alert data unavailable. This does not mean there are no alerts.</span>
            <button className="btn btn-outline btn-sm" onClick={load}>Retry</button>
          </div>
        )}
        {staleBanner && (
          <div className="live-status warn" role="status">
            <span>{staleBanner}</span>
            <button className="btn btn-outline btn-sm" onClick={load}>Retry</button>
          </div>
        )}

        <div className="live-grid">
          <div className="live-main">
            <div className="map-card" style={{ background: MAP_THEME.sea }}>
              {geo.loading && <div className="map-loading"><div className="spinner" /><div>Loading map…</div></div>}
              {geo.error && <div className="map-loading"><div style={{ color: 'var(--red)' }}>Failed to load map geometry: {geo.error}</div></div>}
              {geo.data && (
                <>
                  <div className="map-svg-wrap live-map-wrap" ref={wrapRef} style={{ background: MAP_THEME.sea }}>
                    <svg
                      className="map-svg"
                      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                      preserveAspectRatio="xMidYMid meet"
                      role="group"
                      aria-label="Live weather and hazard alerts map of India. Each state and alert zone is a button."
                      style={{ background: MAP_THEME.sea }}
                    >
                      {/* Clean uniform sea backdrop */}
                      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={MAP_THEME.sea} />

                      {/* Mainland states */}
                      <g>
                        {mainland.map((f) => {
                          const name = f.properties.st_nm;
                          const st = stateStyleFor(name);
                          return (
                            <path
                              key={name}
                              d={path(f) ?? ''}
                              fill={st.fill}
                              stroke={st.stroke}
                              strokeWidth={st.strokeWidth}
                              strokeDasharray={st.strokeDasharray}
                              vectorEffect="non-scaling-stroke"
                              {...stateProps(name)}
                            />
                          );
                        })}
                      </g>

                      {/* Island insets */}
                      {insets.map((ins) => {
                        const st = stateStyleFor(ins.name);
                        const [bx, by, bw, bh] = ins.box;
                        return (
                          <g key={ins.name}>
                            <rect
                              x={bx}
                              y={by}
                              width={bw}
                              height={bh}
                              rx={8}
                              fill={MAP_THEME.insetBg}
                              stroke={MAP_THEME.insetBorder}
                              strokeWidth={0.9}
                              strokeDasharray="3 2"
                            />
                            <text
                              x={bx + bw / 2}
                              y={by + 14}
                              className="lm-inset-label"
                              textAnchor="middle"
                            >
                              {INSET_SHORT_LABELS[ins.name] ?? ins.name}
                            </text>
                            <path
                              d={ins.path(ins.f) ?? ''}
                              fill={st.fill}
                              stroke={st.stroke}
                              strokeWidth={st.strokeWidth}
                              strokeDasharray={st.strokeDasharray}
                              vectorEffect="non-scaling-stroke"
                              {...stateProps(ins.name)}
                            />
                          </g>
                        );
                      })}

                      {/* Subtle 2-letter state code labels ONLY for states with an active alert */}
                      <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
                        {Array.from(stateSummaries.keys()).map((name) => {
                          const code = STATE_MAP[name]?.code;
                          const pos = stateCentroids.get(name);
                          if (!code || !pos) return null;
                          return (
                            <text
                              key={`code-${name}`}
                              x={pos[0]}
                              y={pos[1]}
                              className="lm-state-label"
                              fill={MAP_THEME.labelInk}
                              stroke={MAP_THEME.labelStroke}
                            >
                              {code}
                            </text>
                          );
                        })}
                      </g>

                      {/* Alert polygons and circles drawn ABOVE states (rendered even if no state matched) */}
                      <g>
                        {shapeAlerts.map((a) => {
                          const isSelected = selectedAlertId === a.id;
                          const proj = projectionForAlert(a);
                          const shapePath = geoPath(proj);
                          const color = a.hazard === 'coastal' ? MAP_THEME.coastalSwatch : SEVERITY_COLOR[a.severity];
                          const strokeColor = isSelected
                            ? (a.hazard === 'coastal' ? '#084c53' : MAP_THEME.selected)
                            : color;
                          return (
                            <g key={`shapes-${a.id}`} className={`lm-shape${isSelected ? ' selected' : ''}`}>
                              {a.shapes.map((sh, idx) => {
                                if (sh.kind === 'polygon') {
                                  const d = shapePath(polygonToGeoFeature(sh.coords)) ?? '';
                                  if (!d) return null;
                                  return (
                                    <path
                                      key={`poly-${a.id}-${idx}`}
                                      d={d}
                                      fill={color}
                                      fillOpacity={isSelected ? 0.38 : 0.24}
                                      stroke={strokeColor}
                                      strokeWidth={isSelected ? 3 : 2}
                                      vectorEffect="non-scaling-stroke"
                                      {...renderShapeAndBadgeHandlers(a)}
                                    />
                                  );
                                }
                                const center = proj([sh.lon, sh.lat]);
                                if (!center) return null;
                                const r = circleRadiusPx(sh.lat, sh.lon, sh.radiusKm, proj);
                                return (
                                  <circle
                                    key={`circle-${a.id}-${idx}`}
                                    cx={center[0]}
                                    cy={center[1]}
                                    r={r}
                                    fill={color}
                                    fillOpacity={isSelected ? 0.38 : 0.24}
                                    stroke={strokeColor}
                                    strokeWidth={isSelected ? 3 : 2}
                                    vectorEffect="non-scaling-stroke"
                                    {...renderShapeAndBadgeHandlers(a)}
                                  />
                                );
                              })}
                            </g>
                          );
                        })}
                      </g>

                      {/* Coastal wave-icon badges */}
                      <g>
                        {shownAlerts
                          .filter((a) => a.hazard === 'coastal')
                          .map((a) => {
                            const isSelected = selectedAlertId === a.id;
                            const proj = projectionForAlert(a);

                            const points: Array<{ x: number; y: number; approx: boolean }> = [];
                            if (a.shapes.length > 0) {
                              const c = shapeCenterLatLon(a.shapes[0]);
                              const p = c ? proj([c[1], c[0]]) : null;
                              if (p) points.push({ x: p[0], y: p[1], approx: false });
                            } else {
                              const placed = unshapedBadgeOffsetMap.get(a.id) ?? [];
                              for (const pt of placed) {
                                points.push({ x: pt.x, y: pt.y, approx: true });
                              }
                            }

                            return points.map((pt, idx) => (
                              <g
                                key={`wave-${a.id}-${idx}`}
                                transform={`translate(${pt.x}, ${pt.y})`}
                                className={`lm-wave-badge${isSelected ? ' selected' : ''}`}
                                {...renderShapeAndBadgeHandlers(a)}
                              >
                                {/* Invisible >= 28 px hit target */}
                                <circle cx={0} cy={0} r={16} fill="transparent" />
                                {isSelected && (
                                  <circle
                                    cx={0}
                                    cy={0}
                                    r={16.5}
                                    fill="none"
                                    stroke={MAP_THEME.selected}
                                    strokeWidth={2.5}
                                  />
                                )}
                                <circle
                                  cx={0}
                                  cy={0}
                                  r={12.5}
                                  fill={MAP_THEME.coastalSwatch}
                                  stroke={isSelected ? '#1b2430' : '#ffffff'}
                                  strokeWidth={isSelected ? 2.2 : 1.8}
                                  strokeDasharray={pt.approx ? '3 2' : undefined}
                                />
                                <path
                                  d="M -6 -2 Q -3 -4.75 0 -2 T 6 -2 M -6 2.25 Q -3 -0.5 0 2.25 T 6 2.25"
                                  fill="none"
                                  stroke="#ffffff"
                                  strokeWidth={1.85}
                                  strokeLinecap="round"
                                />
                              </g>
                            ));
                          })}
                      </g>
                    </svg>

                    {hover && (
                      <div className="map-tooltip lm-tooltip" style={{ left: hover.px, top: hover.py }}>
                        <div className="tt-name">
                          {hover.isDemo && <span className="lm-demo-badge">DEMO</span>}
                          {hover.name}
                        </div>
                        <div className="tt-meta">{hover.line}</div>
                      </div>
                    )}
                    <div className="map-title-chip live-chip lm-chip">
                      <div className="t1">Live · {hazard === 'all' ? 'Active CAP Alerts' : `${HAZARD_SHORT[hazard]} Alerts`}</div>
                      <div className="t2">
                        {status === 'loading' ? 'Loading...' : status === 'error' ? 'Alert data unavailable' : 'Source: SACHET, NDMA'}
                      </div>
                    </div>
                    <div className="live-hint lm-hint">{hintText}</div>
                  </div>

                  {/* Corner card on desktop, compact wrapping row below map on mobile <= 560 px */}
                  <div className="live-legend lm-legend" aria-label="Alert severity and overlay legend">
                    <span className="ll-item"><span className="ll-swatch" style={{ background: SEVERITY_COLOR.Extreme }} /><span>Extreme</span></span>
                    <span className="ll-item"><span className="ll-swatch" style={{ background: SEVERITY_COLOR.Severe }} /><span>Severe</span></span>
                    <span className="ll-item"><span className="ll-swatch lm-sw-outline" style={{ background: SEVERITY_COLOR.Moderate }} /><span>Moderate</span></span>
                    <span className="ll-item"><span className="ll-swatch lm-sw-outline" style={{ background: SEVERITY_COLOR.Minor }} /><span>Minor</span></span>
                    <span className="ll-item"><span className="ll-swatch lm-sw-coastal" /><span>Coastal zone</span></span>
                    <span className="ll-item"><span className="ll-swatch lm-sw-approx" /><span>Approximate</span></span>
                    <span className="ll-item"><span className="ll-swatch lm-sw-none" style={{ background: MAP_THEME.land }} /><span>No alert shown</span></span>
                  </div>
                </>
              )}
            </div>
            <p className="live-disclaimer">
              No alert shown does not mean an area is safe. This is not an official alerting channel. For official warnings see{' '}
              <a href="https://sachet.ndma.gov.in" target="_blank" rel="noreferrer">SACHET (sachet.ndma.gov.in)</a> and{' '}
              <a href="https://mausam.imd.gov.in" target="_blank" rel="noreferrer">IMD (mausam.imd.gov.in)</a>.
            </p>
          </div>

          <aside className="live-list" ref={panelRef} aria-live="polite">
            <div className="live-list-head">
              <div>
                <div className="t1">{selectedState ? `Alerts: ${selectedState}` : hazard === 'all' ? 'Active CAP Alerts' : `Active ${HAZARD_LABEL[hazard]} Alerts`}</div>
                <div className="t2">
                  {status === 'loading' && !isDemoCoastal && 'Loading...'}
                  {status === 'error' && !isDemoCoastal && 'Alert data unavailable'}
                  {hasAlertsVisible && `${shownAlerts.length} alerts · ${affected} states/UTs · ${sortedUnresolved.length} not matched to a state${updated ? ` · ${updated} IST` : ''}`}
                </div>
              </div>
              {(selectedState || selectedAlertId) && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => { setSelectedState(null); setSelectedAlertId(null); setShowAll(false); }}
                >
                  Clear selection
                </button>
              )}
            </div>

            {status === 'loading' && !isDemoCoastal && <div className="live-status">Loading...</div>}
            {status === 'error' && !isDemoCoastal && <div className="live-status">Alert data unavailable.</div>}

            {hasAlertsVisible && visible.map((a) => (
              <AlertRow
                key={a.id}
                a={a}
                selected={selectedAlertId === a.id}
                onSelect={() => toggleSelectAlert(a, true)}
                setRowRef={(el) => {
                  if (el) rowRefs.current.set(a.id, el);
                  else rowRefs.current.delete(a.id);
                }}
              />
            ))}
            {hasAlertsVisible && listed.length === 0 && !selectedState && shownAlerts.length === 0 && (
              <div className="live-status">
                {status === 'ok' ? `No active ${hazardWord}alerts in the feed right now.` : 'No alerts in the last data received (may be outdated).'}
              </div>
            )}
            {hasAlertsVisible && selectedState && listed.length === 0 && (
              <div className="live-status">
                {status === 'ok' ? `No active ${hazardWord}alerts for ${selectedState} in the feed.` : `No alerts for ${selectedState} in the last data received (may be outdated).`}
              </div>
            )}
            {hasAlertsVisible && listed.length > INITIAL_VISIBLE && (
              <button className="btn btn-outline btn-sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all (${listed.length})`}
              </button>
            )}

            {hasAlertsVisible && sortedUnresolved.length > 0 && (
              <div className="live-unresolved">
                <div className="live-unresolved-head">Location not matched to a state ({sortedUnresolved.length})</div>
                {sortedUnresolved.map((a) => (
                  <AlertRow
                    key={`u-${a.id}`}
                    a={a}
                    unresolvedNote
                    selected={selectedAlertId === a.id}
                    onSelect={() => toggleSelectAlert(a, true)}
                    setRowRef={(el) => {
                      if (el) rowRefs.current.set(a.id, el);
                      else rowRefs.current.delete(a.id);
                    }}
                  />
                ))}
              </div>
            )}

            <div className="live-attribution">
              Source: <a href="https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml" target="_blank" rel="noreferrer">SACHET · NDMA CAP public feed</a>, relayed through this site's alerts server. All hazard types are shown; use the chips above to filter. Severity values are as issued in the feed.
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function AlertRow({
  a,
  unresolvedNote,
  selected,
  onSelect,
  setRowRef,
}: {
  a: SachetAlert;
  unresolvedNote?: boolean;
  selected: boolean;
  onSelect: () => void;
  setRowRef: (el: HTMLDivElement | null) => void;
}) {
  const [areasExpanded, setAreasExpanded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const href = safeHref(a.link);
  const areaParts = useMemo(
    () =>
      a.areaDesc
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean),
    [a.areaDesc],
  );
  const visibleAreas = areasExpanded ? areaParts : areaParts.slice(0, 6);
  const extraCount = areaParts.length - 6;

  useEffect(() => {
    if (selected && (a.description || a.instruction)) {
      setDescExpanded(true);
    }
  }, [selected, a.description, a.instruction]);

  const placeNote = placementLabel(a.placement, a.states);
  const until = formatUntil(a.expires);
  const hasLongText = a.description.length > 120 || Boolean(a.instruction);
  const isApprox = a.placement === 'geocode' || a.placement === 'sender';

  return (
    <div
      ref={setRowRef}
      className={`alert-row lm-row${selected ? ' lm-row-selected' : ''}`}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className={`sev-tag sev-${a.severity}`} style={{ background: SEVERITY_COLOR[a.severity] }}>
        {a.severity}
      </span>
      <span className="al-body">
        <span className="al-event">
          {a.event}
          <span className={`hz-tag hz-${a.hazard}`}>{HAZARD_SHORT[a.hazard]}</span>
          {a.isDemo && <span className="lm-demo-badge">DEMO</span>}
        </span>
        {a.detailsInOriginal ? (
          <span className="al-area">
            Details in original alert
            {href && (
              <>
                {' '}
                ·{' '}
                <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  Source
                </a>
              </>
            )}
          </span>
        ) : (
          areaParts.length > 0 && (
            <span className="al-chips">
              {visibleAreas.map((part, idx) => (
                <span className="al-chip" key={`${idx}-${part}`}>
                  {part}
                </span>
              ))}
              {extraCount > 0 && (
                <button
                  type="button"
                  className="al-more-btn"
                  aria-expanded={areasExpanded}
                  onClick={(e) => { e.stopPropagation(); setAreasExpanded((v) => !v); }}
                >
                  {areasExpanded ? 'Show fewer' : `+${extraCount} more`}
                </button>
              )}
            </span>
          )
        )}
        {a.description && (
          <div className="lm-desc-wrap">
            <p className={`lm-desc${descExpanded ? ' expanded' : ''}`}>{a.description}</p>
            {descExpanded && a.instruction && (
              <p className="lm-instruction"><strong>Advisory:</strong> {a.instruction}</p>
            )}
            {hasLongText && (
              <button
                type="button"
                className="lm-read-more"
                aria-expanded={descExpanded}
                onClick={(e) => { e.stopPropagation(); setDescExpanded((v) => !v); }}
              >
                {descExpanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}
        {!a.description && a.instruction && (
          <p className="lm-instruction"><strong>Advisory:</strong> {a.instruction}</p>
        )}
        {placeNote && (
          <span className={isApprox || unresolvedNote ? 'al-note lm-placement' : 'lm-placement'}>
            {unresolvedNote && a.placement === 'none'
              ? `Location not matched to a state${a.unresolvedAreas.length > 0 ? `: ${a.unresolvedAreas.join(', ')}` : ''}`
              : placeNote}
          </span>
        )}
        <span className="al-meta">
          {[a.sender, formatSent(a.sent), until].filter(Boolean).join(' · ')}
        </span>
      </span>
    </div>
  );
}
