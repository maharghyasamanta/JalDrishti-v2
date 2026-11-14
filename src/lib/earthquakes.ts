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
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export async function fetchEarthquakes(signal?: AbortSignal): Promise<EarthquakeData> {
  const res = await fetch(EARTHQUAKES_URL, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Earthquake server returned HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.quakes)) {
    throw new Error('Unexpected response from earthquake API');
  }
  return data as EarthquakeData;
}
