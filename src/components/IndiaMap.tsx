import { useEffect, useMemo, useRef, useState } from 'react';
import {
  geoMercator, geoPath, zoom as d3zoom, zoomIdentity, select,
  type GeoProjection, type ZoomBehavior, type ZoomTransform,
} from 'd3';
import type { IndiaFeature } from '../hooks/useIndiaGeo';
import type { DisasterEvent } from '../data/types';
import { categoryColor, categoryLabel } from '../data/categories';
import { ISLAND_NAMES, VIEW_W, VIEW_H, clusterPoints } from '../lib/geo';
import { formatDate } from '../lib/format';

interface Props {
  features: IndiaFeature[];
  events: DisasterEvent[];
  selectedState: string | null;
  onSelectState: (name: string | null) => void;
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
  resetSignal: number;
}

interface Hover { name: string; px: number; py: number; count: number; }
interface Popup { event: DisasterEvent; px: number; py: number; }
interface MarkerPt { x: number; y: number; event: DisasterEvent; }

const SMALL = new Set(['Delhi', 'Chandigarh', 'Puducherry', 'Goa', 'Dadra and Nagar Haveli and Daman and Diu', 'Sikkim', 'Tripura', 'Mizoram', 'Nagaland', 'Meghalaya', 'Manipur']);

export default function IndiaMap({ features, events, selectedState, onSelectState, selectedEventId, onSelectEvent, resetSignal }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<Hover | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [activeMarker, setActiveMarker] = useState<string | null>(null);

  const mainland = useMemo(() => features.filter((f) => !ISLAND_NAMES.includes(f.properties.st_nm)), [features]);
  const islands = useMemo(() => features.filter((f) => ISLAND_NAMES.includes(f.properties.st_nm)), [features]);

  const projection = useMemo<GeoProjection>(
    () => geoMercator().fitExtent([[28, 24], [VIEW_W - 28, VIEW_H - 150]], { type: 'FeatureCollection', features: mainland }),
    [mainland],
  );
  const path = useMemo(() => geoPath(projection), [projection]);

  // Island insets: each gets its own little projection inside a labelled box.
  const insets = useMemo(() => {
    const boxes: Record<string, [number, number, number, number]> = {
      'Lakshadweep': [40, VIEW_H - 128, 150, 108],
      'Andaman and Nicobar Islands': [VIEW_W - 168, VIEW_H - 250, 140, 230],
    };
    return islands.map((f) => {
      const [bx, by, bw, bh] = boxes[f.properties.st_nm] ?? [40, VIEW_H - 128, 150, 108];
      const proj = geoMercator().fitExtent([[bx + 10, by + 18], [bx + bw - 10, by + bh - 10]], f);
      // Lakshadweep includes huge shallow-bank polygons; uncapped fitExtent blows them up to fill the box.
      if (f.properties.st_nm === 'Lakshadweep' && proj.scale() > 1100) {
        proj.center([72.9, 10.2]).scale(1100).translate([bx + bw / 2, by + bh / 2]);
      }
      return { feature: f, box: [bx, by, bw, bh] as [number, number, number, number], proj, path: geoPath(proj) };
    });
  }, [islands]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.state, (m.get(e.state) ?? 0) + 1);
    return m;
  }, [events]);

  const labels = useMemo(() => mainland.map((f) => {
    const c = path.centroid(f);
    return { name: f.properties.st_nm, x: c[0], y: c[1], area: path.area(f) };
  }), [mainland, path]);

  const islandLabels = useMemo(() => insets.map((i) => ({
    name: i.feature.properties.st_nm,
    x: i.box[0] + i.box[2] / 2,
    y: i.box[1] + i.box[3] + 2,
  })), [insets]);

  // Base (un-zoomed) marker positions in viewBox space.
  const baseMarkers = useMemo<MarkerPt[]>(() => {
    const out: MarkerPt[] = [];
    for (const e of events) {
      let pt: [number, number] | null = null;
      if (ISLAND_NAMES.includes(e.state)) {
        const ins = insets.find((i) => i.feature.properties.st_nm === e.state);
        if (ins) pt = ins.proj([e.lon, e.lat]);
      } else {
        pt = projection([e.lon, e.lat]);
      }
      if (pt) out.push({ x: pt[0], y: pt[1], event: e });
    }
    return out;
  }, [events, projection, insets]);

  // ---- zoom behaviour ----
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    const zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 9])
      .translateExtent([[-VIEW_W * 0.4, -VIEW_H * 0.4], [VIEW_W * 1.4, VIEW_H * 1.4]])
      .on('zoom', (ev) => { setT(ev.transform); })
      .on('start', () => setPopup(null));
    svg.call(zb);
    svg.on('dblclick.zoom', null);
    zoomRef.current = zb;
    return () => { svg.on('.zoom', null); };
  }, []);

  const animateTo = (target: ZoomTransform, duration = 620) => {
    if (svgRef.current && zoomRef.current) {
      select(svgRef.current).transition().duration(duration).call(zoomRef.current.transform, target);
    }
  };

  // Reset to national view.
  useEffect(() => { animateTo(zoomIdentity); setPopup(null); /* eslint-disable-next-line */ }, [resetSignal]);

  useEffect(() => { setActiveMarker(null); }, [selectedState]);

  // Fit to the selected state (mainland only).
  useEffect(() => {
    if (!selectedState) return;
    if (ISLAND_NAMES.includes(selectedState)) return;
    const f = mainland.find((m) => m.properties.st_nm === selectedState);
    if (!f) return;
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const w = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1);
    const k = Math.min(7, Math.max(1.3, 0.78 * Math.min(VIEW_W / w, (VIEW_H - 120) / h)));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    animateTo(zoomIdentity.translate(VIEW_W / 2 - k * cx, VIEW_H / 2 - k * cy).scale(k));
    // eslint-disable-next-line
  }, [selectedState]);

  // Focus a selected event.
  useEffect(() => {
    if (!selectedEventId) return;
    const m = baseMarkers.find((b) => b.event.id === selectedEventId);
    if (!m) return;
    if (ISLAND_NAMES.includes(m.event.state)) return;
    const k = Math.max(t.k, 4.2);
    animateTo(zoomIdentity.translate(VIEW_W / 2 - k * m.x, (VIEW_H - 120) / 2 - k * m.y).scale(k));
    // eslint-disable-next-line
  }, [selectedEventId]);

  const apply = (x: number, y: number): [number, number] => [x * t.k + t.x, y * t.k + t.y];

  const screenMarkers = useMemo(() => baseMarkers.map((m) => {
    const [x, y] = ISLAND_NAMES.includes(m.event.state) ? [m.x, m.y] : apply(m.x, m.y);
    return { x, y, event: m.event };
  }), [baseMarkers, t]);

  const clusters = useMemo(() => clusterPoints(screenMarkers, 15), [screenMarkers]);

  const relPos = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  const zoomBy = (factor: number) => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).transition().duration(280).call(zoomRef.current.scaleBy, factor);
  };

  const showLabel = (area: number, name: string) => {
    if (name === selectedState) return true;
    if (SMALL.has(name)) return t.k > 2.6;
    return area > 700 || t.k > 1.8;
  };

  return (
    <div className="map-svg-wrap" ref={wrapRef}>
      <svg ref={svgRef} className="map-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Interactive political map of India">
        <defs>
          <radialGradient id="ocean" cx="50%" cy="38%" r="80%">
            <stop offset="0%" stopColor="#fbfdff" />
            <stop offset="100%" stopColor="#e8eff6" />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#ocean)" onClick={() => { setPopup(null); }} />

        {/* Zoomable state layer */}
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          {mainland.map((f) => {
            const name = f.properties.st_nm;
            const sel = name === selectedState;
            const has = (counts.get(name) ?? 0) > 0;
            const cls = `state-path${sel ? ' selected' : ''}${has ? ' has-events' : ''}${selectedState && !sel ? ' dimmed' : ''}`;
            return (
              <path
                key={name}
                d={path(f) ?? ''}
                className={cls}
                vectorEffect="non-scaling-stroke"
                onClick={(e) => { e.stopPropagation(); onSelectState(sel ? null : name); setPopup(null); }}
                onMouseMove={(e) => { const { px, py } = relPos(e); setHover({ name, px, py, count: counts.get(name) ?? 0 }); }}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </g>

        {/* Island insets (fixed, not zoomed) */}
        {insets.map((ins) => {
          const name = ins.feature.properties.st_nm;
          const sel = name === selectedState;
          const [bx, by, bw, bh] = ins.box;
          return (
            <g key={name}>
              <rect className="inset-box" x={bx} y={by} width={bw} height={bh} rx={8} />
              <path
                d={ins.path(ins.feature) ?? ''}
                className={`state-path${sel ? ' selected' : ''}${(counts.get(name) ?? 0) > 0 ? ' has-events' : ''}`}
                onClick={(e) => { e.stopPropagation(); onSelectState(sel ? null : name); }}
                onMouseMove={(e) => { const { px, py } = relPos(e); setHover({ name, px, py, count: counts.get(name) ?? 0 }); }}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}

        {/* Labels (screen space, constant size) */}
        <g>
          {labels.map((l) => {
            if (!showLabel(l.area, l.name)) return null;
            const [x, y] = apply(l.x, l.y);
            if (x < 4 || x > VIEW_W - 4 || y < 4 || y > VIEW_H - 4) return null;
            const short = l.name === 'Dadra and Nagar Haveli and Daman and Diu' ? 'DNH & Daman and Diu'
              : l.name === 'Andaman and Nicobar Islands' ? 'Andaman & Nicobar' : l.name;
            return <text key={l.name} x={x} y={y} className={`state-label${l.name === selectedState ? ' selected' : ''}`}>{short}</text>;
          })}
          {islandLabels.map((l) => (
            <text key={l.name} x={l.x} y={l.y + 8} className="inset-label">
              {l.name === 'Andaman and Nicobar Islands' ? 'Andaman & Nicobar Is.' : 'Lakshadweep'}
            </text>
          ))}
        </g>

        {/* Disaster markers (screen space) */}
        <g>
          {clusters.map((c, i) => {
            if (c.x < -20 || c.x > VIEW_W + 20 || c.y < -20 || c.y > VIEW_H + 20) return null;
            if (c.items.length > 1) {
              const r = 12 + Math.min(8, c.items.length);
              return (
                <g key={`c${i}`} className="cluster-badge" transform={`translate(${c.x},${c.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const k = Math.min(9, t.k * 1.9);
                    animateTo(zoomIdentity.translate(VIEW_W / 2 - k * c.x, VIEW_H / 2 - k * c.y).scale(k), 420);
                  }}>
                  <circle r={r} />
                  <text>{c.items.length}</text>
                </g>
              );
            }
            const e = c.items[0].event;
            const color = categoryColor(e.category);
            const active = e.id === selectedEventId || e.id === activeMarker;
            const r = active ? 7.5 : 5.2;
            return (
              <g key={e.id} className="map-marker" transform={`translate(${c.x},${c.y})`}
                onClick={(ev) => { ev.stopPropagation(); const { px, py } = relPos(ev); setPopup({ event: e, px, py }); setActiveMarker(e.id); }}
                onMouseMove={(ev) => { const { px, py } = relPos(ev); setHover({ name: e.name, px, py, count: 0 }); }}
                onMouseLeave={() => setHover(null)}>
                {(active || e.severity === 'severe') && <circle className="marker-pulse" r={r} fill={color} opacity={0.5} />}
                {active && <circle r={r + 4} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} />}
                <circle className="core" r={r} fill={color} />
                {e.verification === 'demo' && <circle r={r} fill="none" stroke="#fff" strokeWidth={1} strokeDasharray="1.5 1.5" />}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Hover tooltip (HTML overlay, pixel positioned) */}
      {hover && !popup && (
        <div className="map-tooltip" style={{ left: hover.px, top: hover.py }}>
          <div className="tt-name">{hover.name}</div>
          {hover.count > 0 && <div className="tt-meta">{hover.count} event{hover.count > 1 ? 's' : ''} in view</div>}
        </div>
      )}

      {/* Event popup */}
      {popup && (
        <div className="map-popup" style={{ left: popup.px, top: popup.py }}>
          <button className="mp-close" onClick={() => setPopup(null)} aria-label="Close">×</button>
          <div className="mp-head">
            <div className="mp-cat" style={{ color: categoryColor(popup.event.category) }}>{categoryLabel(popup.event.category)}</div>
            <div className="mp-title">{popup.event.name}</div>
          </div>
          <div className="mp-body">
            <div className="row"><span>Date</span><b>{formatDate(popup.event.date)}</b></div>
            <div className="row"><span>District</span><b>{popup.event.district}</b></div>
            <div className="row"><span>Status</span><b style={{ textTransform: 'capitalize' }}>{popup.event.verification}</b></div>
            <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
              onClick={() => { onSelectEvent(popup.event.id); setPopup(null); }}>
              Open in panel →
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="map-title-chip">
        <div className="t1">India · Water Disaster Intelligence</div>
        <div className="t2">Political boundaries · {mainland.length + islands.length} states &amp; UTs</div>
      </div>
      <div className="map-controls">
        <button className="btn-icon" onClick={() => zoomBy(1.5)} aria-label="Zoom in">+</button>
        <button className="btn-icon" onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom out">−</button>
        <button className="btn-icon" onClick={() => { onSelectState(null); animateTo(zoomIdentity); }} aria-label="Reset map" title="Reset to national view">⤢</button>
      </div>
      <div className="map-hint">Scroll to zoom · drag to pan · click a state</div>
    </div>
  );
}