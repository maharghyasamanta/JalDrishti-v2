import { parseXml, childOf, childrenOf, textOf } from './xml.js';

/** Parse the SACHET RSS feed. Throws unless the document is a real RSS feed (so an HTML error page is never an "all clear"). */
export function parseRss(xml) {
  const root = parseXml(xml);
  if (root.name !== 'rss' || !childOf(root, 'channel')) throw new Error('Upstream response is not an RSS feed');
  const channel = childOf(root, 'channel');
  return childrenOf(channel, 'item').map((it) => {
    const link = textOf(it, 'link');
    let guid = textOf(it, 'guid');
    if (!guid && link) {
      try { guid = new URL(link).searchParams.get('identifier') || ''; } catch { /* ignore */ }
    }
    return { guid, link, title: textOf(it, 'title'), pubDate: textOf(it, 'pubDate'), author: textOf(it, 'author') };
  });
}
