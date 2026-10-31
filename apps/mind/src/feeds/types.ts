/** One title and short summary from a source on the internet. Untrusted text: it only ever reaches a prompt inside `<data>`. */
export interface FeedItem {
  source: string
  /** Stable and prefixed by source, like `hn:123`. Interests cite it as their origin. */
  id: string
  title: string
  summary: string
  url: string
}

/** Fetches a URL and parses the JSON. The real one has a timeout and a user agent; tests serve canned answers. */
export type GetJson = (url: string) => Promise<unknown>

/** A feed reads one source. It throws when the source is broken (so the caller can say which) and returns [] when there's nothing. */
export type Feed = (get: GetJson, nowMs: number) => Promise<FeedItem[]>

export const MAX_TITLE = 120
export const MAX_SUMMARY = 300
export const MAX_URL = 300

/** Collapses whitespace and cuts to `max` characters, ending in an ellipsis when it had to. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

export const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The tag, text and links an item may carry, forced into safe lengths. */
export function item(source: string, id: string, title: string, summary: string, url: string): FeedItem {
  return { source, id: clip(id, 80), title: clip(title, MAX_TITLE), summary: clip(summary, MAX_SUMMARY), url: clip(url, MAX_URL) }
}
