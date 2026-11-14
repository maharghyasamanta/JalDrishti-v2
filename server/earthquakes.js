// Earthquake data proxy — fetches from NCS (riseq.seismo.gov.in) and falls back to USGS.
// In-memory cache with 15-minute refresh cycle.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const NCS_URL = 'https://riseq.seismo.gov.in/riseq/earthquake';
export const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
export const REFRESH_MS = 15 * 60 * 1000; // 15 minutes
export const REQUEST_TIMEOUT_MS = 15_000;

// India bounding box (with generous buffer for nearby quakes)
const MIN_LAT = 4;
const MAX_LAT = 40;
const MIN_LON = 65;
const MAX_LON = 100;

/**
 * Try to fetch from NCS (India's National Center for Seismology).
 * The site renders an HTML table. We parse it to extract earthquake data.
 */
async function fetchNCS(log) {
  try {
    const res = await fetch(NCS_URL, {
      headers: {
        'User-Agent': 'JalDrishti/1.0 (independent disaster dashboard; educational use)',
        'Accept': 'text/html, application/xhtml+xml, */*',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`NCS HTTP ${res.status}`);
    const html = await res.text();

    // Parse the HTML table rows
    const quakes = parseNCSHtml(html);
    if (quakes.length === 0) throw new Error('No earthquake data parsed from NCS');

    log(`NCS: Parsed ${quakes.length} earthquakes`);
    return quakes;
  } catch (e) {
    log(`NCS fetch failed: ${e.message}`);
    return null;
  }
}

/**
 * Parse NCS HTML. 
 * Checks both embedded `data-json` attributes in sidebar list items AND the HTML table rows.
 */
function parseNCSHtml(html) {
  const quakes = [];

  // Method 1: Parse `data-json` attributes embedded in the DOM list items
  const dataJsonRegex = /data-json=(?:'([^']+)'|"([^"]+)")/gi;
  let match;
  while ((match = dataJsonRegex.exec(html)) !== null) {
    const rawJson = match[1] || match[2];
    if (!rawJson) continue;
    try {
      // Decode HTML entities if present
      const decoded = rawJson.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
      const item = JSON.parse(decoded);
      const mag = parseFloat(item.magnitude);
      const lat = parseFloat(item.latitude);
      const lon = parseFloat(item.longitude);
      const depth = parseFloat(item.depth);
      if (isNaN(mag) || isNaN(lat) || isNaN(lon)) continue;

      const originTime = item.origin_time || item.created_at;
      const parsedTime = Date.parse(originTime);

      quakes.push({
        id: item.id ? `ncs-${item.id}` : `ncs-${originTime}-${lat}-${lon}`,
        magnitude: mag,
        time: isNaN(parsedTime) ? new Date().toISOString() : new Date(parsedTime).toISOString(),
        latitude: lat,
        longitude: lon,
        depth: isNaN(depth) ? 0 : depth,
        region: item.region || item.country || '',
        location: item.location || '',
        type: item.type || 'Reviewed',
        source: 'NCS',
      });
    } catch {
      // Skip invalid JSON
    }
  }

  if (quakes.length > 0) return quakes;

  // Method 2: Fallback to table parsing if data-json wasn't found
  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    const cells = [];
    let m;
    const cellRx = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    while ((m = cellRx.exec(row)) !== null) {
      cells.push(m[1].replace(/<[^>]*>/g, '').trim());
    }

    if (cells.length < 7) continue;

    const mag = parseFloat(cells[0]);
    const time = cells[1];
    const lat = parseFloat(cells[2]);
    const lon = parseFloat(cells[3]);
    const depth = parseFloat(cells[4]);
    const region = cells[5];
    const location = cells.length >= 7 ? cells[6] : '';
    const type = cells.length >= 8 ? cells[7] : 'Reviewed';

    if (isNaN(mag) || isNaN(lat) || isNaN(lon)) continue;

    const parsed = Date.parse(time);
    if (isNaN(parsed)) continue;

    quakes.push({
      id: `ncs-${time}-${lat}-${lon}`,
      magnitude: mag,
      time: new Date(parsed).toISOString(),
      latitude: lat,
      longitude: lon,
      depth: isNaN(depth) ? 0 : depth,
      region: region,
      location: location,
      type: type,
      source: 'NCS',
    });
  }

  return quakes;
}

/**
 * Fallback: fetch from USGS FDSN API (always available, GeoJSON format).
 * Gets all earthquakes in the India bounding box for the last 30 days.
 */
async function fetchUSGS(log) {
  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];

    const url = `${USGS_URL}?format=geojson&starttime=${start}&endtime=${end}&minlatitude=${MIN_LAT}&maxlatitude=${MAX_LAT}&minlongitude=${MIN_LON}&maxlongitude=${MAX_LON}&orderby=time&limit=500`;

    log(`USGS: Fetching ${url}`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'JalDrishti/1.0 (independent disaster dashboard)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
    const data = await res.json();

    if (!data.features || !Array.isArray(data.features)) {
      throw new Error('Invalid USGS response');
    }

    const quakes = data.features.map((f) => {
      const p = f.properties;
      const [lon, lat, depthKm] = f.geometry.coordinates;
      return {
        id: f.id || `usgs-${p.time}-${lat}-${lon}`,
        magnitude: p.mag,
        time: new Date(p.time).toISOString(),
        latitude: lat,
        longitude: lon,
        depth: depthKm ?? 0,
        region: p.place || '',
        location: p.place || '',
        type: p.type || 'earthquake',
        source: 'USGS',
        url: p.url || null,
        felt: p.felt || null,
        tsunami: p.tsunami || 0,
        significance: p.sig || 0,
      };
    });

    log(`USGS: Got ${quakes.length} earthquakes`);
    return quakes;
  } catch (e) {
    log(`USGS fetch failed: ${e.message}`);
    return null;
  }
}

/**
 * Creates the earthquake data service with caching and auto-refresh.
 */
export function createEarthquakeService({ log = () => {} } = {}) {
  let cached = null; // { generatedAt, quakes, source }
  let lastRefreshOk = null;
  let running = null;

  async function refreshOnce() {
    // Try NCS first, fall back to USGS
    let quakes = await fetchNCS(log);
    let source = 'NCS';

    if (!quakes || quakes.length === 0) {
      quakes = await fetchUSGS(log);
      source = 'USGS';
    }

    if (!quakes || quakes.length === 0) {
      lastRefreshOk = false;
      log('Both NCS and USGS failed');
      return;
    }

    // Filter to last 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = quakes.filter((q) => new Date(q.time).getTime() >= cutoff);

    // Sort by time (newest first)
    recent.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    cached = {
      generatedAt: new Date().toISOString(),
      quakes: recent,
      source,
      totalCount: recent.length,
    };
    lastRefreshOk = true;
    log(`Earthquake data refreshed: ${recent.length} quakes from ${source}`);
  }

  function refresh() {
    if (!running) {
      running = refreshOnce()
        .catch((e) => { lastRefreshOk = false; log('Earthquake refresh error:', e.message); })
        .finally(() => { running = null; });
    }
    return running;
  }

  function getPayload() {
    if (!cached) return null;

    // Compute stats
    const quakes = cached.quakes;
    const magnitudes = quakes.map((q) => q.magnitude).filter((m) => !isNaN(m));
    const maxMag = magnitudes.length > 0 ? Math.max(...magnitudes) : 0;
    const avgMag = magnitudes.length > 0 ? (magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length) : 0;

    // Count by magnitude ranges
    const byMagnitude = {
      minor: quakes.filter((q) => q.magnitude < 3).length,     // < 3
      light: quakes.filter((q) => q.magnitude >= 3 && q.magnitude < 4).length, // 3-4
      moderate: quakes.filter((q) => q.magnitude >= 4 && q.magnitude < 5).length, // 4-5
      strong: quakes.filter((q) => q.magnitude >= 5 && q.magnitude < 6).length,   // 5-6
      major: quakes.filter((q) => q.magnitude >= 6).length,     // 6+
    };

    return {
      generatedAt: cached.generatedAt,
      source: cached.source,
      ok: lastRefreshOk === true,
      totalCount: quakes.length,
      maxMagnitude: Math.round(maxMag * 10) / 10,
      avgMagnitude: Math.round(avgMag * 10) / 10,
      byMagnitude,
      quakes,
    };
  }

  return { refresh, getPayload };
}
