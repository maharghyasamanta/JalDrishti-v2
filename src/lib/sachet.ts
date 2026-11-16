// Client for the alerts server (see /server). The browser never talks to NDMA directly.

export type AlertSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';

export type HazardGroup = 'coastal' | 'water' | 'storm' | 'heat' | 'cold' | 'other';

export type AlertPlacement = 'text' | 'polygon' | 'polygon-coast' | 'geocode' | 'sender' | 'none';

export type AlertShape =
  | { kind: 'polygon'; coords: [number, number][] }
  | { kind: 'circle'; lat: number; lon: number; radiusKm: number };

export const HAZARD_ORDER: HazardGroup[] = ['water', 'coastal', 'storm', 'heat', 'cold', 'other'];

export const HAZARD_LABEL: Record<HazardGroup, string> = {
  water: 'Water (rain, flood)',
  coastal: 'Coast & sea (waves, tides, surge)',
  storm: 'Storm & lightning',
  heat: 'Heat',
  cold: 'Cold & fog',
  other: 'Other',
};

export const HAZARD_SHORT: Record<HazardGroup, string> = {
  water: 'Water',
  coastal: 'Coast',
  storm: 'Storm',
  heat: 'Heat',
  cold: 'Cold',
  other: 'Other',
};

export interface SachetAlert {
  id: string;
  isDemo?: boolean;
  waterRelated?: boolean;
  headline: string;
  event: string;
  hazard: HazardGroup;
  severity: AlertSeverity;
  description: string;
  instruction: string;
  areaDesc: string;
  states: string[];
  placement: AlertPlacement;
  shapes: AlertShape[];
  unresolved: boolean;
  unresolvedAreas: string[];
  sender: string | null;
  sent: string | null;
  expires: string | null;
  detailsInOriginal: boolean;
  link: string;
}

/** Client-only demo alert rendered exclusively on /#/live-alerts?demo=coastal (never from /api/alerts). */
export const DEMO_COASTAL_ALERT: SachetAlert = {
  id: 'demo-coastal-ap-bhimunipatnam',
  isDemo: true,
  waterRelated: true,
  headline: 'High Waves — Palmanpeta - Bhimunipatnam (Visakhapatnam coast)',
  event: 'High Waves',
  hazard: 'coastal',
  severity: 'Moderate',
  description: 'Heavy waves of 1.3-1.4 m possible from 4:00 AM on 15 Nov to 7:00 AM on 17 Nov. People and fishermen should be alert and avoid the beaches.',
  instruction: '',
  areaDesc: 'Palmanpeta - Bhimunipatnam (Visakhapatnam coast)',
  states: ['Andhra Pradesh'],
  placement: 'polygon-coast',
  shapes: [
    {
      kind: 'polygon',
      coords: [
        [17.64, 83.24],
        [18.14, 83.74],
        [17.98, 83.95],
        [17.48, 83.45],
        [17.64, 83.24],
      ],
    },
  ],
  unresolved: false,
  unresolvedAreas: [],
  sender: 'SACHET (Andhra Pradesh SDMA)',
  sent: '2026-11-15T04:00:00+05:30',
  expires: '2026-11-17T07:00:00+05:30',
  detailsInOriginal: false,
  link: '',
};

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

export const ALERTS_URL: string = import.meta.env?.VITE_ALERTS_URL || '/api/alerts';

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
const PLACEMENTS: readonly AlertPlacement[] = ['text', 'polygon', 'polygon-coast', 'geocode', 'sender', 'none'];
const NON_LATIN_LETTER = /(?!\p{Script=Latin})\p{L}/u;
const MAX_TEXT_LEN = 600;
const MAX_SHAPES = 20;
const MAX_RING_VERTICES = 500;
const MAX_ALERT_VERTICES = 1000;

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

const inIndiaBounds = (lat: number, lon: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lon) && lat >= 0 && lat <= 40 && lon >= 60 && lon <= 100;

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round2 = (n: number): number => Math.round(n * 100) / 100;

function sanitizeLatinText(raw: unknown, maxLen = MAX_TEXT_LEN): string {
  if (typeof raw !== 'string') return '';
  if (NON_LATIN_LETTER.test(raw)) return '';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  return collapsed.length > maxLen ? `${collapsed.slice(0, maxLen - 1).trimEnd()}…` : collapsed;
}

function sanitizePlacement(raw: unknown): AlertPlacement {
  if (typeof raw === 'string' && (PLACEMENTS as readonly string[]).includes(raw)) {
    return raw as AlertPlacement;
  }
  return 'none';
}

function sanitizeShapes(raw: unknown): AlertShape[] {
  if (!Array.isArray(raw)) return [];
  const out: AlertShape[] = [];
  let totalVertices = 0;

  for (const item of raw) {
    if (out.length >= MAX_SHAPES || totalVertices >= MAX_ALERT_VERTICES) break;
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;

    if (rec.kind === 'circle') {
      const lat = typeof rec.lat === 'number' ? rec.lat : Number.NaN;
      const lon = typeof rec.lon === 'number' ? rec.lon : Number.NaN;
      const radiusKm = typeof rec.radiusKm === 'number' ? rec.radiusKm : Number.NaN;
      if (!inIndiaBounds(lat, lon) || !Number.isFinite(radiusKm) || radiusKm < 0 || radiusKm > 2000) continue;
      out.push({ kind: 'circle', lat: round3(lat), lon: round3(lon), radiusKm: round2(radiusKm) });
      totalVertices += 1;
      continue;
    }

    if (rec.kind === 'polygon' && Array.isArray(rec.coords)) {
      const pts: [number, number][] = [];
      let valid = true;
      for (const pair of rec.coords) {
        if (!Array.isArray(pair) || pair.length !== 2) { valid = false; break; }
        const lat = typeof pair[0] === 'number' ? pair[0] : Number.NaN;
        const lon = typeof pair[1] === 'number' ? pair[1] : Number.NaN;
        if (!inIndiaBounds(lat, lon)) { valid = false; break; }
        const pt: [number, number] = [round3(lat), round3(lon)];
        const prev = pts[pts.length - 1];
        if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) pts.push(pt);
      }
      if (!valid) continue;

      let ring = pts;
      while (ring.length > MAX_RING_VERTICES) {
        const halved = ring.filter((_, idx) => idx % 2 === 0);
        if (halved.length < 3) break;
        ring = halved;
      }

      const uniqueCount =
        ring.length >= 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
          ? ring.length - 1
          : ring.length;
      if (uniqueCount < 3 || totalVertices + ring.length > MAX_ALERT_VERTICES) continue;
      out.push({ kind: 'polygon', coords: ring });
      totalVertices += ring.length;
    }
  }

  return out;
}

/** Validate the payload shape so a malformed response is an error, never an empty "all clear". */
function validate(raw: unknown): AlertsResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Unexpected response from alerts server');
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.alerts) || typeof r.upstreamOk !== 'boolean') {
    throw new Error('Unexpected response from alerts server');
  }

  const alerts = r.alerts.map((entry): SachetAlert => {
    const a = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const sev = typeof a.severity === 'string' && SEVERITIES.includes(a.severity)
      ? (a.severity as AlertSeverity)
      : 'Unknown';
    const haz = typeof a.hazard === 'string' && HAZARD_ORDER.includes(a.hazard as HazardGroup)
      ? (a.hazard as HazardGroup)
      : 'other';
    return {
      id: typeof a.id === 'string' ? a.id : String(a.id ?? ''),
      headline: sanitizeLatinText(a.headline, 300),
      event: sanitizeLatinText(a.event, 200) || 'Unspecified hazard',
      hazard: haz,
      severity: sev,
      description: sanitizeLatinText(a.description, MAX_TEXT_LEN),
      instruction: sanitizeLatinText(a.instruction, MAX_TEXT_LEN),
      areaDesc: sanitizeLatinText(a.areaDesc, 2000),
      states: Array.isArray(a.states) ? a.states.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()) : [],
      placement: sanitizePlacement(a.placement),
      shapes: sanitizeShapes(a.shapes),
      unresolved: Boolean(a.unresolved),
      unresolvedAreas: Array.isArray(a.unresolvedAreas)
        ? a.unresolvedAreas.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
        : [],
      sender: typeof a.sender === 'string' && a.sender.trim() ? sanitizeLatinText(a.sender, 160) || null : null,
      sent: typeof a.sent === 'string' ? a.sent : null,
      expires: typeof a.expires === 'string' ? a.expires : null,
      detailsInOriginal: Boolean(a.detailsInOriginal),
      link: typeof a.link === 'string' && /^https?:\/\//i.test(a.link) ? a.link : '',
    };
  });

  return {
    generatedAt: typeof r.generatedAt === 'string' ? r.generatedAt : null,
    upstreamOk: r.upstreamOk,
    alerts,
    unresolvedCount: typeof r.unresolvedCount === 'number' ? r.unresolvedCount : alerts.filter((x) => x.unresolved).length,
    missingCount: typeof r.missingCount === 'number' ? r.missingCount : undefined,
  };
}

export interface FetchWarmupOptions {
  maxWarmupRetries?: number;
  warmupDelayMs?: number;
}

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function fetchSachetAlerts(
  signal?: AbortSignal,
  options?: FetchWarmupOptions,
): Promise<SachetData> {
  const maxRetries = options?.maxWarmupRetries ?? 10;
  const baseDelayMs = options?.warmupDelayMs ?? 1500;

  let res: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    res = await fetch(ALERTS_URL, {
      signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxRetries) {
      await waitForRetry(baseDelayMs, signal);
      continue;
    }
    break;
  }

  if (!res || !res.ok) {
    throw new Error(`Alerts server returned HTTP ${res?.status ?? 'unknown'}`);
  }
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

function formatIst(d: Date): string {
  return `${d
    .toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase())} IST`;
}

export function formatSent(sent: string | null): string {
  const d = parseDate(sent);
  return d ? formatIst(d) : 'Time unknown';
}

export function formatUntil(expires: string | null): string | null {
  const d = parseDate(expires);
  return d ? `until ${formatIst(d)}` : null;
}
