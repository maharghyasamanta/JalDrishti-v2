// Minimal, dependency-free XML parser sufficient for RSS and CAP 1.2 documents.
// Namespace prefixes are stripped from element names (cap:info -> info).
// DOCTYPE declarations are skipped and custom entities are never expanded.

const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, e) ? ENTITIES[e] : m;
  });
}

const local = (n) => n.slice(n.indexOf(':') + 1);

/** Parse XML text into { name, attrs, children, text } nodes. Throws on malformed input. */
export function parseXml(xml) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('Empty XML document');
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let last = 0;
  const addText = (raw) => { if (raw) stack[stack.length - 1].text += decodeEntities(raw); };

  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(xml)) !== null) {
    addText(xml.slice(last, m.index));
    last = TOKEN.lastIndex;
    if (m[1] !== undefined) { stack[stack.length - 1].text += m[1]; continue; } // CDATA
    if (m[2] !== undefined) { // closing tag
      const open = stack.pop();
      if (!open || open === root || open.name !== local(m[2])) throw new Error(`Mismatched closing tag </${m[2]}>`);
      continue;
    }
    if (m[3] !== undefined) { // opening or self-closing tag
      const attrs = {};
      ATTR.lastIndex = 0;
      let a;
      while ((a = ATTR.exec(m[4] || '')) !== null) attrs[local(a[1])] = decodeEntities(a[2] ?? a[3] ?? '');
      const el = { name: local(m[3]), attrs, children: [], text: '' };
      stack[stack.length - 1].children.push(el);
      if (!m[5]) stack.push(el);
    }
    // comments, processing instructions and DOCTYPE fall through and are ignored
  }
  addText(xml.slice(last));
  if (stack.length !== 1) throw new Error('Unclosed XML element');
  if (root.children.length !== 1) throw new Error('XML document has no single root element');
  return root.children[0];
}

export const childrenOf = (el, name) => (el ? el.children.filter((c) => c.name === name) : []);
export const childOf = (el, name) => childrenOf(el, name)[0];
export const textOf = (el, name) => {
  const c = name ? childOf(el, name) : el;
  return c ? c.text.trim() : '';
};
