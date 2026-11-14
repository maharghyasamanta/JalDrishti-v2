import { useMemo } from 'react';
import type { DisasterEvent } from '../data/types';
import { CATEGORIES, categoryColor, categoryLabel } from '../data/categories';
import { yearOf } from '../lib/format';
import { InfoIcon } from './Icons';

interface Props { events: DisasterEvent[]; scopeLabel: string; }

function BarRows({ data, color }: { data: [string, number][]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d[1]));
  return (
    <div>
      {data.map(([label, value]) => (
        <div className="bar-row" key={label}>
          <span className="bl" title={label}>{label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(value / max) * 100}%`, background: color }} /></span>
          <span className="bv">{value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Analytics({ events, scopeLabel }: Props) {
  const byYear = useMemo(() => {
    const m = new Map<number, number>();
    events.forEach((e) => m.set(yearOf(e.date), (m.get(yearOf(e.date)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [events]);

  const byState = useMemo(() => {
    const m = new Map<string, number>();
    events.forEach((e) => m.set(e.state, (m.get(e.state) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [events]);

  const byCategory = useMemo(() => CATEGORIES.map((c) => [c, events.filter((e) => e.category === c.key).length] as const).filter(([, n]) => n > 0), [events]);

  const byDistrict = useMemo(() => {
    const m = new Map<string, number>();
    events.forEach((e) => e.district.split('/').forEach((d) => { const t = d.replace(/\(.*?\)/g, '').trim(); if (t && t.toLowerCase() !== 'multiple') m.set(t, (m.get(t) ?? 0) + 1); }));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [events]);

  const documented = events.filter((e) => e.verification !== 'demo').length;
  const maxYear = Math.max(1, ...byYear.map((d) => d[1]));
  const enough = events.length >= 5;

  // Donut geometry
  const total = events.length || 1;
  const R = 54, C = 2 * Math.PI * R;
  let acc = 0;
  const segments = byCategory.map(([c, n]) => {
    const len = (n / total) * C;
    const seg = { color: c.color, dash: `${len} ${C - len}`, offset: -acc };
    acc += len;
    return seg;
  });

  return (
    <section className="section" id="analytics" style={{ background: 'var(--surface-2)' }}>
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">National Disaster Analytics</span>
          <h2 className="section-title">Understanding India's Water Disaster Patterns</h2>
          <p className="section-sub">Frequency, distribution and category mix across the catalogued records. Scope: <b>{scopeLabel}</b>. Rankings appear only where the filtered dataset has enough records.</p>
        </div>

        <div className="mini-stat-grid">
          <div className="card mini-stat"><div className="v">{events.length}</div><div className="l">Events in scope</div><div className="d" style={{ color: 'var(--teal-600)' }}>{documented} documented / reported</div></div>
          <div className="card mini-stat"><div className="v">{byState.length}</div><div className="l">States &amp; UTs represented</div><div className="d" style={{ color: 'var(--muted)' }}>in current filters</div></div>
          <div className="card mini-stat"><div className="v">{byCategory.length}</div><div className="l">Disaster categories</div><div className="d" style={{ color: 'var(--muted)' }}>of {CATEGORIES.length} defined</div></div>
          <div className="card mini-stat"><div className="v">{byYear.length ? byYear.reduce((a, b) => b[1] > a[1] ? b : a)[0] : '—'}</div><div className="l">Most active year</div><div className="d" style={{ color: 'var(--muted)' }}>by catalogued count</div></div>
        </div>

        <div className="analytics-grid">
          <div className="card chart-card span-2">
            <h3>Year-wise disaster frequency</h3>
            <div className="chart-sub">Number of catalogued events per year ({scopeLabel.toLowerCase()}).</div>
            {byYear.length > 0 ? (
              <div className="col-chart">
                {byYear.map(([y, n]) => (
                  <div className="col-item" key={y}>
                    <div className="col-bar" style={{ height: `${(n / maxYear) * 100}%` }}><span className="col-val">{n}</span></div>
                    <div className="col-label">{y}</div>
                  </div>
                ))}
              </div>
            ) : <div className="search-empty">No events in the current filters.</div>}
            <div className="chart-note"><InfoIcon /> Counts reflect the prototype catalogue, not an exhaustive official database.</div>
          </div>

          <div className="card chart-card">
            <h3>State-wise distribution</h3>
            <div className="chart-sub">Top regions by catalogued events.</div>
            {enough && byState.length > 0 ? <BarRows data={byState} color="var(--teal)" /> : <div className="search-empty">Not enough records for a reliable ranking.</div>}
          </div>

          <div className="card chart-card">
            <h3>Category-wise distribution</h3>
            <div className="chart-sub">Share of events by disaster category.</div>
            {byCategory.length > 0 ? (
              <div className="donut-wrap">
                <svg width={140} height={140} viewBox="0 0 140 140">
                  <g transform="translate(70,70) rotate(-90)">
                    <circle r={R} fill="none" stroke="var(--surface-2)" strokeWidth={18} />
                    {segments.map((s, i) => <circle key={i} r={R} fill="none" stroke={s.color} strokeWidth={18} strokeDasharray={s.dash} strokeDashoffset={s.offset} />)}
                  </g>
                  <text x={70} y={66} textAnchor="middle" style={{ font: '700 22px Sora, sans-serif', fill: 'var(--navy)' }}>{events.length}</text>
                  <text x={70} y={84} textAnchor="middle" style={{ font: '500 10px Inter, sans-serif', fill: 'var(--muted)' }}>events</text>
                </svg>
                <div className="donut-legend">
                  {byCategory.map(([c, n]) => (
                    <div className="dl" key={c.key}><span className="legend-swatch" style={{ background: c.color }} />{c.short}<b>{n}</b></div>
                  ))}
                </div>
              </div>
            ) : <div className="search-empty">No events in the current filters.</div>}
          </div>

          <div className="card chart-card span-2">
            <h3>Most frequently affected districts</h3>
            <div className="chart-sub">Districts appearing most often in the catalogued records.</div>
            {enough && byDistrict.length > 0 ? <BarRows data={byDistrict} color="#8B5CF6" /> : <div className="search-empty">Not enough records for a reliable ranking.</div>}
            <div className="chart-note"><InfoIcon /> District names are derived from record metadata; combined districts are split for counting.</div>
          </div>
        </div>
      </div>
    </section>
  );
}