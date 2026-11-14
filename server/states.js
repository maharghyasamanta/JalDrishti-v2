// State / UT attribution for free-text CAP area descriptions.
//
// Rules:
//  - Full state/UT names are matched as WHOLE WORDS, case-insensitively, longest name first,
//    so "Jammu and Kashmir" is one name and "Goalpara" never matches "Goa".
//  - Districts come from a name -> [states] index. A district resolves to a state only if it
//    maps to exactly one state, or one of its states is also named in the same alert.
//    Otherwise it is reported as ambiguous. We never guess.

export const STATE_NAMES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
];

// Alternate spellings (lower case, "&" already normalised to "and") -> canonical name.
const ALIASES = {
  'orissa': 'Odisha',
  'pondicherry': 'Puducherry',
  'nct of delhi': 'Delhi',
  'new delhi': 'Delhi',
  'andaman and nicobar': 'Andaman and Nicobar Islands',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => s.replace(/&/g, ' and ').replace(/\s+/g, ' ');

/** Build one alternation regex, longest names first, whole-word, case-insensitive. */
function buildMatcher(names) {
  const sorted = [...new Set(names)].sort((a, b) => b.length - a.length || a.localeCompare(b));
  if (!sorted.length) return null;
  const body = sorted.map((n) => escapeRe(n).replace(/ /g, '\\s+')).join('|');
  // Unicode-aware "word" boundary: not preceded/followed by a letter or digit.
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, 'giu');
}

const STATE_LOOKUP = new Map([
  ...STATE_NAMES.map((s) => [s.toLowerCase(), s]),
  ...Object.entries(ALIASES),
]);
const STATE_RE = buildMatcher([...STATE_LOOKUP.keys()]);

const districtMatcherCache = new WeakMap();
function districtMatcher(index) {
  let m = districtMatcherCache.get(index);
  if (!m) { m = buildMatcher(Object.keys(index)); districtMatcherCache.set(index, m); }
  return m;
}

/** Find whole-word state names. Returns { states: string[], rest: string } where rest has the matches blanked out. */
export function findStateNames(text) {
  const t = norm(text);
  const found = new Set();
  const rest = t.replace(STATE_RE, (m) => {
    const key = m.toLowerCase().replace(/\s+/g, ' ');
    const s = STATE_LOOKUP.get(key);
    if (s) found.add(s);
    return ' '.repeat(m.length);
  });
  return { states: [...found], rest };
}

/** Find district names in text (state names blanked first). Returns lower-case index keys. */
export function findDistricts(restText, index) {
  const re = districtMatcher(index);
  if (!re) return [];
  const out = new Set();
  for (const m of restText.matchAll(re)) out.add(m[0].toLowerCase().replace(/\s+/g, ' '));
  return [...out];
}

/**
 * Resolve the states for an alert.
 * @param {string[]} areaTexts  one entry per <area> (areaDesc and any Latin-script geocode text)
 * @param {Record<string,string[]>} index  district (lower case) -> states
 * @returns {{ states: string[], unresolved: boolean, unresolvedAreas: string[] }}
 */
export function resolveStates(areaTexts, index) {
  const areas = areaTexts.map((t) => (t || '').trim()).filter(Boolean);
  if (!areas.length) return { states: [], unresolved: true, unresolvedAreas: [] };

  const parsed = areas.map((text) => findStateNames(text));
  const explicit = new Set(parsed.flatMap((p) => p.states)); // state names present anywhere in the alert

  const states = new Set(explicit);
  const unresolvedAreas = [];

  areas.forEach((text, i) => {
    const own = new Set(parsed[i].states);
    let ambiguous = [];
    for (const d of findDistricts(parsed[i].rest, index)) {
      const candidates = index[d] || [];
      if (candidates.length === 1) { own.add(candidates[0]); states.add(candidates[0]); continue; }
      const overlap = candidates.filter((s) => explicit.has(s));
      if (overlap.length) overlap.forEach((s) => { own.add(s); states.add(s); });
      else ambiguous.push(d);
    }
    if (ambiguous.length) unresolvedAreas.push(...ambiguous.map((d) => d.replace(/\b\p{L}/gu, (c) => c.toUpperCase())));
    else if (own.size === 0) unresolvedAreas.push(text);
  });

  return {
    states: [...states].sort(),
    unresolved: states.size === 0 || unresolvedAreas.length > 0,
    unresolvedAreas,
  };
}
