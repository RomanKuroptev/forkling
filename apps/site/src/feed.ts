import { esc } from './md.ts'

/** One entry of the feed (spec 8): a work shelved or a diary entry. Places join the feed with W5. */
export interface FeedItem {
  title: string
  /** Path from the site root, like `workshop/a-lamp.html`. */
  path: string
  at: string
  description: string
}

const MAX_ITEMS = 50

/**
 * `/feed.xml`: RSS 2.0, newest first, the 50 newest. Links are absolute when the site address is known (an RSS reader needs
 * that) and relative when it is not. Everything the forkling wrote is escaped, and nothing in it depends on the clock, so the
 * same world gives the same feed.
 */
export function renderFeed(o: { name: string; items: readonly FeedItem[]; baseUrl?: string | undefined }): string {
  const base = o.baseUrl ? (o.baseUrl.endsWith('/') ? o.baseUrl : `${o.baseUrl}/`) : ''
  const items = [...o.items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_ITEMS)
  const newest = items[0]?.at ?? '1970-01-01T00:00:00Z'
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${esc(o.name)}</title>
<link>${esc(base || './')}</link>
<description>${esc(`What ${o.name} makes and writes.`)}</description>
<language>en</language>
<lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>
${items.map((i) => `<item>
<title>${esc(i.title)}</title>
<link>${esc(base + i.path)}</link>
<guid isPermaLink="${base ? 'true' : 'false'}">${esc(base + i.path)}</guid>
<pubDate>${new Date(i.at).toUTCString()}</pubDate>
<description>${esc(i.description)}</description>
</item>`).join('\n')}
</channel>
</rss>
`
}
