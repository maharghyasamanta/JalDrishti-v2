import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3';
import type { GeoProjection } from 'd3';
import { useIndiaGeo } from '../hooks/useIndiaGeo';
import { ISLAND_NAMES, VIEW_W, VIEW_H } from '../lib/geo';
import {
  fetchEarthquakes, magColor, magLabel, magCategory, formatTime, relativeTime,
  MAG_COLOR, type Earthquake, type EarthquakeData,
} from '../lib/earthquakes';

const REFRESH_MS = 5 * 60 * 1000;

// Seismic zone colors (matching India's BIS seismic zone map)
const ZONE_COLORS: Record<string, string> = {
  V:    '#8b2323',   // Very High Risk - dark maroon
  IV:   '#c47a3a',   // High Risk - brown/amber
  III:  '#e8c860',   // Moderate Risk - golden yellow
  II:   '#f0e68c',   // Low Risk - pale yellow
  none: '#e8e0d0',   // No zone data - light beige
};

// Approximate seismic zone assignments for Indian states
const STATE_ZONE: Record<string, string> = {
  'Jammu and Kashmir': 'V', 'Ladakh': 'V', 'Himachal Pradesh': 'V',
  'Uttarakhand': 'V', 'Sikkim': 'V', 'Arunachal Pradesh': 'V',
  'Nagaland': 'V', 'Manipur': 'V', 'Mizoram': 'V', 'Meghalaya': 'V',
  'Assam': 'V', 'Tripura': 'V',
  'Delhi': 'IV', 'Haryana': 'IV', 'Punjab': 'IV',
  'Uttar Pradesh': 'IV', 'Bihar': 'IV', 'West Bengal': 'IV',
  'Gujarat': 'IV',
  'Rajasthan': 'III', 'Madhya Pradesh': 'III', 'Jharkhand': 'III',
  'Chhattisgarh': 'III', 'Odisha': 'III', 'Maharashtra': 'III',
  'Goa': 'III', 'Andhra Pradesh': 'III', 'Telangana': 'III',
  'Karnataka': 'III', 'Tamil Nadu': 'III', 'Kerala': 'III',
  'Andaman and Nicobar Islands': 'V', 'Lakshadweep': 'III',
};

// Neighboring country label positions [lon, lat]
const NEIGHBOR_LABELS: { name: string; pos: [number, number]; size?: number }[] = [
  { name: 'Pakistan', pos: [68.5, 28.5] },
  { name: 'Afghanistan', pos: [66, 33.5] },
  { name: 'China', pos: [85, 35] },
  { name: 'Nepal', pos: [84, 28.5], size: 10 },
  { name: 'Bhutan', pos: [90.5, 27.8], size: 8 },
  { name: 'Bangladesh', pos: [90, 24], size: 9 },
  { name: 'Myanmar', pos: [96, 20.5] },
  { name: 'Sri Lanka', pos: [80.8, 7.5], size: 9 },
  { name: 'Tajikistan', pos: [70, 38.5], size: 8 },
];

// Ocean labels
const OCEAN_LABELS: { name: string; pos: [number, number]; angle?: number }[] = [
  { name: 'Arabian Sea', pos: [65, 15], angle: -25 },
  { name: 'Bay of Bengal', pos: [86, 13], angle: 0 },
  { name: 'Indian Ocean', pos: [77, 5], angle: 0 },
];

// Major city labels
const CITY_LABELS: { name: string; pos: [number, number] }[] = [
  { name: 'Delhi', pos: [77.1, 28.6] },
  { name: 'Mumbai', pos: [72.8, 19.0] },
  { name: 'Bengaluru', pos: [77.6, 12.9] },
  { name: 'Kolkata', pos: [88.3, 22.5] },
  { name: 'Chennai', pos: [80.2, 13.0] },
  { name: 'Jaipur', pos: [75.7, 26.9] },
  { name: 'Hyderabad', pos: [78.4, 17.3] },
  { name: 'Guwahati', pos: [91.7, 26.1] },
  { name: 'Srinagar', pos: [74.8, 34.0] },
  { name: 'Shimla', pos: [77.1, 31.1] },
];

const MAG_CATEGORIES = ['minor', 'light', 'moderate', 'strong', 'major'] as const;
const MAG_LABELS: Record<string, string> = { minor: '< 3.0', light: '3.0–3.9', moderate: '4.0–4.9', strong: '5.0–5.9', major: '6.0+' };
const MAG_NAMES: Record<string, string> = { minor: 'Minor', light: 'Light', moderate: 'Moderate', strong: 'Strong', major: 'Major' };

// Updated epicenter colors to match NCS style (yellow → orange → red)
const NCS_MAG_COLOR: Record<string, string> = {
  minor:    '#f0e040',  // yellow
  light:    '#f0c020',  // gold
  moderate: '#e89030',  // orange
  strong:   '#d05020',  // dark orange
  major:    '#c02020',  // red
};
function ncsMagColor(mag: number): string { return NCS_MAG_COLOR[magCategory(mag)] ?? '#e89030'; }

interface Hover { q: Earthquake; px: number; py: number; }

// Extended view for wider geographic context
const EQ_W = 900;
const EQ_H = 800;

export default function EarthquakeMap() {
  const geo = useIndiaGeo();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<EarthquakeData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [selected, setSelected] = useState<Earthquake | null>(null);
  const [magFilter, setMagFilter] = useState<string>('all');
  const [showAll, setShowAll] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setRefreshing(true);
    fetchEarthquakes(ctl.signal)
      .then((d) => { setData(d); setFailed(false); })
      .catch(() => { if (!ctl.signal.aborted) setFailed(true); })
      .finally(() => { if (!ctl.signal.aborted) { setLoaded(true); setRefreshing(false); } });
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { window.clearInterval(timer); abortRef.current?.abort(); };
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const list = magFilter === 'all'
      ? data.quakes
      : data.quakes.filter((q) => magCategory(q.magnitude) === magFilter);
    return list.filter((q) => {
      if (seen.has(q.id)) return false;
      seen.add(q.id);
      return true;
    });
  }, [data, magFilter]);

  const filteredStats = useMemo(() => {
    const count = filtered.length;
    if (count === 0) return { totalCount: 0, maxMagnitude: '—', avgMagnitude: '—' };
    let max = -Infinity;
    let sum = 0;
    for (const q of filtered) {
      if (q.magnitude > max) max = q.magnitude;
      sum += q.magnitude;
    }
    return {
      totalCount: count,
      maxMagnitude: max.toFixed(1),
      avgMagnitude: (sum / count).toFixed(1),
    };
  }, [filtered]);

  const features = geo.data?.features ?? [];
  const mainland = useMemo(() => features.filter((f) => !ISLAND_NAMES.includes(f.properties.st_nm)), [features]);
  const islands = useMemo(() => features.filter((f) => ISLAND_NAMES.includes(f.properties.st_nm)), [features]);

  // Wider projection showing neighboring countries
  const projection = useMemo<GeoProjection>(
    () => geoMercator()
      .center([80, 23])
      .scale(900)
      .translate([EQ_W / 2, EQ_H / 2]),
    [],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  // Project quake epicenters
  const projected = useMemo(() => filtered.map((q) => {
    const [px, py] = projection([q.longitude, q.latitude]) ?? [0, 0];
    return { ...q, px, py };
  }).filter((q) => q.px > 0 && q.py > 0 && q.px < EQ_W && q.py < EQ_H), [filtered, projection]);

  const listed = showAll ? projected : projected.slice(0, 15);
  const hasData = data && !failed;
  const updated = data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;

  const relPos = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  const radius = (mag: number) => Math.max(4, Math.pow(mag, 1.5) * 1.4);

  const zoneFor = (name: string) => ZONE_COLORS[STATE_ZONE[name] ?? 'none'];

  return (
    <section className="eq-section" id="earthquakes">
      <div className="container">
        {hasData && (
          <div className="eq-stats">
            <div className="eq-stat"><div className="v">{filteredStats.totalCount}</div><div className="l">Total Quakes</div></div>
            <div className="eq-stat"><div className="v" style={{ color: '#c02020' }}>{filteredStats.maxMagnitude}</div><div className="l">Max Magnitude</div></div>
            <div className="eq-stat"><div className="v">{filteredStats.avgMagnitude}</div><div className="l">Avg Magnitude</div></div>
            <div className="eq-stat"><div className="v">{data!.source}</div><div className="l">Data Source</div></div>
          </div>
        )}

        {hasData && (
          <div className="eq-chips" role="group" aria-label="Filter by magnitude">
            <button className={`eq-chip${magFilter === 'all' ? ' active' : ''}`} onClick={() => { setMagFilter('all'); setShowAll(false); }}>
              All <span className="hazard-count">{data!.totalCount}</span>
            </button>
            {MAG_CATEGORIES.map((cat) => {
              const count = data!.byMagnitude[cat] ?? 0;
              return count > 0 ? (
                <button key={cat} className={`eq-chip${magFilter === cat ? ' active' : ''}`}
                  style={{ '--hz': NCS_MAG_COLOR[cat] } as React.CSSProperties}
                  onClick={() => { setMagFilter(cat); setShowAll(false); }}>
                  {MAG_NAMES[cat]} ({MAG_LABELS[cat]}) <span className="hazard-count">{count}</span>
                </button>
              ) : null;
            })}
          </div>
        )}

        <div className="eq-toolbar">
          <span className="live-updated">{hasData && updated ? `Updated ${updated}` : ''}</span>
          <button className="btn btn-outline btn-sm" onClick={load} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh data'}
          </button>
        </div>

        {!loaded && !failed && <div className="eq-loading"><div className="spinner" /><div>Loading earthquake data…</div></div>}
        {loaded && failed && (
          <div className="live-status error" role="alert">
            <span>Earthquake data unavailable.</span>
            <button className="btn btn-outline btn-sm" onClick={load}>Retry</button>
          </div>
        )}

        <div className="eq-grid">
          <div className="eq-main">
            <div className="eq-map-card">
              {geo.loading && <div className="map-loading" style={{ background: '#eaf4f9' }}><div className="spinner" /><div>Loading map…</div></div>}
              {geo.error && <div className="map-loading"><div style={{ color: 'var(--red)' }}>Map load failed: {geo.error}</div></div>}
              {geo.data && (
                <div className="map-svg-wrap eq-map-wrap" ref={wrapRef}>
                  <svg className="map-svg" viewBox={`0 0 ${EQ_W} ${EQ_H}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Earthquake epicenter map of India with seismic zones">
                    <defs>
                      {/* Ocean gradient */}
                      <radialGradient id="eqOcean" cx="40%" cy="50%" r="80%">
                        <stop offset="0%" stopColor="#c8e6f5" />
                        <stop offset="100%" stopColor="#a4d4ea" />
                      </radialGradient>
                      {/* Land shadow for depth */}
                      <filter id="landShadow" x="-2%" y="-2%" width="104%" height="104%">
                        <feDropShadow dx="1" dy="1" stdDeviation="1.5" floodColor="#555" floodOpacity="0.25" />
                      </filter>
                      {/* Epicenter glow */}
                      <filter id="quakeGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>

                    {/* Ocean background */}
                    <rect x={0} y={0} width={EQ_W} height={EQ_H} fill="url(#eqOcean)" />

                    {/* Latitude/longitude grid */}
                    <g opacity="0.12" stroke="#5588aa" strokeWidth="0.3">
                      {[5, 10, 15, 20, 25, 30, 35, 40].map((lat) => {
                        const [, y] = projection([80, lat]) ?? [0, 0];
                        return <line key={`lat${lat}`} x1={0} y1={y} x2={EQ_W} y2={y} />;
                      })}
                      {[65, 70, 75, 80, 85, 90, 95, 100].map((lon) => {
                        const [x] = projection([lon, 23]) ?? [0];
                        return <line key={`lon${lon}`} x1={x} y1={0} x2={x} y2={EQ_H} />;
                      })}
                    </g>

                    {/* India states with seismic zone colors */}
                    <g filter="url(#landShadow)">
                      {mainland.map((f) => {
                        const name = f.properties.st_nm;
                        return (
                          <path
                            key={name}
                            d={path(f) ?? ''}
                            fill={zoneFor(name)}
                            stroke="#666"
                            strokeWidth={0.5}
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      })}
                      {islands.map((f) => (
                        <path
                          key={f.properties.st_nm}
                          d={path(f) ?? ''}
                          fill={zoneFor(f.properties.st_nm)}
                          stroke="#666"
                          strokeWidth={0.4}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                    </g>

                    {/* India outline border (red like NCS) */}
                    <g>
                      {mainland.map((f) => (
                        <path key={`o-${f.properties.st_nm}`} d={path(f) ?? ''} fill="none" stroke="#c03030" strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                      ))}
                    </g>

                    {/* Country labels */}
                    <g>
                      {NEIGHBOR_LABELS.map((lbl) => {
                        const [x, y] = projection(lbl.pos) ?? [0, 0];
                        if (x < 5 || x > EQ_W - 5 || y < 5 || y > EQ_H - 5) return null;
                        return (
                          <text key={lbl.name} x={x} y={y}
                            textAnchor="middle" dominantBaseline="central"
                            fill="#445566" fontSize={lbl.size ?? 11} fontWeight="700"
                            fontFamily="var(--font-head, sans-serif)"
                            style={{ pointerEvents: 'none' }}
                          >{lbl.name}</text>
                        );
                      })}
                    </g>

                    {/* Ocean labels */}
                    <g>
                      {OCEAN_LABELS.map((lbl) => {
                        const [x, y] = projection(lbl.pos) ?? [0, 0];
                        if (x < 5 || x > EQ_W - 5 || y < 5 || y > EQ_H - 5) return null;
                        return (
                          <text key={lbl.name} x={x} y={y}
                            textAnchor="middle" dominantBaseline="central"
                            fill="#4488aa" fontSize={12} fontWeight="600" fontStyle="italic"
                            fontFamily="var(--font-head, sans-serif)"
                            transform={lbl.angle ? `rotate(${lbl.angle}, ${x}, ${y})` : undefined}
                            style={{ pointerEvents: 'none' }}
                          >{lbl.name}</text>
                        );
                      })}
                    </g>

                    {/* City labels */}
                    <g>
                      {CITY_LABELS.map((city) => {
                        const [x, y] = projection(city.pos) ?? [0, 0];
                        if (x < 10 || x > EQ_W - 10 || y < 10 || y > EQ_H - 10) return null;
                        return (
                          <g key={city.name}>
                            <circle cx={x} cy={y} r={2} fill="#333" />
                            <text x={x + 4} y={y - 4} fill="#333" fontSize={8} fontWeight="600"
                              fontFamily="var(--font-body, sans-serif)"
                              style={{ pointerEvents: 'none' }}
                            >{city.name}</text>
                          </g>
                        );
                      })}
                    </g>

                    {/* "India" label */}
                    {(() => {
                      const [ix, iy] = projection([79, 21]) ?? [0, 0];
                      return <text x={ix} y={iy} textAnchor="middle" fill="#44332288" fontSize={22} fontWeight="800" fontFamily="var(--font-head, sans-serif)" letterSpacing="6" style={{ pointerEvents: 'none' }}>India</text>;
                    })()}

                    {/* Epicenter pulse rings */}
                    <g>
                      {projected.map((q) => (
                        <circle key={`p-${q.id}`} cx={q.px} cy={q.py}
                          r={radius(q.magnitude) * 2.2}
                          fill="none" stroke={ncsMagColor(q.magnitude)} strokeWidth={0.7}
                          opacity={0.3} className="eq-pulse"
                        />
                      ))}
                    </g>

                    {/* Epicenter markers */}
                    <g>
                      {projected.map((q) => (
                        <circle key={q.id} cx={q.px} cy={q.py}
                          r={radius(q.magnitude)}
                          fill={ncsMagColor(q.magnitude)}
                          stroke="#333" strokeWidth={selected?.id === q.id ? 2 : 0.5}
                          opacity={0.88}
                          filter="url(#quakeGlow)"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelected(q)}
                          onMouseMove={(e) => { const { px, py } = relPos(e); setHover({ q, px, py }); }}
                          onMouseLeave={() => setHover(null)}
                        />
                      ))}
                    </g>
                  </svg>

                  {/* Tooltip */}
                  {hover && (
                    <div className="map-tooltip" style={{ left: hover.px, top: hover.py }}>
                      <div className="tt-name">M{hover.q.magnitude.toFixed(1)} — {hover.q.region || hover.q.location}</div>
                      <div className="tt-meta">{relativeTime(hover.q.time)} · Depth: {hover.q.depth}km</div>
                    </div>
                  )}

                  {/* Title chip */}
                  <div className="eq-title-chip">
                    <div className="t1">🌍 Seismic Activity · Last 30 Days</div>
                    <div className="t2">{data ? `Source: ${data.source} · ${filtered.length} events` : 'Loading...'}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Seismic zone & magnitude legend placed below the map so Northeast India is unobstructed */}
            <div className="eq-zone-legend" aria-label="Seismic zone and magnitude legend">
              <div className="zl-group">
                <div className="zl-head">Seismic Zones</div>
                <div className="zl-items">
                  <div className="zl-item"><span className="zl-swatch" style={{ background: ZONE_COLORS.V }} />Zone V (Very High)</div>
                  <div className="zl-item"><span className="zl-swatch" style={{ background: ZONE_COLORS.IV }} />Zone IV (High)</div>
                  <div className="zl-item"><span className="zl-swatch" style={{ background: ZONE_COLORS.III }} />Zone III (Moderate)</div>
                  <div className="zl-item"><span className="zl-swatch" style={{ background: ZONE_COLORS.II }} />Zone II (Low)</div>
                </div>
              </div>
              <div className="zl-group">
                <div className="zl-head">Magnitude</div>
                <div className="zl-items">
                  {MAG_CATEGORIES.map((cat, idx) => (
                    <div className="zl-item" key={cat}>
                      <span className="zl-dot" style={{ background: NCS_MAG_COLOR[cat], width: 6 + idx * 3, height: 6 + idx * 3 }} />
                      {MAG_NAMES[cat]} ({MAG_LABELS[cat]})
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="eq-disclaimer">
              Seismic zone overlay is approximate (BIS IS 1893:2016). Earthquake data from{' '}
              <a href="https://riseq.seismo.gov.in" target="_blank" rel="noreferrer">NCS (riseq.seismo.gov.in)</a> /{' '}
              <a href="https://earthquake.usgs.gov" target="_blank" rel="noreferrer">USGS</a>.
              Not an official alerting channel.
            </p>
          </div>

          {/* Side list */}
          <aside className="eq-list" aria-live="polite">
            <div className="eq-list-head">
              <div className="t1">Recent Earthquakes</div>
              <div className="t2">{hasData && `${filtered.length} quakes · ${updated ? updated : ''}`}</div>
            </div>

            {hasData && listed.map((q) => (
              <div key={q.id}
                className={`eq-row${selected?.id === q.id ? ' eq-selected' : ''}`}
                onClick={() => setSelected(q)} style={{ cursor: 'pointer' }}>
                <span className="eq-mag" style={{ background: ncsMagColor(q.magnitude) }}>{q.magnitude.toFixed(1)}</span>
                <span className="eq-body">
                  <span className="eq-region">{q.region || q.location}</span>
                  <span className="eq-detail">Depth: {q.depth}km · {q.latitude.toFixed(2)}°N, {q.longitude.toFixed(2)}°E</span>
                  <span className="eq-time">{formatTime(q.time)} · {relativeTime(q.time)}</span>
                </span>
              </div>
            ))}

            {hasData && filtered.length === 0 && <div className="eq-empty">No earthquakes for this filter.</div>}
            {hasData && projected.length > 15 && (
              <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all (${projected.length})`}
              </button>
            )}

            <div className="eq-source">
              Source: <a href="https://riseq.seismo.gov.in" target="_blank" rel="noreferrer">National Center for Seismology</a>. Auto-refreshes every 15 min.
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
