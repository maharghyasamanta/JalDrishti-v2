import { useMemo } from 'react';
import type { FilterState, Period } from '../lib/filters';
import { activeChips, districtOptions } from '../lib/filters';
import type { DisasterEvent, CategoryKey, Severity } from '../data/types';
import { CATEGORIES } from '../data/categories';
import { STATES } from '../data/states';
import { CURRENT_YEAR, yearOf } from '../lib/format';
import { CloseIcon, SearchIcon } from './Icons';

interface Props {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onClear: () => void;
  onRemoveChip: (key: string) => void;
  allEvents: DisasterEvent[];
  resultCount: number;
}

export default function FilterToolbar({ filters, onChange, onClear, onRemoveChip, allEvents, resultCount }: Props) {
  const districts = useMemo(() => districtOptions(allEvents, filters.state), [allEvents, filters.state]);
  const years = useMemo(() => [...new Set(allEvents.map((e) => yearOf(e.date)))].sort((a, b) => b - a), [allEvents]);
  const chips = activeChips(filters);

  return (
    <div className="card toolbar">
      <div className="toolbar-row">
        <div className="field">
          <label htmlFor="f-period">Time period</label>
          <select id="f-period" value={filters.period} onChange={(e) => onChange({ period: e.target.value as Period })}>
            <option value="10y">Last 10 Years</option>
            <option value="5y">Last 5 Years</option>
            <option value="all">All Years</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {filters.period === 'custom' && (
          <>
            <div className="field" style={{ maxWidth: 110 }}>
              <label htmlFor="f-from">From</label>
              <input id="f-from" type="number" min={1990} max={CURRENT_YEAR} value={filters.fromYear} onChange={(e) => onChange({ fromYear: Number(e.target.value) })} />
            </div>
            <div className="field" style={{ maxWidth: 110 }}>
              <label htmlFor="f-to">To</label>
              <input id="f-to" type="number" min={1990} max={CURRENT_YEAR} value={filters.toYear} onChange={(e) => onChange({ toYear: Number(e.target.value) })} />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="f-year">Year</label>
          <select id="f-year" value={filters.year} onChange={(e) => onChange({ year: e.target.value === 'all' ? 'all' : Number(e.target.value) })}>
            <option value="all">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-state">State / UT</label>
          <select id="f-state" value={filters.state} onChange={(e) => onChange({ state: e.target.value, district: 'all' })}>
            <option value="all">All States &amp; UTs</option>
            {STATES.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-district">District</label>
          <select id="f-district" value={filters.district} onChange={(e) => onChange({ district: e.target.value })}>
            <option value="all">All districts</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-cat">Category</label>
          <select id="f-cat" value={filters.category} onChange={(e) => onChange({ category: e.target.value as CategoryKey | 'all' })}>
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>

        <div className="field" style={{ maxWidth: 140 }}>
          <label htmlFor="f-sev">Severity</label>
          <select id="f-sev" value={filters.severity} onChange={(e) => onChange({ severity: e.target.value as Severity | 'all' })}>
            <option value="all">Any severity</option>
            <option value="severe">Severe</option>
            <option value="major">Major</option>
            <option value="moderate">Moderate</option>
          </select>
        </div>

        <div className="field grow">
          <label htmlFor="f-search">Search location / district</label>
          <input id="f-search" value={filters.search} placeholder="e.g. Wayanad, Chennai, Teesta…" onChange={(e) => onChange({ search: e.target.value })} />
        </div>

        <button className="btn btn-ghost btn-sm" onClick={onClear} style={{ height: 38 }}>Clear Filters</button>
      </div>

      <div className="toolbar-meta">
        <span className="result-count"><strong>{resultCount}</strong> event{resultCount === 1 ? '' : 's'} match current filters</span>
        {chips.length > 0 && (
          <div className="active-chips">
            {chips.map((c) => (
              <span className="chip" key={c.key}>
                {c.label}
                <button onClick={() => onRemoveChip(c.key)} aria-label={`Remove ${c.label}`}><CloseIcon size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted-2)', fontSize: 12 }}>
          <SearchIcon size={13} /> Filters update map, panel &amp; timeline
        </span>
      </div>
    </div>
  );
}