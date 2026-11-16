// Client for the earthquake API endpoint.

export interface Earthquake {
  id: string;
  magnitude: number;
  time: string;
  latitude: number;
  longitude: number;
  depth: number;
  region: string;
  location: string;
  type: string;
  source: string;
  inIndia: boolean;
  state: string | null;
  url?: string;
  felt?: number;
  tsunami?: number;
  significance?: number;
}

export interface EarthquakeData {
  generatedAt: string | null;
  source: string;
  ok: boolean;
  totalCount: number;
  indiaCount: number;
  maxMagnitude: number;
  avgMagnitude: number;
  byMagnitude: {
    minor: number;
    light: number;
    moderate: number;
    strong: number;
    major: number;
  };
  quakes: Earthquake[];
}

export const EARTHQUAKES_URL: string = import.meta.env.VITE_EARTHQUAKES_URL || '/api/earthquakes';

export const MAG_COLOR: Record<string, string> = {
  minor:    '#4fc3d0',  // < 3
  light:    '#5bcc6e',  // 3-4
  moderate: '#f4b544',  // 4-5
  strong:   '#e87333',  // 5-6
  major:    '#e05252',  // 6+
};

export function magCategory(mag: number): string {
  if (mag < 3) return 'minor';
  if (mag < 4) return 'light';
  if (mag < 5) return 'moderate';
  if (mag < 6) return 'strong';
  return 'major';
}

export function magColor(mag: number): string {
  return MAG_COLOR[magCategory(mag)] ?? '#8DA3B8';
}

export function magLabel(mag: number): string {
  if (mag < 3) return 'Minor';
  if (mag < 4) return 'Light';
  if (mag < 5) return 'Moderate';
  if (mag < 6) return 'Strong';
  return 'Major';
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export function relativeTime(iso: string): string {
  const parsed = new Date(iso).getTime();
  if (!Number.isFinite(parsed)) return 'unknown';
  const diffMs = Math.max(0, Date.now() - parsed);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export async function fetchEarthquakes(signal?: AbortSignal): Promise<EarthquakeData> {
  const res = await fetch(EARTHQUAKES_URL, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Earthquake server returned HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!data || typeof data !== 'object' || !Array.isArray((data as { quakes?: unknown }).quakes)) {
    throw new Error('Unexpected response from earthquake API');
  }
  const raw = data as Partial<EarthquakeData> & { quakes: Array<Partial<Earthquake>> };
  const quakes: Earthquake[] = raw.quakes.map((q) => ({
    id: String(q.id ?? ''),
    magnitude: typeof q.magnitude === 'number' ? q.magnitude : Number(q.magnitude),
    time: String(q.time ?? ''),
    latitude: typeof q.latitude === 'number' ? q.latitude : Number(q.latitude),
    longitude: typeof q.longitude === 'number' ? q.longitude : Number(q.longitude),
    depth: typeof q.depth === 'number' ? q.depth : Number(q.depth ?? 0),
    region: String(q.region ?? ''),
    location: String(q.location ?? ''),
    type: String(q.type ?? 'earthquake'),
    source: String(q.source ?? ''),
    inIndia: Boolean(q.inIndia),
    state: typeof q.state === 'string' && q.state.trim() ? q.state.trim() : null,
    url: typeof q.url === 'string' ? q.url : undefined,
    felt: typeof q.felt === 'number' ? q.felt : undefined,
    tsunami: typeof q.tsunami === 'number' ? q.tsunami : undefined,
    significance: typeof q.significance === 'number' ? q.significance : undefined,
  }));
  return {
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
    source: String(raw.source ?? ''),
    ok: Boolean(raw.ok),
    totalCount: typeof raw.totalCount === 'number' ? raw.totalCount : quakes.length,
    indiaCount: typeof raw.indiaCount === 'number' ? raw.indiaCount : quakes.filter((q) => q.inIndia).length,
    maxMagnitude: typeof raw.maxMagnitude === 'number' ? raw.maxMagnitude : 0,
    avgMagnitude: typeof raw.avgMagnitude === 'number' ? raw.avgMagnitude : 0,
    byMagnitude: raw.byMagnitude ?? { minor: 0, light: 0, moderate: 0, strong: 0, major: 0 },
    quakes,
  };
}
