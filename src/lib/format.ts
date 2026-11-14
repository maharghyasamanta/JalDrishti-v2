export const CURRENT_YEAR = new Date().getFullYear();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

export function formatDateRange(start: string, end?: string): string {
  if (!end) return formatDate(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const s = formatDate(start);
  const e = formatDate(end);
  return sameYear ? `${s} – ${e.slice(0, 6)}` : `${s} – ${e}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-IN');
}

export function formatCoords(lat: number, lon: number): string {
  const la = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${la}, ${lo}`;
}