// CAP 1.2 parsing, filtering and normalisation (English only).
import { childrenOf, parseXml, textOf } from './xml.js';
import { findStateNames, resolveStates, STATE_CODES } from './states.js';

/** Coastal hazards checked first; waterRelated stays true so ALERT_SCOPE=water keeps them. */
export const COASTAL_HAZARD_KEYWORDS = [
  'high wave\\w*',
  'heavy wave\\w*',
  'rough sea\\w*',
  'very rough sea\\w*',
  'swell\\w*',
  'high tide\\w*',
  'tidal\\w*',
  'storm surge\\w*',
  'sea (?:surge|erosion|condition|state)\\w*',
  'coastal (?:flood\\w*|inundation|erosion|hazard\\w*)',
  'tsunami\\w*',
  'kallakkadal',
  'fisherm[ae]n',
];

/** Inland water-related hazards (cyclones remain in 'water'). */
export const WATER_HAZARD_KEYWORDS = [
  'flood\\w*',
  'flash flood\\w*',
  'heavy rain\\w*',
  'very heavy rain\\w*',
  'extremely heavy rain\\w*',
  'cloud\\s?burst\\w*',
  'landslide\\w*',
  'cyclon\\w*',
  'dam (?:water )?release\\w*',
  'reservoir release\\w*',
  'release of water from (?:the )?(?:dam|reservoir)',
];

const wordBounded = (patterns) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${patterns.join('|')})(?![\\p{L}\\p{N}])`, 'iu');

const COASTAL_RE = wordBounded(COASTAL_HAZARD_KEYWORDS);
const WATER_RE = wordBounded(WATER_HAZARD_KEYWORDS);
// Used strictly for internal hazard classification when English <info> uses generic "SDMA Alert"; text is never stored or displayed.
const REGIONAL_COASTAL_RE = /(?:సముద్ర|అలలు|మత్స్యకారులు|బీచ్|తీర|लहर|मछुआर|तट|मच्छीमार|सागर|அலை|கடல்|மீனவ|തിരമാല|കടൽ|മത്സ്യ|ಅಲೆ|ಸಮುದ್ರ|ಮೀನುಗಾರ|મોજા|દરિયા|માછીમાર|ঢেউ|সমুদ্র|মৎস্যজীবী|ଅଶାନ୍ତ|ସମୁଦ୍ର|ମତ୍ସ୍ୟଜୀବୀ)/u;
const SACHET_POLYGON_URL_RE = /^https:\/\/sachet\.ndma\.gov\.in\/cap_public_website\/FetchPolygonXMLFile\?[^\s<>]+$/i;

/** Other hazard groups, checked in strict precedence: coastal -> water -> storm -> heat -> cold -> other. */
export const HAZARD_GROUPS = {
  storm: ['thunder\\w*', 'lightning\\w*', 'squall\\w*', 'hail\\w*', 'dust\\s?(?:storm|raising)\\w*', 'gale\\w*', 'strong wind\\w*', 'gusty wind\\w*', 'duststorm\\w*', 'storm\\w*', 'wind\\w*'],
  heat: ['heat\\s?wave\\w*', 'heat\\w*', 'hot (?:weather|day|condition)\\w*', 'warm night\\w*', 'high temperature\\w*'],
  cold: ['cold\\w*', 'fog\\w*', 'frost\\w*', 'snow\\w*', 'avalanche\\w*', 'low temperature\\w*', 'ground frost'],
};
const GROUP_RES = Object.entries(HAZARD_GROUPS).map(([k, list]) => [k, wordBounded(list)]);

/** 'coastal' | 'water' | 'storm' | 'heat' | 'cold' | 'other'. */
export function classifyHazard(haystack) {
  const parts = haystack.filter(Boolean);
  if (parts.some((h) => COASTAL_RE.test(h))) return 'coastal';
  if (parts.some((h) => WATER_RE.test(h))) return 'water';
  for (const [key, re] of GROUP_RES) if (parts.some((h) => re.test(h))) return key;
  return 'other';
}

export const DETAILS_IN_ORIGINAL = 'Details in original alert';
export const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

const SEVERITIES = ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'];
const NON_LATIN_LETTER = /(?!\p{Script=Latin})\p{L}/u;

const MAX_TEXT_LEN = 600;
const MAX_RING_VERTICES = 500;
const MAX_SHAPES_PER_ALERT = 20;
const MAX_ALERT_VERTICES = 1000;
const COAST_DISTANCE_KM = 60;

const inIndiaBounds = (lat, lon) =>
  Number.isFinite(lat) && Number.isFinite(lon) && lat >= 0 && lat <= 40 && lon >= 60 && lon <= 100;

const round3 = (n) => Math.round(n * 1000) / 1000;
const round2 = (n) => Math.round(n * 100) / 100;

/** English-only guard: any text containing a non-Latin letter is dropped, never displayed or translated. */
export const latinOnly = (s) => (s && !NON_LATIN_LETTER.test(s) ? s.trim() : '');

function sanitizeLongText(s, max = MAX_TEXT_LEN) {
  const clean = latinOnly(s).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const validDate = (s) => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
};

function parsePolygonText(text) {
  const tokens = (text || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return null;

  const rawPts = [];
  for (const tok of tokens) {
    const comma = tok.split(',');
    if (comma.length !== 2) return null;
    const lat = Number(comma[0]);
    const lon = Number(comma[1]);
    if (!inIndiaBounds(lat, lon)) return null;
    const pt = [round3(lat), round3(lon)];
    const prev = rawPts[rawPts.length - 1];
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) rawPts.push(pt);
  }

  let pts = rawPts;
  while (pts.length > MAX_RING_VERTICES) {
    const halved = pts.filter((_, idx) => idx % 2 === 0);
    if (halved.length < 3) break;
    pts = halved;
  }

  const first = pts[0];
  const last = pts[pts.length - 1];
  const uniqueLen = pts.length >= 2 && first[0] === last[0] && first[1] === last[1] ? pts.length - 1 : pts.length;
  if (uniqueLen < 3) return null;
  return { kind: 'polygon', coords: pts };
}

function parseCircleText(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const m = /^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)$/.exec(trimmed);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  const radiusKm = Number(m[3]);
  if (!inIndiaBounds(lat, lon)) return null;
  if (!Number.isFinite(radiusKm) || radiusKm < 0 || radiusKm > 2000) return null;
  return { kind: 'circle', lat: round3(lat), lon: round3(lon), radiusKm: round2(radiusKm) };
}

function shapeVertexCount(shape) {
  return shape.kind === 'polygon' ? shape.coords.length : 1;
}

function shapeDedupKey(shape) {
  if (shape.kind === 'circle') return `c:${shape.lat}:${shape.lon}:${shape.radiusKm}`;
  return `p:${shape.coords.map((pt) => `${pt[0]},${pt[1]}`).join(';')}`;
}

export function parseShapesFromAreas(areas) {
  const shapes = [];
  const seen = new Set();
  const pushUnique = (shape) => {
    if (!shape) return;
    const key = shapeDedupKey(shape);
    if (seen.has(key)) return;
    seen.add(key);
    shapes.push(shape);
  };

  for (const area of areas) {
    for (const polyNode of childrenOf(area, 'polygon')) {
      pushUnique(parsePolygonText(polyNode.text));
    }
    for (const circleNode of childrenOf(area, 'circle')) {
      pushUnique(parseCircleText(circleNode.text));
    }
  }

  const capped = shapes.slice(0, MAX_SHAPES_PER_ALERT);
  let total = capped.reduce((sum, s) => sum + shapeVertexCount(s), 0);
  let guard = 0;

  while (total > MAX_ALERT_VERTICES && guard < 20) {
    guard += 1;
    let changed = false;
    for (const s of capped) {
      if (s.kind !== 'polygon' || s.coords.length <= 6) continue;
      const halved = s.coords.filter((_, idx) => idx % 2 === 0);
      if (halved.length >= 3) {
        s.coords = halved;
        changed = true;
      }
    }
    total = capped.reduce((sum, s) => sum + shapeVertexCount(s), 0);
    if (!changed) break;
  }

  return capped;
}

export function parsePolygonXml(xml) {
  const root = parseXml(xml);
  return parseShapesFromAreas([root]);
}

function polygonCentroid(coords) {
  const n =
    coords.length >= 2 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
      ? coords.length - 1
      : coords.length;
  if (n <= 0) return null;
  let sumLat = 0;
  let sumLon = 0;
  for (let i = 0; i < n; i += 1) {
    sumLat += coords[i][0];
    sumLon += coords[i][1];
  }
  return [sumLat / n, sumLon / n];
}

function samplePointsForShape(shape) {
  if (shape.kind === 'circle') {
    const pts = [[shape.lat, shape.lon]];
    if (shape.radiusKm > 0) {
      const dLat = shape.radiusKm / 111.32;
      const dLon = shape.radiusKm / (111.32 * Math.max(0.1, Math.cos((shape.lat * Math.PI) / 180)));
      pts.push(
        [shape.lat + dLat, shape.lon],
        [shape.lat - dLat, shape.lon],
        [shape.lat, shape.lon + dLon],
        [shape.lat, shape.lon - dLon],
      );
    }
    return pts;
  }

  const pts = [];
  const coords = shape.coords;
  for (let i = 0; i < coords.length; i += 1) {
    const a = coords[i];
    const b = coords[(i + 1) % coords.length];
    pts.push(a);
    if (a[0] !== b[0] || a[1] !== b[1]) {
      pts.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
  }
  const c = polygonCentroid(coords);
  if (c) pts.push(c);
  return pts;
}

function centroidForShape(shape) {
  return shape.kind === 'circle' ? [shape.lat, shape.lon] : polygonCentroid(shape.coords);
}

/** "sender,identifier,sent sender2,identifier2,sent2" -> [{sender, identifier, sent}] */
export function parseReferences(text) {
  return (text || '').split(/\s+/).filter(Boolean).map((tok) => {
    const parts = tok.split(',');
    if (parts.length < 3) return { sender: '', identifier: parts[0], sent: '' };
    return { sender: parts[0], sent: parts[parts.length - 1], identifier: parts.slice(1, -1).join(',') };
  }).filter((r) => r.identifier);
}

const lang = (info) => textOf(info, 'language').toLowerCase();

/** Choose the info block: English, else the first block with no declared language, else none-English. */
export function chooseInfo(infos) {
  if (!infos.length) return { info: null, english: false };
  const en = infos.find((i) => lang(i).startsWith('en'));
  if (en) return { info: en, english: true };
  const undeclared = infos.find((i) => !lang(i));
  if (undeclared) return { info: undeclared, english: true };
  return { info: infos[0], english: false };
}

/**
 * Parse one CAP document into a raw message. Throws on malformed XML.
 * @param {string} xml
 * @param {{ id?: string, pubDate?: string, title?: string, link?: string }} rss  fallbacks from the RSS item
 */
export function parseCap(xml, rss = {}) {
  const root = parseXml(xml);
  if (root.name !== 'alert') throw new Error(`Not a CAP alert (root <${root.name}>)`);

  const allInfos = childrenOf(root, 'info');
  const { info, english } = chooseInfo(allInfos);
  const sentDate = validDate(textOf(root, 'sent')) ?? validDate(rss.pubDate);
  const expiresDate = info ? validDate(textOf(info, 'expires')) : null;

  const areas = info ? childrenOf(info, 'area') : [];
  const areaDescs = areas.map((a) => latinOnly(textOf(a, 'areaDesc'))).filter(Boolean);
  const areaCodes = areas.flatMap((a) => childrenOf(a, 'geocode').map((g) => ({
    name: textOf(g, 'valueName'), value: textOf(g, 'value'),
  }))).filter((c) => c.value);
  const shapes = parseShapesFromAreas(areas);
  const polygonUrls = info
    ? Array.from(
        new Set(
          childrenOf(info, 'parameter')
            .filter((p) => textOf(p, 'valueName').trim().toLowerCase() === 'polygon url')
            .map((p) => textOf(p, 'value').trim())
            .filter((u) => SACHET_POLYGON_URL_RE.test(u)),
        ),
      )
    : [];
  const polygonUrl = polygonUrls[0] ?? null;

  const sev = info ? textOf(info, 'severity') : '';
  const severity = SEVERITIES.find((s) => s.toLowerCase() === sev.toLowerCase()) ?? 'Unknown';

  const eventRaw = info ? textOf(info, 'event') : '';
  const headlineRaw = info ? textOf(info, 'headline') : '';
  const categories = info ? childrenOf(info, 'category').map((c) => c.text.trim()).filter(Boolean) : [];
  const description = english && info ? sanitizeLongText(textOf(info, 'description')) : '';
  const instruction = english && info ? sanitizeLongText(textOf(info, 'instruction')) : '';

  const haystack = [eventRaw, ...categories, headlineRaw];
  // Without an English block the text may be non-English; the RSS title is the only other English-looking hint.
  if (!english && rss.title) haystack.push(latinOnly(rss.title));

  let hazard = classifyHazard(haystack);
  if (hazard === 'other' && (description || instruction)) {
    hazard = classifyHazard([description, instruction]);
  }
  if (hazard === 'other') {
    const regionalHit = allInfos.some((inf) =>
      REGIONAL_COASTAL_RE.test(`${textOf(inf, 'event')} ${textOf(inf, 'headline')} ${textOf(inf, 'description')}`));
    if (regionalHit) hazard = 'coastal';
  }

  const primaryWaterOrCoastal = haystack.some((h) => h && (COASTAL_RE.test(h) || WATER_RE.test(h)));
  const waterRelated = primaryWaterOrCoastal || hazard === 'coastal' || hazard === 'water';

  const msgType = (textOf(root, 'msgType') || 'Alert').toLowerCase();
  const rootSenderRaw = latinOnly(textOf(root, 'sender'));
  const rootSender = rootSenderRaw && !rootSenderRaw.includes('@') ? rootSenderRaw : null;

  return {
    id: textOf(root, 'identifier') || rss.id || '',
    msgType,
    status: (textOf(root, 'status') || '').toLowerCase(),
    references: parseReferences(textOf(root, 'references')).map((r) => r.identifier),
    sent: sentDate ? sentDate.toISOString() : null,
    expires: expiresDate ? expiresDate.toISOString() : null,
    english,
    hasInfo: !!info,
    event: latinOnly(eventRaw) || 'Unspecified hazard',
    severity,
    headline: english ? latinOnly(headlineRaw) : '',
    description,
    instruction,
    senderName: info ? latinOnly(textOf(info, 'senderName')) || null : null,
    rootSender,
    areaDescs: english ? areaDescs : [],   // non-English area text is never kept
    areaCodes,
    shapes,
    polygonUrl,
    polygonUrls,
    waterRelated,
    hazard,
    link: rss.link || '',
  };
}

/** Effective expiry in ms; missing <expires> means sent + 24h. null when it cannot be known. */
export function effectiveExpiry(msg) {
  if (msg.expires) return Date.parse(msg.expires);
  if (msg.sent) return Date.parse(msg.sent) + DEFAULT_EXPIRY_MS;
  return null;
}

/**
 * Apply msgType semantics and expiry to parsed messages. By default every hazard type is kept;
 * pass { waterOnly: true } (or set ALERT_SCOPE=water on the server) to keep only water + coastal hazards.
 * Cancel removes the referenced alerts; Update replaces them. Cancel/Ack/Error messages are never shown.
 */
export function selectActive(messages, now = Date.now(), { waterOnly = false } = {}) {
  const superseded = new Set();
  for (const m of messages) {
    if (m.msgType === 'update' || m.msgType === 'cancel') m.references.forEach((id) => superseded.add(id));
  }
  return messages.filter((m) => {
    if (m.msgType !== 'alert' && m.msgType !== 'update') return false;
    if (['exercise', 'test', 'draft', 'system'].includes(m.status)) return false;
    if (superseded.has(m.id)) return false;
    const exp = effectiveExpiry(m);
    if (exp !== null && exp < now) return false;
    return waterOnly ? m.waterRelated : true;
  });
}

/**
 * Resolve alert state attribution in strict evidence order:
 * 'text' -> 'polygon' / 'polygon-coast' -> 'geocode' -> 'sender' -> 'none'.
 */
export function placeAlert(msg, districtIndex, geo) {
  const textInputs = msg.areaDescs?.length ? msg.areaDescs : (msg.english && msg.headline ? [msg.headline] : []);
  const textRes = resolveStates(textInputs, districtIndex);
  if (textRes.states.length > 0) {
    return {
      states: textRes.states,
      placement: 'text',
      unresolvedAreas: textRes.unresolvedAreas,
      unresolved: textRes.unresolvedAreas.length > 0,
    };
  }

  const shapes = Array.isArray(msg.shapes) ? msg.shapes : [];
  if (shapes.length > 0 && geo?.stateAtPoint) {
    const polyStates = new Set();
    for (const shape of shapes) {
      for (const pt of samplePointsForShape(shape)) {
        const hit = geo.stateAtPoint(pt[0], pt[1]);
        if (hit) polyStates.add(hit);
      }
    }
    if (polyStates.size > 0) {
      return {
        states: [...polyStates].sort(),
        placement: 'polygon',
        unresolvedAreas: [],
        unresolved: false,
      };
    }

    if (msg.hazard === 'coastal' && geo?.nearestStateWithin) {
      const coastStates = new Set();
      for (const shape of shapes) {
        const center = centroidForShape(shape);
        if (!center) continue;
        const hit = geo.nearestStateWithin(center[0], center[1], COAST_DISTANCE_KM);
        if (hit) coastStates.add(hit);
      }
      if (coastStates.size > 0) {
        return {
          states: [...coastStates].sort(),
          placement: 'polygon-coast',
          unresolvedAreas: [],
          unresolved: false,
        };
      }
    }
  }

  const areaCodes = Array.isArray(msg.areaCodes) ? msg.areaCodes : [];
  if (areaCodes.length > 0) {
    const codeStates = new Set();
    for (const entry of areaCodes) {
      const raw = String(entry?.value ?? '').trim();
      const match = /^([A-Za-z]{2})(?:$|[^A-Za-z])/.exec(raw);
      if (!match) continue;
      const prefix = match[1].toUpperCase();
      if (Object.hasOwn(STATE_CODES, prefix)) {
        codeStates.add(STATE_CODES[prefix]);
      }
    }
    if (codeStates.size > 0) {
      return {
        states: [...codeStates].sort(),
        placement: 'geocode',
        unresolvedAreas: [],
        unresolved: false,
      };
    }
  }

  const senderForPlace = msg.senderName || msg.rootSender;
  if (senderForPlace) {
    const senderRes = findStateNames(senderForPlace);
    if (senderRes.states.length > 0) {
      return {
        states: [...senderRes.states].sort(),
        placement: 'sender',
        unresolvedAreas: [],
        unresolved: false,
      };
    }
  }

  return {
    states: [],
    placement: 'none',
    unresolvedAreas: textRes.unresolvedAreas,
    unresolved: true,
  };
}

/** Normalise a selected message into the public alert shape, with spatial/text state attribution. */
export function normalizeAlert(msg, districtIndex, geo) {
  const detailsInOriginal = !msg.english || (!msg.headline && msg.areaDescs.length === 0);
  const res = placeAlert(msg, districtIndex, geo);
  return {
    id: msg.id,
    headline: msg.headline || (detailsInOriginal ? DETAILS_IN_ORIGINAL : msg.event),
    event: msg.event,
    severity: msg.severity,
    hazard: msg.hazard,
    description: msg.description || '',
    instruction: msg.instruction || '',
    areaDesc: msg.areaDescs.join('; '),
    areaCodes: msg.areaCodes,
    shapes: Array.isArray(msg.shapes) ? msg.shapes : [],
    states: res.states,
    placement: res.placement,
    unresolved: res.unresolved,
    unresolvedAreas: res.unresolvedAreas,
    sender: msg.senderName || msg.rootSender || null,
    sent: msg.sent,
    expires: msg.expires,
    msgType: msg.msgType,
    detailsInOriginal,
    link: msg.link,
  };
}
