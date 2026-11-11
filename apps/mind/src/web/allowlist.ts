/**
 * The sites Merge may read (spec 6.1). Fixed in the engine: adding a site is an engine change Roman reviews, and only
 * after its source trial (spec 6.5). A host that fails its trial is taken out of this list.
 *
 * A `page` source is read as text with links, a `record` source as short records, an `image` host only serves the pictures
 * of the others. `voices` sites may only give quote souvenirs (spec 6.7).
 */
export type HostKind = 'page' | 'record' | 'image'
export type Tier = 'reference' | 'voices'

export interface HostRule {
  host: string
  kind: HostKind
  tier: Tier
  /** The least time between two requests to the host. */
  gapMs: number
}

/** Wikimedia sites 1 request every 2 seconds, artic.edu 30 a minute (the same thing), any other host 1 a second. */
const SLOW = 2000
const FAST = 1000

export const ALLOWLIST: readonly HostRule[] = [
  { host: 'en.wikipedia.org', kind: 'page', tier: 'reference', gapMs: SLOW },
  { host: 'esolangs.org', kind: 'page', tier: 'reference', gapMs: SLOW },
  { host: 'p5js.org', kind: 'page', tier: 'reference', gapMs: FAST },
  { host: 'tonejs.github.io', kind: 'page', tier: 'reference', gapMs: FAST },
  { host: 'threejs.org', kind: 'page', tier: 'reference', gapMs: FAST },
  { host: 'developer.mozilla.org', kind: 'page', tier: 'reference', gapMs: FAST },
  { host: 'hacker-news.firebaseio.com', kind: 'page', tier: 'voices', gapMs: FAST },
  { host: 'lobste.rs', kind: 'page', tier: 'voices', gapMs: FAST },
  { host: 'api.github.com', kind: 'record', tier: 'reference', gapMs: FAST },
  { host: 'api.imgflip.com', kind: 'record', tier: 'voices', gapMs: FAST },
  { host: 'i.imgflip.com', kind: 'image', tier: 'voices', gapMs: FAST },
  { host: 'commons.wikimedia.org', kind: 'image', tier: 'reference', gapMs: SLOW },
  { host: 'upload.wikimedia.org', kind: 'image', tier: 'reference', gapMs: SLOW },
  { host: 'api.artic.edu', kind: 'record', tier: 'reference', gapMs: SLOW },
  { host: 'www.artic.edu', kind: 'image', tier: 'reference', gapMs: SLOW },
  { host: 'api.nasa.gov', kind: 'record', tier: 'reference', gapMs: FAST },
  { host: 'apod.nasa.gov', kind: 'image', tier: 'reference', gapMs: FAST },
]

/** The project's name and where to find it. A contact address that is a repo, never anyone's email. */
export const USER_AGENT = 'forkling/0.10 (read-only reader for an autonomous AI; +https://github.com/RomanKuroptev/forkling)'

export function hostRule(host: string): HostRule | undefined {
  return ALLOWLIST.find((rule) => rule.host === host)
}

/** A URL Merge may fetch: https, no port, no login, and a host on the list exactly. */
export function isAllowed(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  return u.protocol === 'https:' && u.port === '' && u.username === '' && u.password === '' && hostRule(u.hostname) !== undefined
}
