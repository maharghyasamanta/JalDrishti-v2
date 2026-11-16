import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { geoMercator, geoPath } from 'd3';
import type { GeoProjection } from 'd3';
import { useIndiaGeo } from '../hooks/useIndiaGeo';
import { ISLAND_NAMES, VIEW_W, VIEW_H } from '../lib/geo';
import {
  fetchSachetAlerts, compareAlerts, formatSent, buildByState, SEVERITY_COLOR,
  HAZARD_ORDER, HAZARD_LABEL, HAZARD_SHORT,
  type HazardGroup, type SachetAlert, type SachetData,
} from '../lib/sachet';

type Status = 'loading' | 'ok' | 'stale' | 'error';

const INSET_BOXES: Record<string, [number, number, number, number]> = {
  'Lakshadweep': [40, VIEW_H - 128, 150, 108],
  'Andaman and Nicobar Islands': [VIEW_W - 168, VIEW_H - 250, 140, 230],
};

const STALE_AFTER_MS = 30 * 60 * 1000;
const REFRESH_MS = 5 * 60 * 1000;
const INITIAL_VISIBLE = 10;
const NEUTRAL_FILL = '#2a1a2e';

interface Hover { name: string; px: number; py: number; line: string; }

const hhmm = (d: Date) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
const safeHref = (u: string) => (/^https?:\/\//i.test(u) ? u : null);

export default function LiveAlertsMap() {
  const geo = useIndiaGeo();
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [data, setData] = useState<SachetData | null>(null);
  const [loaded, setLoaded] = useState(false);   // first attempt finished
  const [failed, setFailed] = useState(false);   // most recent attempt failed
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [hover, setHover] = useState<Hover | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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

  const status: Status = useMemo(() => {
    if (!data) return loaded ? 'error' : 'loading';
    const age = data.generatedAt ? now - data.generatedAt.getTime() : Infinity;
    return failed || !data.upstreamOk || age > STALE_AFTER_MS ? 'stale' : 'ok';
  }, [data, loaded, failed, now]);

  // Everything below (map colours, counts, list) follows the hazard chips.
  const hazardCounts = useMemo(() => {
    const c: Record<string, number> = { all: data?.alerts.length ?? 0 };
    HAZARD_ORDER.forEach((h) => { c[h] = 0; });
    data?.alerts.forEach((a) => { c[a.hazard] += 1; });
    return c;
  }, [data]);
  const shownAlerts = useMemo(
    () => (data ? data.alerts.filter((a) => hazard === 'all' || a.hazard === hazard) : []),
    [data, hazard],
  );
  const byState = useMemo(() => buildByState(shownAlerts), [shownAlerts]);
  const hazardWord = hazard === 'all' ? '' : `${HAZARD_SHORT[hazard].toLowerCase()} `;

  const features = geo.data?.features ?? [];
  const mainland = useMemo(() => features.filter((f) => !ISLAND_NAMES.includes(f.properties.st_nm)), [features]);
  const islands = useMemo(() => features.filter((f) => ISLAND_NAMES.includes(f.properties.st_nm)), [features]);

  const projection = useMemo<GeoProjection>(
    () => geoMercator().fitExtent([[28, 24], [VIEW_W - 28, VIEW_H - 150]], { type: 'FeatureCollection', features: mainland }),
    [mainland],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  const insets = useMemo(() => islands.map((f) => {
    const [bx, by, bw, bh] = INSET_BOXES[f.properties.st_nm] ?? [40, VIEW_H - 128, 150, 108];
    const proj = geoMercator().fitExtent([[bx + 10, by + 18], [bx + bw - 10, by + bh - 10]], f);
    // Lakshadweep includes huge shallow-bank polygons; uncapped fitExtent blows them up to fill the box.
    if (f.properties.st_nm === 'Lakshadweep' && proj.scale() > 1100) {
      proj.center([72.9, 10.2]).scale(1100).translate([bx + bw / 2, by + bh / 2]);
    }
    return { f, box: [bx, by, bw, bh] as [number, number, number, number], path: geoPath(proj) };
  }), [islands]);

  /** One-line, status-aware description of a state. Only says "No active alerts" when status is ok. */
  const summaryFor = (name: string): string => {
    if (status === 'loading') return 'Loading...';
    if (status === 'error') return 'Alert data unavailable';
    const a = byState.get(name);
    if (a) return `${a.count} ${hazardWord}alert${a.count > 1 ? 's' : ''}, highest severity ${a.max}${status === 'stale' ? ' (data may be outdated)' : ''}`;
    return status === 'ok' ? `No active ${hazardWord}alerts` : 'No alerts in the last data received (may be outdated)';
  };

  const fillFor = (name: string): string => {
    if (status === 'loading' || status === 'error') return NEUTRAL_FILL;
    const a = byState.get(name);
    return a ? SEVERITY_COLOR[a.max] : NEUTRAL_FILL;
  };

  const relPos = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  const select = (name: string) => {
    setSelected((cur) => (cur === name ? null : name));
    setShowAll(false);
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1080px)').matches) {
      // Single-column layout: bring the alert panel into view after a tap.
      window.setTimeout(() => panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    }
  };

  const stateProps = (name: string) => ({
    tabIndex: 0,
    role: 'button' as const,
    'aria-label': `${name}. ${summaryFor(name)}`,
    'aria-pressed': selected === name,
    className: selected === name ? 'live-state selected' : 'live-state',
    onClick: () => select(name),
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(name); }
    },
    onMouseMove: (e: ReactMouseEvent) => { const { px, py } = relPos(e); setHover({ name, px, py, line: summaryFor(name) }); },
    onMouseLeave: () => setHover(null),
  });

  const sortedPlaced = useMemo(
    () => shownAlerts.filter((a) => a.states.length > 0).sort(compareAlerts),
    [shownAlerts],
  );
  const sortedUnresolved = useMemo(() => shownAlerts.filter((a) => a.unresolved).sort(compareAlerts), [shownAlerts]);
  const listed = useMemo(
    () => (selected ? sortedPlaced.filter((a) => a.states.includes(selected)) : sortedPlaced),
    [sortedPlaced, selected],
  );
  const visible = showAll ? listed : listed.slice(0, INITIAL_VISIBLE);
  const affected = byState.size;
  const hasData = status === 'ok' || status === 'stale';

  const updated = data?.generatedAt ? hhmm(data.generatedAt) : null;
  const staleBanner = status === 'stale'
    ? `Data may be outdated (${updated ? `last updated ${updated}` : 'last update time unknown'}).${data && data.missingCount > 0 ? ' Some alerts could not be loaded.' : ''}`
    : null;

  return (
    <section className="live-section" id="alerts">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Live Situational Awareness</span>
          <h2 className="section-title">Live Weather &amp; Hazard Alerts</h2>
          <p className="section-sub">Active alerts for rain, floods, thunderstorm and lightning, heat, cold and more, issued through SACHET, NDMA's Integrated Alert System</p>
        </div>

        <div className="live-toolbar">
          <span className="live-updated">{hasData && updated ? `Last updated ${updated}` : ''}</span>
          <button className="btn btn-outline btn-sm" onClick={load} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh data'}
          </button>
        </div>

        {hasData && data && data.alerts.length > 0 && (
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
            <div className="map-card">
              {geo.loading && <div className="map-loading"><div className="spinner" /><div>Loading map…</div></div>}
              {geo.error && <div className="map-loading"><div style={{ color: 'var(--red)' }}>Failed to load map geometry: {geo.error}</div></div>}
              {geo.data && (
                <div className="map-svg-wrap live-map-wrap" ref={wrapRef}>
                  <svg className="map-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Live weather and hazard alerts map of India. Each state is a button.">
                    <defs>
                      {/* Base dark background */}
                      <radialGradient id="bgBase" cx="50%" cy="50%" r="80%">
                        <stop offset="0%" stopColor="#1a0a14" />
                        <stop offset="60%" stopColor="#0d060f" />
                        <stop offset="100%" stopColor="#050205" />
                      </radialGradient>
                      {/* Blue glow — top left */}
                      <radialGradient id="blueGlow" cx="20%" cy="18%" r="45%">
                        <stop offset="0%" stopColor="#2a4a8a" stopOpacity="0.7" />
                        <stop offset="50%" stopColor="#1a2d6a" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#0d1535" stopOpacity="0" />
                      </radialGradient>
                      {/* Red/fire glow — bottom center */}
                      <radialGradient id="fireGlow" cx="48%" cy="85%" r="50%">
                        <stop offset="0%" stopColor="#c0280a" stopOpacity="0.65" />
                        <stop offset="40%" stopColor="#8b1a06" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#3d0a02" stopOpacity="0" />
                      </radialGradient>
                      {/* Dot halftone pattern */}
                      <pattern id="dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
                        <circle cx="7" cy="7" r="1.4" fill="rgba(200,210,255,0.28)" />
                      </pattern>
                      {/* Glow filter for alert states */}
                      <filter id="alertGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="5" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                      {/* Soft fire particle blur */}
                      <filter id="fireBlur">
                        <feGaussianBlur stdDeviation="8" />
                      </filter>
                    </defs>

                    {/* Dark base */}
                    <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#bgBase)" />
                    {/* Blue glow layer */}
                    <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#blueGlow)" />
                    {/* Red fire glow layer */}
                    <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#fireGlow)" />
                    {/* Fire particle accents */}
                    <g filter="url(#fireBlur)" opacity="0.55">
                      <ellipse cx={VIEW_W * 0.42} cy={VIEW_H * 0.88} rx="28" ry="14" fill="#e03010" />
                      <ellipse cx={VIEW_W * 0.52} cy={VIEW_H * 0.80} rx="18" ry="10" fill="#ff5520" />
                      <ellipse cx={VIEW_W * 0.33} cy={VIEW_H * 0.92} rx="12" ry="7" fill="#c02008" />
                      <ellipse cx={VIEW_W * 0.60} cy={VIEW_H * 0.86} rx="10" ry="6" fill="#dd3010" />
                    </g>
                    {/* Halftone dot grid overlay */}
                    <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#dots)" opacity="0.9" />
                    <g>
                      {mainland.map((f) => {
                        const name = f.properties.st_nm;
                        const fill = fillFor(name);
                        const hasAlert = fill !== NEUTRAL_FILL;
                        return <path key={name} d={path(f) ?? ''} fill={fill} stroke={hasAlert ? 'rgba(255,180,160,0.6)' : '#4a2a3a'} strokeWidth={hasAlert ? 1 : 0.6} vectorEffect="non-scaling-stroke" filter={hasAlert ? 'url(#alertGlow)' : undefined} {...stateProps(name)} />;
                      })}
                    </g>
                    {insets.map((ins) => {
                      const name = ins.f.properties.st_nm;
                      const fill = fillFor(name);
                      const hasAlert = fill !== NEUTRAL_FILL;
                      return (
                        <g key={name}>
                          <rect x={ins.box[0]} y={ins.box[1]} width={ins.box[2]} height={ins.box[3]} rx={8} fill="rgba(13,6,15,0.75)" stroke="#4a2a3a" strokeWidth={0.8} strokeDasharray="3 2" />
                          <path d={ins.path(ins.f) ?? ''} fill={fill} stroke={hasAlert ? 'rgba(255,180,160,0.6)' : '#4a2a3a'} strokeWidth={hasAlert ? 1 : 0.6} vectorEffect="non-scaling-stroke" filter={hasAlert ? 'url(#alertGlow)' : undefined} {...stateProps(name)} />
                        </g>
                      );
                    })}
                  </svg>
                  {hover && (
                    <div className="map-tooltip" style={{ left: hover.px, top: hover.py }}>
                      <div className="tt-name">{hover.name}</div>
                      <div className="tt-meta">{hover.line}</div>
                    </div>
                  )}
                  <div className="map-title-chip live-chip">
                    <div className="t1">Live · {hazard === 'all' ? 'Active CAP Alerts' : `${HAZARD_SHORT[hazard]} Alerts`}</div>
                    <div className="t2">
                      {status === 'loading' ? 'Loading...' : status === 'error' ? 'Alert data unavailable' : 'Source: SACHET, NDMA'}
                    </div>
                  </div>
                  <div className="live-hint">{selected ? `Selected: ${selected}. Details in the alert panel.` : 'Tap, press Enter, or hover a state for details'}</div>
                  <div className="live-legend">
                    <span className="ll-item"><span className="ll-swatch" style={{ background: SEVERITY_COLOR.Extreme }} /><span>Extreme</span></span>
                    <span className="ll-item"><span className="ll-swatch" style={{ background: SEVERITY_COLOR.Severe }} /><span>Severe</span></span>
                    <span className="ll-item"><span className="ll-swatch" style={{ background: SEVERITY_COLOR.Moderate }} /><span>Moderate</span></span>
                    <span className="ll-item"><span className="ll-swatch" style={{ background: SEVERITY_COLOR.Minor }} /><span>Minor</span></span>
                    <span className="ll-item"><span className="ll-swatch" style={{ background: NEUTRAL_FILL }} /><span>No alert shown</span></span>
                  </div>
                </div>
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
                <div className="t1">{selected ? `Alerts: ${selected}` : hazard === 'all' ? 'Active CAP Alerts' : `Active ${HAZARD_LABEL[hazard]} Alerts`}</div>
                <div className="t2">
                  {status === 'loading' && 'Loading...'}
                  {status === 'error' && 'Alert data unavailable'}
                  {hasData && data && `${shownAlerts.length} alerts · ${affected} states/UTs · ${sortedUnresolved.length} not placed on a state${updated ? ` · ${updated}` : ''}`}
                </div>
              </div>
              {selected && <button className="btn btn-outline btn-sm" onClick={() => { setSelected(null); setShowAll(false); }}>Clear selection</button>}
            </div>

            {status === 'loading' && <div className="live-status">Loading...</div>}
            {status === 'error' && <div className="live-status">Alert data unavailable.</div>}

            {hasData && visible.map((a) => <AlertRow key={a.id} a={a} />)}
            {hasData && listed.length === 0 && !selected && data && shownAlerts.length === 0 && (
              <div className="live-status">
                {status === 'ok' ? `No active ${hazardWord}alerts in the feed right now.` : 'No alerts in the last data received (may be outdated).'}
              </div>
            )}
            {hasData && selected && listed.length === 0 && (
              <div className="live-status">
                {status === 'ok' ? `No active ${hazardWord}alerts for ${selected} in the feed.` : `No alerts for ${selected} in the last data received (may be outdated).`}
              </div>
            )}
            {hasData && listed.length > INITIAL_VISIBLE && (
              <button className="btn btn-outline btn-sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all (${listed.length})`}
              </button>
            )}

            {hasData && sortedUnresolved.length > 0 && (
              <div className="live-unresolved">
                <div className="live-unresolved-head">Not placed on a state ({sortedUnresolved.length})</div>
                {sortedUnresolved.map((a) => <AlertRow key={`u-${a.id}`} a={a} unresolvedNote />)}
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

function AlertRow({ a, unresolvedNote }: { a: SachetAlert; unresolvedNote?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const href = safeHref(a.link);
  const areaParts = useMemo(
    () =>
      a.areaDesc
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean),
    [a.areaDesc],
  );
  const visibleAreas = expanded ? areaParts : areaParts.slice(0, 6);
  const extraCount = areaParts.length - 6;

  return (
    <div className="alert-row">
      <span className={`sev-tag sev-${a.severity}`} style={{ background: SEVERITY_COLOR[a.severity] }}>
        {a.severity}
      </span>
      <span className="al-body">
        <span className="al-event">
          {a.event}
          <span className={`hz-tag hz-${a.hazard}`}>{HAZARD_SHORT[a.hazard]}</span>
        </span>
        {a.detailsInOriginal ? (
          <span className="al-area">
            Details in original alert
            {href && (
              <>
                {' '}
                ·{' '}
                <a href={href} target="_blank" rel="noreferrer">
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
                  aria-expanded={expanded}
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? 'Show fewer' : `+${extraCount} more`}
                </button>
              )}
            </span>
          )
        )}
        {unresolvedNote && (
          <span className="al-note">
            Location not matched to a state{a.unresolvedAreas.length > 0 ? `: ${a.unresolvedAreas.join(', ')}` : ''}
          </span>
        )}
        <span className="al-meta">{[a.sender, formatSent(a.sent)].filter(Boolean).join(' · ')}</span>
      </span>
    </div>
  );
}
