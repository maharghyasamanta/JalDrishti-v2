import type { CategoryKey, DisasterEvent, Severity } from '../data/types';
import { CURRENT_YEAR, yearOf } from './format';

export type Period = '10y' | '5y' | 'all' | 'custom';

export interface FilterState {
  period: Period;
  fromYear: number;
  toYear: number;
  year: number | 'all';
  state: string | 'all';
  district: string;
  category: CategoryKey | 'all';
  severity: Severity | 'all';
  search: string;
}

export function defaultFilters(): FilterState {
  return {
    period: '10y',
    fromYear: CURRENT_YEAR - 10,
    toYear: CURRENT_YEAR,
    year: 'all',
    state: 'all',
    district: 'all',
    category: 'all',
    severity: 'all',
    search: '',
  };
}

/** Effective [from, to] year window implied by the period selector. */
export function periodRange(f: FilterState): [number, number] | null {
  switch (f.period) {
    case '10y': return [CURRENT_YEAR - 10, CURRENT_YEAR];
    case '5y': return [CURRENT_YEAR - 5, CURRENT_YEAR];
    case 'custom': return [Math.min(f.fromYear, f.toYear), Math.max(f.fromYear, f.toYear)];
    case 'all': return null;
  }
}

/** Individual district tokens of a record: split on "/", strip "(...)", trim, lower-case. Shared with districtOptions(). */
function districtTokens(district: string): string[] {
  return district
    .split('/')
    .map((raw) => raw.replace(/\(.*?\)/g, '').trim().toLowerCase())
    .filter(Boolean);
}

export function applyFilters(events: DisasterEvent[], f: FilterState): DisasterEvent[] {
  const range = periodRange(f);
  const q = f.search.trim().toLowerCase();
  return events.filter((e) => {
    const y = yearOf(e.date);
    if (range && (y < range[0] || y > range[1])) return false;
    if (f.year !== 'all' && y !== f.year) return false;
    if (f.state !== 'all' && e.state !== f.state) return false;
    if (f.district !== 'all' && !districtTokens(e.district).includes(f.district.trim().toLowerCase())) return false;
    if (f.category !== 'all' && e.category !== f.category) return false;
    if (f.severity !== 'all' && e.severity !== f.severity) return false;
    if (q) {
      const hay = `${e.name} ${e.state} ${e.district} ${e.location} ${e.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Clean district tokens for the district selector, derived from the dataset. */
export function districtOptions(events: DisasterEvent[], state: string | 'all'): string[] {
  const set = new Set<string>();
  for (const e of events) {
    if (state !== 'all' && e.state !== state) continue;
    for (const raw of e.district.split('/')) {
      const t = raw.replace(/\(.*?\)/g, '').trim();
      if (t && t.toLowerCase() !== 'multiple' && t.length > 1) set.add(t);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export interface ActiveChip { key: keyof FilterState | 'range'; label: string; }

export function activeChips(f: FilterState): ActiveChip[] {
  const chips: ActiveChip[] = [];
  if (f.period !== '10y') {
    const label = f.period === 'all' ? 'All years' : f.period === '5y' ? 'Last 5 years' : `${periodRange(f)![0]}–${periodRange(f)![1]}`;
    chips.push({ key: 'range', label });
  }
  if (f.year !== 'all') chips.push({ key: 'year', label: `Year ${f.year}` });
  if (f.state !== 'all') chips.push({ key: 'state', label: f.state });
  if (f.district !== 'all') chips.push({ key: 'district', label: f.district });
  if (f.category !== 'all') chips.push({ key: 'category', label: f.category });
  if (f.severity !== 'all') chips.push({ key: 'severity', label: f.severity });
  if (f.search.trim()) chips.push({ key: 'search', label: `“${f.search.trim()}”` });
  return chips;
}