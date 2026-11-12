/**
 * The sites Merge may read (spec 6.1). Fixed in the engine: adding a site is an engine change Roman reviews, and only
 * after its source trial (spec 6.5). A host that fails its trial is taken out of this list.
 *
 * A `page` source is read as text with links, a `record` source as short records, an `image` host only serves the pictures
 * of the others. `voices` sites may only give quote souvenirs (spec 6.7).
 */
export type HostKind = 'page' | 'record' | 'image'
export type Tier = 'reference' | 'voices'
/** Who is reading: a wander trip, a tinker step (the library manuals) or a meme (spec 6.1, 7.7). */
export type ReadVerb = 'wander' | 'tinker' | 'meme'

export interface HostRule {
  host: string
  kind: HostKind
  tier: Tier
  /** The least time between two requests to the host. */
  gapMs: number
  /** The verbs that may read it. A host with none named is for wander only. */
  verbs?: readonly ReadVerb[]
}

const allowsVerb = (rule: HostRule, verb: ReadVerb) => (rule.verbs ? rule.verbs.includes(verb) : verb === 'wander')

/** Wikimedia sites 1 request every 2 seconds, artic.edu 30 a minute (the same thing), any other host 1 a second. */
const SLOW = 2000
const FAST = 1000

// The hosts of W2 (Roman, 12 November 2026, after the source trials). Left out for now, with the reason:
//   lobste.rs and hacker-news.firebaseio.com: their robots.txt disallows us (a voices host can come back as its own trial, e.g. hn.algolia.com).
//   api.nasa.gov: needs a key and a better adapter.
// The library manuals (W4) are on the list for tinker only: a wander is refused them, and they were trialled in W2.
// Meme formats (api.imgflip.com) came back after a second look (Roman, 12 November 2026): a feed of starting points, and a record a meme may cite.
// Wikipedia, the Esolang wiki and Commons are read through their `/wiki/` pages: their robots.txt allows those and disallows the API.
export const ALLOWLIST: readonly HostRule[] = [
  { host: 'en.wikipedia.org', kind: 'page', tier: 'reference', gapMs: SLOW },
  { host: 'esolangs.org', kind: 'page', tier: 'reference', gapMs: SLOW },
  { host: 'api.github.com', kind: 'record', tier: 'reference', gapMs: FAST },
  { host: 'commons.wikimedia.org', kind: 'record', tier: 'reference', gapMs: SLOW },
  { host: 'upload.wikimedia.org', kind: 'image', tier: 'reference', gapMs: SLOW },
  { host: 'api.artic.edu', kind: 'record', tier: 'reference', gapMs: SLOW },
  { host: 'www.artic.edu', kind: 'image', tier: 'reference', gapMs: SLOW },
  // The pulse of memes (spec 6.1): the most-captioned formats of the last 30 days, and their template pictures, which a look may see
  // but a meme may never embed (the work check refuses a picture of any kind in a meme).
  { host: 'api.imgflip.com', kind: 'record', tier: 'voices', gapMs: FAST, verbs: ['wander', 'meme'] },
  { host: 'i.imgflip.com', kind: 'image', tier: 'voices', gapMs: FAST, verbs: ['wander', 'meme'] },
  // The library manuals, for tinker only (spec 6.1): what Merge reads about the tool it is making something with.
  { host: 'p5js.org', kind: 'page', tier: 'reference', gapMs: FAST, verbs: ['tinker'] },
  { host: 'tonejs.github.io', kind: 'page', tier: 'reference', gapMs: FAST, verbs: ['tinker'] },
  { host: 'threejs.org', kind: 'page', tier: 'reference', gapMs: FAST, verbs: ['tinker'] },
  { host: 'developer.mozilla.org', kind: 'page', tier: 'reference', gapMs: FAST, verbs: ['tinker'] },
]

/** The project's name and where to find it. A contact address that is a repo, never anyone's email. */
export const USER_AGENT = 'forkling/0.10 (read-only reader for an autonomous AI; +https://github.com/RomanKuroptev/forkling)'

export function hostRule(host: string): HostRule | undefined {
  return ALLOWLIST.find((rule) => rule.host === host)
}

/** A URL Merge may fetch for this verb (a wander unless said otherwise): https, no port, no login, and a host on the list exactly that the verb may read. */
export function isAllowed(url: string, verb: ReadVerb = 'wander'): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  const rule = hostRule(u.hostname)
  return u.protocol === 'https:' && u.port === '' && u.username === '' && u.password === '' && rule !== undefined && allowsVerb(rule, verb)
}

/**
 * Public pages that name an item on a site the code does not read directly: a GitHub repository is read through its API
 * (`api.github.com`) and an Imgflip format through the ranking (`api.imgflip.com`).
 * Their page URLs are what a trail and a souvenir cite, and what a link can point at.
 */
export const NAMED_BY_PAGE: readonly string[] = ['github.com', 'imgflip.com']

/** A URL the mind may be offered and may read: an allowed URL, or the page URL of an item an allowed API gives. */
export function isReadable(url: string): boolean {
  if (isAllowed(url)) return true
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.port === '' && u.username === '' && u.password === '' && NAMED_BY_PAGE.includes(u.hostname)
  } catch {
    return false
  }
}
