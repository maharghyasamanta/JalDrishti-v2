import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { IndiaFeature } from '../hooks/useIndiaGeo';
import type { DisasterEvent, StateMeta, Verification } from '../data/types';
import { CATEGORIES, categoryColor, categoryLabel } from '../data/categories';
import { formatDate, formatDateRange, formatCoords, yearOf } from '../lib/format';
import MiniMap from './MiniMap';
import { CloseIcon, ChevronDown, MapPinIcon, LayersIcon, ExternalIcon } from './Icons';

interface Props {
  meta?: StateMeta;
  feature?: IndiaFeature;
  events: DisasterEvent[];
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
  onClose: () => void;
  hasGeo: boolean;
}

type Tab = 'overview' | 'events' | 'timeline';

function VerificationBadge({ v }: { v: Verification }) {
  const map = {
    documented: { cls: 'badge-verified', label: 'Documented' },
    reported: { cls: 'badge-reported', label: 'Reported' },
    demo: { cls: 'badge-demo', label: 'Demo' },
  } as const;
  const m = map[v];
  return <span className={`badge ${m.cls}`}><span className="badge-dot" style={{ background: 'currentColor' }} />{m.label}</span>;
}

function EventCard({ e, active, onClick }: { e: DisasterEvent; active: boolean; onClick: () => void }) {
  return (
    <div className={`event-item${active ? ' active' : ''}`} onClick={onClick}>
      <div className="event-item-top">
        <span className="event-cat-dot" style={{ background: categoryColor(e.category) }} />
        <span className="event-cat" style={{ color: categoryColor(e.category) }}>{categoryLabel(e.category)}</span>
        <span className="event-date">{formatDateRange(e.date, e.endDate)}</span>
      </div>
      <div className="event-name">{e.name}</div>
      <div className="event-loc"><MapPinIcon size={13} /> {e.district} · {e.location}</div>
      <div className="event-desc">{e.description}</div>
      {e.affected && <div className="event-desc" style={{ color: 'var(--muted)' }}><b>Impact:</b> {e.affected}</div>}
      <div className="event-foot">
        <VerificationBadge v={e.verification} />
        {e.severity && <span className="badge badge-type" style={{ textTransform: 'capitalize' }}>{e.severity}</span>}
        <span className="event-coords">{formatCoords(e.lat, e.lon)} · {e.coordinatePrecision}</span>
      </div>
      <div className="event-foot" style={{ marginTop: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Source: {e.source}</span>
        {e.sourceUrl && <a className="event-src" href={e.sourceUrl} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>View source <ExternalIcon /></a>}
      </div>
    </div>
  );
}

export default function StatePanel({ meta, feature, events, selectedEventId, onSelectEvent, onClose, hasGeo }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [openYears, setOpenYears] = useState<Set<number>>(new Set());

  const years = useMemo(() => [...new Set(events.map((e) => yearOf(e.date)))].sort((a, b) => b - a), [events]);

  useEffect(() => {
    setTab('overview');
    setOpenYears(new Set(years.slice(0, 1)));
    // eslint-disable-next-line
  }, [meta?.name]);

  useEffect(() => {
    if (selectedEventId) setTab('events');
  }, [selectedEventId]);

  const districts = useMemo(() => {
    const s = new Set<string>();
    events.forEach((e) => e.district.split('/').forEach((d) => { const t = d.replace(/\(.*?\)/g, '').trim(); if (t) s.add(t); }));
    return s;
  }, [events]);

  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    events.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + 1));
    return m;
  }, [events]);
  const maxCat = Math.max(1, ...catCounts.values());

  const significant = useMemo(() => {
    const rank = { severe: 3, major: 2, moderate: 1 } as const;
    return [...events].sort((a, b) => (rank[b.severity ?? 'moderate'] ?? 0) - (rank[a.severity ?? 'moderate'] ?? 0) || (a.verification === 'demo' ? 1 : 0) - (b.verification === 'demo' ? 1 : 0))[0];
  }, [events]);

  if (!meta) {
    return (
      <aside className="panel panel-empty">
        <div className="pe-icon"><LayersIcon size={28} /></div>
        <h3>Select a state or UT</h3>
        <p>Click any region on the map — or use the State selector — to explore its water-disaster history, locations and timeline.</p>
      </aside>
    );
  }

  const toggleYear = (y: number) => setOpenYears((prev) => { const n = new Set(prev); n.has(y) ? n.delete(y) : n.add(y); return n; });

  return (
    <aside className="panel" key={meta.name}>
      <div className="panel-head">
        <div className="panel-head-top">
          <div>
            <div className="panel-title">{meta.name}</div>
            <div className="panel-type">{meta.type} · {meta.region} India · Capital: {meta.capital}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {feature && <div className="panel-mini-outline"><MiniMap feature={feature} height={74} outlineOnly /></div>}
            <button className="panel-close" onClick={onClose} aria-label="Close panel"><CloseIcon /></button>
          </div>
        </div>
      </div>

      <div className="panel-stats">
        <div className="pstat"><div className="v">{events.length}</div><div className="l">Events</div></div>
        <div className="pstat"><div className="v">{districts.size}</div><div className="l">Districts</div></div>
        <div className="pstat"><div className="v">{years.length}</div><div className="l">Years</div></div>
      </div>

      <div className="panel-tabs">
        <button className={`panel-tab${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`panel-tab${tab === 'events' ? ' active' : ''}`} onClick={() => setTab('events')}>Locations ({events.length})</button>
        <button className={`panel-tab${tab === 'timeline' ? ' active' : ''}`} onClick={() => setTab('timeline')}>Timeline</button>
      </div>

      <div className="panel-body">
        {events.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px 10px', fontSize: 13.5 }}>
            No records for this region under the current filters.<br />Try widening the time period or clearing filters.
          </div>
        )}

        {tab === 'overview' && events.length > 0 && (
          <>
            {feature && (
              <>
                <div className="panel-section-label">Disaster locations</div>
                <div className="mini-map"><MiniMap feature={feature} events={events} selectedEventId={selectedEventId} onSelectEvent={onSelectEvent} height={200} /></div>
              </>
            )}
            <div className="panel-section-label">Categories</div>
            {CATEGORIES.filter((c) => catCounts.has(c.key)).map((c) => (
              <div className="cat-row" key={c.key}>
                <span className="cat-dot" style={{ background: c.color }} />
                <span className="cat-name">{c.label}</span>
                <span className="cat-bar"><span style={{ width: `${((catCounts.get(c.key) ?? 0) / maxCat) * 100}%`, background: c.color }} /></span>
                <span className="cat-count">{catCounts.get(c.key)}</span>
              </div>
            ))}
            {significant && (
              <>
                <div className="panel-section-label" style={{ marginTop: 18 }}>Most significant catalogued event</div>
                <EventCard e={significant} active={significant.id === selectedEventId} onClick={() => onSelectEvent(significant.id)} />
              </>
            )}
            {!hasGeo && <p style={{ fontSize: 12, color: 'var(--muted-2)' }}>Map geometry loading…</p>}
          </>
        )}

        {tab === 'events' && events.length > 0 && (
          <>
            {feature && (
              <div className="mini-map"><MiniMap feature={feature} events={events} selectedEventId={selectedEventId} onSelectEvent={onSelectEvent} height={190} /></div>
            )}
            <div className="panel-section-label">Recorded locations · click to focus on map</div>
            {[...events].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
              <EventCard key={e.id} e={e} active={e.id === selectedEventId} onClick={() => onSelectEvent(e.id)} />
            ))}
          </>
        )}

        {tab === 'timeline' && events.length > 0 && (
          <>
            <div className="panel-section-label">Chronological timeline</div>
            <div className="timeline">
              {years.map((y) => {
                const ye = events.filter((e) => yearOf(e.date) === y).sort((a, b) => a.date.localeCompare(b.date));
                const open = openYears.has(y);
                return (
                  <div className="tl-year" key={y}>
                    <button className="tl-year-head" onClick={() => toggleYear(y)}>
                      <span className="tl-year-badge">{y}</span>
                      <span className="tl-year-count">{ye.length} event{ye.length > 1 ? 's' : ''}</span>
                      <ChevronDown className={`tl-chevron${open ? ' open' : ''}`} />
                    </button>
                    {open && (
                      <div className="tl-events">
                        {ye.map((e) => (
                          <div className="tl-event" key={e.id} style={{ cursor: 'pointer', ['--dot' as string]: categoryColor(e.category) } as CSSProperties} onClick={() => onSelectEvent(e.id)}>
                            <div className="tl-date">{formatDate(e.date)} · <span style={{ color: categoryColor(e.category) }}>{categoryLabel(e.category)}</span></div>
                            <div className="tl-name">{e.name}</div>
                            <div className="tl-meta">{e.district}{e.severity ? ` · ${e.severity}` : ''} · {e.verification}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}