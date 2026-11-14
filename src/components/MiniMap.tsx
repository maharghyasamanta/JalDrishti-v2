import { useMemo } from 'react';
import { geoMercator, geoPath } from 'd3';
import type { IndiaFeature } from '../hooks/useIndiaGeo';
import type { DisasterEvent } from '../data/types';
import { categoryColor } from '../data/categories';

interface Props {
  feature: IndiaFeature;
  events?: DisasterEvent[];
  selectedEventId?: string | null;
  onSelectEvent?: (id: string) => void;
  height?: number;
  outlineOnly?: boolean;
}

export default function MiniMap({ feature, events = [], selectedEventId, onSelectEvent, height = 200, outlineOnly }: Props) {
  const H = height;
  const W = outlineOnly ? height : 320;
  const { path, proj } = useMemo(() => {
    const p = geoMercator().fitExtent([[12, 12], [W - 12, H - 12]], feature);
    return { path: geoPath(p), proj: p };
  }, [feature, H, W]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: outlineOnly ? '100%' : H }}>
      <path d={path(feature) ?? ''} fill={outlineOnly ? '#cddbe8' : '#dfe7f0'} stroke="#fff" strokeWidth={0.8} />
      {!outlineOnly && events.map((e) => {
        const pt = proj([e.lon, e.lat]);
        if (!pt) return null;
        const active = e.id === selectedEventId;
        return (
          <g key={e.id} transform={`translate(${pt[0]},${pt[1]})`} style={{ cursor: 'pointer' }} onClick={() => onSelectEvent?.(e.id)}>
            {active && <circle r={8} fill="none" stroke={categoryColor(e.category)} strokeWidth={1.5} />}
            <circle r={active ? 5 : 3.6} fill={categoryColor(e.category)} stroke="#fff" strokeWidth={1.2} />
          </g>
        );
      })}
    </svg>
  );
}