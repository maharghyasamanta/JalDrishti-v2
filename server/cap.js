// CAP 1.2 parsing, filtering and normalisation (English only).
import { parseXml, childOf, childrenOf, textOf } from './xml.js';
import { resolveStates } from './states.js';

/** Water-related hazards we keep. Case-insensitive regex sources matched against <event>, <category> and <headline>.
 *  Edit this list to widen or narrow what the dashboard shows. */
export const WATER_HAZARD_KEYWORDS = [
  'flood\\w*',
  'flash flood\\w*',
  'heavy rain\\w*',
  'very heavy rain\\w*',
  'extremely heavy rain\\w*',
  'cloud\\s?burst\\w*',
  'landslide\\w*',
  'cyclon\\w*',
  'storm surge\\w*',
  'high wave\\w*',
  'tsunami\\w*',
  'dam (?:water )?release\\w*',
  'reservoir release\\w*',
  'release of water from (?:the )?(?:dam|reservoir)',
];
const WATER_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${WATER_HAZARD_KEYWORDS.join('|')})(?![\\p{L}\\p{N}])`, 'iu');

/** Other hazard groups, used to label alerts and to power the filter chips on the site.
 *  Water is checked first, so "Heavy rain with thunderstorm" is a water alert. */
export const HAZARD_GROUPS = {
  storm: ['thunder\\w*', 'lightning\\w*', 'squall\\w*', 'hail\\w*', 'dust\\s?(?:storm|raising)\\w*', 'gale\\w*', 'strong wind\\w*', 'gusty wind\\w*', 'duststorm\\w*', 'storm\\w*', 'wind\\w*'],
  heat: ['heat\\s?wave\\w*', 'heat\\w*', 'hot (?:weather|day|condition)\\w*', 'warm night\\w*', 'high temperature\\w*'],
  cold: ['cold\\w*', 'fog\\w*', 'frost\\w*', 'snow\\w*', 'avalanche\\w*', 'low temperature\\w*', 'ground frost'],
};
const GROUP_RES = Object.entries(HAZARD_GROUPS).map(([k, list]) => [k, new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.join('|')})(?![\\p{L}\\p{N}])`, 'iu')]);

/** 'water' | 'storm' | 'heat' | 'cold' | 'other', decided from event, category and headline. */
export function classifyHazard(haystack) {
  const parts = haystack.filter(Boolean);
  if (parts.some((h) => WATER_RE.test(h))) return 'water';
  for (const [key, re] of GROUP_RES) if (parts.some((h) => re.test(h))) return key;
  return 'other';
}

export const DETAILS_IN_ORIGINAL = 'Details in original alert';
export const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

const SEVERITIES = ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'];
const NON_LATIN_LETTER = /(?!\p{Script=Latin})\p{L}/u;

/** English-only guard: any text containing a non-Latin letter is dropped, never displayed or translated. */
export const latinOnly = (s) => (s && !NON_LATIN_LETTER.test(s) ? s.trim() : '');

const validDate = (s) => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
};

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

  const { info, english } = chooseInfo(childrenOf(root, 'info'));
  const sentDate = validDate(textOf(root, 'sent')) ?? validDate(rss.pubDate);
  const expiresDate = info ? validDate(textOf(info, 'expires')) : null;

  const areas = info ? childrenOf(info, 'area') : [];
  const areaDescs = areas.map((a) => latinOnly(textOf(a, 'areaDesc'))).filter(Boolean);
  const areaCodes = areas.flatMap((a) => childrenOf(a, 'geocode').map((g) => ({
    name: textOf(g, 'valueName'), value: textOf(g, 'value'),
  }))).filter((c) => c.value);

  const sev = info ? textOf(info, 'severity') : '';
  const severity = SEVERITIES.find((s) => s.toLowerCase() === sev.toLowerCase()) ?? 'Unknown';

  const eventRaw = info ? textOf(info, 'event') : '';
  const headlineRaw = info ? textOf(info, 'headline') : '';
  const categories = info ? childrenOf(info, 'category').map((c) => c.text.trim()).filter(Boolean) : [];

  const haystack = [eventRaw, ...categories, headlineRaw];
  // Without an English block the text may be non-English; the RSS title is the only other English-looking hint.
  if (!english && rss.title) haystack.push(latinOnly(rss.title));

  const msgType = (textOf(root, 'msgType') || 'Alert').toLowerCase();

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
    senderName: info ? latinOnly(textOf(info, 'senderName')) || null : null,
    areaDescs: english ? areaDescs : [],   // non-English area text is never kept
    areaCodes,
    waterRelated: haystack.some((h) => h && WATER_RE.test(h)),
    hazard: classifyHazard(haystack),
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
 * pass { waterOnly: true } (or set ALERT_SCOPE=water on the server) to keep only water hazards.
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

/** Normalise a selected message into the public alert shape, with state attribution. */
export function normalizeAlert(msg, districtIndex) {
  const detailsInOriginal = !msg.english || (!msg.headline && msg.areaDescs.length === 0);
  const res = resolveStates(msg.areaDescs.length ? msg.areaDescs : (msg.english ? [msg.headline] : []), districtIndex);
  return {
    id: msg.id,
    headline: msg.headline || (detailsInOriginal ? DETAILS_IN_ORIGINAL : msg.event),
    event: msg.event,
    severity: msg.severity,
    hazard: msg.hazard,
    areaDesc: msg.areaDescs.join('; '),
    areaCodes: msg.areaCodes,
    states: res.states,
    unresolved: res.unresolved,
    unresolvedAreas: res.unresolvedAreas,
    sender: msg.senderName,
    sent: msg.sent,
    expires: msg.expires,
    msgType: msg.msgType,
    detailsInOriginal,
    link: msg.link,
  };
}
