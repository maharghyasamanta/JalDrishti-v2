// Client for the alerts server (see /server). The browser never talks to NDMA directly.

export type AlertSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';

export type HazardGroup = 'water' | 'storm' | 'heat' | 'cold' | 'other';

export const HAZARD_ORDER: HazardGroup[] = ['water', 'storm', 'heat', 'cold', 'other'];

export const HAZARD_LABEL: Record<HazardGroup, string> = {
  water: 'Water (rain, flood)',
  storm: 'Storm & lightning',
  heat: 'Heat',
  cold: 'Cold & fog',
  other: 'Other',
};

export const HAZARD_SHORT: Record<HazardGroup, string> = {
  water: 'Water', storm: 'Storm', heat: 'Heat', cold: 'Cold', other: 'Other',
};

export interface SachetAlert {
  id: string;
  headline: string;
  event: string;
  hazard: HazardGroup;
  severity: AlertSeverity;
  areaDesc: string;
  states: string[];
  unresolved: boolean;
  unresolvedAreas: string[];
  sender: string | null;
  sent: string | null;
  expires: string | null;
  detailsInOriginal: boolean;
  link: string;
}

export interface AlertsResponse {
  generatedAt: string | null;
  upstreamOk: boolean;
  alerts: SachetAlert[];
  unresolvedCount: number;
  missingCount?: number;
}

export const SEVERITY_RANK: Record<AlertSeverity, number> = {
  Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0,
};

export const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  Extreme: '#C6303A',
  Severe: '#E05252',
  Moderate: '#F4B544',
  Minor: '#8DDCE5',
  Unknown: '#8DA3B8',
};

export const ALERTS_URL: string = import.meta.env.VITE_ALERTS_URL || '/api/alerts';

export interface SachetData {
  alerts: SachetAlert[];
  unresolved: SachetAlert[];
  unresolvedCount: number;
  byState: ByState;
  generatedAt: Date | null;
  upstreamOk: boolean;
  missingCount: number;
}

const SEVERITIES = Object.keys(SEVERITY_RANK);

export type ByState = Map<string, { max: AlertSeverity; count: number }>;

/** Per-state alert count and highest severity for any list of alerts (so the map can follow the hazard filter). */
export function buildByState(alerts: SachetAlert[]): ByState {
  const byState: ByState = new Map();
  for (const a of alerts) {
    for (const s of a.states) {
      const cur = byState.get(s);
      if (!cur) byState.set(s, { max: a.severity, count: 1 });
      else {
        cur.count += 1;
        if (SEVERITY_RANK[a.severity] > SEVERITY_RANK[cur.max]) cur.max = a.severity;
      }
    }
  }
  return byState;
}

function parseDate(s: unknown): Date | null {
  if (typeof s !== 'string') return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Validate the payload shape so a malformed response is an error, never an empty "all clear". */
function validate(raw: unknown): AlertsResponse {
  const r = raw as Partial<AlertsResponse> | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.alerts) || typeof r.upstreamOk !== 'boolean') {
    throw new Error('Unexpected response from alerts server');
  }
  const alerts = r.alerts.map((a): SachetAlert => ({
    id: String(a.id),
    headline: String(a.headline ?? ''),
    event: String(a.event ?? ''),
    hazard: HAZARD_ORDER.includes(a.hazard as HazardGroup) ? (a.hazard as HazardGroup) : 'other',
    severity: SEVERITIES.includes(a.severity) ? a.severity : 'Unknown',
    areaDesc: String(a.areaDesc ?? ''),
    states: Array.isArray(a.states) ? a.states.map(String) : [],
    unresolved: Boolean(a.unresolved),
    unresolvedAreas: Array.isArray(a.unresolvedAreas) ? a.unresolvedAreas.map(String) : [],
    sender: a.sender ? String(a.sender) : null,
    sent: typeof a.sent === 'string' ? a.sent : null,
    expires: typeof a.expires === 'string' ? a.expires : null,
    detailsInOriginal: Boolean(a.detailsInOriginal),
    link: String(a.link ?? ''),
  }));
  return { ...r, alerts } as AlertsResponse;
}

export async function fetchSachetAlerts(signal?: AbortSignal): Promise<SachetData> {
  const res = await fetch(ALERTS_URL, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Alerts server returned HTTP ${res.status}`);
  const data = validate(await res.json());

  return {
    alerts: data.alerts,
    unresolved: data.alerts.filter((a) => a.unresolved),
    unresolvedCount: typeof data.unresolvedCount === 'number' ? data.unresolvedCount : data.alerts.filter((a) => a.unresolved).length,
    byState: buildByState(data.alerts),
    generatedAt: parseDate(data.generatedAt),
    upstreamOk: data.upstreamOk,
    missingCount: data.missingCount ?? 0,
  };
}

/** Severity (high first), then sent date (newest first), unknown dates last. Never compares NaN. */
export function compareAlerts(a: SachetAlert, b: SachetAlert): number {
  const bySev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (bySev !== 0) return bySev;
  const ta = parseDate(a.sent)?.getTime() ?? null;
  const tb = parseDate(b.sent)?.getTime() ?? null;
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return tb - ta;
}

export function formatSent(sent: string | null): string {
  const d = parseDate(sent);
  return d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Time unknown';
}
