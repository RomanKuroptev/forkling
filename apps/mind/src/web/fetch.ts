import { hostRule, isAllowed, USER_AGENT, type HostRule, type ReadVerb } from './allowlist.ts'
import { robotsAllows } from './robots.ts'

/** The most one response may be, in bytes (spec 6.2). */
export const MAX_BYTES = 2 * 1024 * 1024
export const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 5
const PAUSE_MS = 24 * 3_600_000
/** How long a host's robots.txt is kept before it is read again. */
const ROBOTS_MS = 24 * 3_600_000

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>

export type WebErrorCode = 'not-allowed' | 'redirect-not-allowed' | 'too-many-redirects' | 'paused' | 'timeout' | 'network' | 'too-big' | 'http' | 'robots'

export class WebError extends Error {
  readonly code: WebErrorCode
  readonly status: number | undefined
  // Plain fields, not parameter properties: Node runs this file by stripping types, and that syntax cannot be stripped.
  constructor(code: WebErrorCode, message: string, status?: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** One request or refusal, for the tick log and for checking that nothing went outside the list. */
export interface FetchLine {
  at: string
  url: string
  host: string
  /**
   * `ok`, `redirect`, `not-allowed`, `paused`, `timeout`, `network`, `too-big`, `http-<status>`, `robots-disallowed` (the
   * host's robots.txt says no) or `robots-unreachable` (its robots.txt could not be read).
   */
  outcome: string
}

export interface FetcherOptions {
  /** Who is reading (default `wander`): a host is only fetched for a verb it allows, at every step of a redirect too. */
  verb?: ReadVerb
  fetchImpl?: FetchImpl
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** Hosts an earlier tick paused, with the time each pause ends. */
  paused?: Record<string, string>
  /**
   * An `Authorization` header for a host, such as a token that lifts GitHub's limit from 60 requests an hour. It goes to
   * that host only: a redirect to another host is a new request with the headers of that host.
   */
  authorization?: Record<string, string>
  /**
   * Hosts a source trial may read that are not on the allowlist (spec 6.5), each with its own gap. Only the trial CLI passes
   * these; the mind never does, so for it the allowlist stays the whole list.
   */
  trialHosts?: readonly HostRule[]
}

export interface Got {
  bytes: Uint8Array
  contentType: string
  /** Where the answer came from after any redirects. */
  url: string
}

export interface Fetcher {
  text(url: string, options?: { accept?: string }): Promise<string>
  json(url: string): Promise<unknown>
  bytes(url: string, options?: { accept?: string }): Promise<Got>
  /** Hosts paused right now, with when each pause ends. */
  pausedHosts(): Record<string, string>
  readonly log: FetchLine[]
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

async function readCapped(res: Response, url: string): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new WebError('too-big', `${url} is over 2 MB`)
  if (!res.body) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_BYTES) {
      await reader.cancel()
      throw new WebError('too-big', `${url} is over 2 MB`)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

/**
 * The only way the mind reads the web. Read-only GETs, allowed hosts only, redirects followed one by one and only to allowed
 * hosts, a 10 second timeout, a 2 MB cap, each host's own rate, and a 24 hour pause for a host that answers 429 or 403 with
 * no retry. Before the first request to a host it reads the host's robots.txt (kept for 24 hours, the same User-Agent, the
 * host's gap) and refuses a path it disallows. A host with no robots.txt (404) sets no rules; one whose robots.txt could not
 * be read is not read, as in the source trials (`mayReadHost`), and is asked again next time. Every request and every
 * refusal goes in `log`.
 */
export function createFetcher(options: FetcherOptions = {}): Fetcher {
  const fetchImpl: FetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init))
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const pausedUntil = new Map<string, number>(Object.entries(options.paused ?? {}).map(([host, iso]) => [host, Date.parse(iso)]))
  const lastAt = new Map<string, number>()
  const log: FetchLine[] = []
  const trialRule = (url: string): HostRule | undefined => {
    try {
      const u = new URL(url)
      if (u.protocol !== 'https:' || u.port !== '' || u.username !== '' || u.password !== '') return undefined
      return options.trialHosts?.find((r) => r.host === u.hostname)
    } catch {
      return undefined
    }
  }
  const ruleOf = (url: string): HostRule | undefined => trialRule(url) ?? hostRule(hostOf(url))
  /** Each host's robots.txt (`''` for none) and when it was read. */
  const robots = new Map<string, { txt: string; at: number }>()
  const reading = new Map<string, Promise<string | null>>()

  const note = (url: string, outcome: string) => log.push({ at: new Date(now()).toISOString(), url, host: hostOf(url), outcome })

  function pausedNow(host: string): boolean {
    const until = pausedUntil.get(host)
    if (until === undefined) return false
    if (until <= now()) {
      pausedUntil.delete(host)
      return false
    }
    return true
  }

  const isRobotsTxt = (url: string): boolean => {
    try {
      return new URL(url).pathname === '/robots.txt'
    } catch {
      return false
    }
  }

  /** The host's robots.txt (`''` when it has none), or null when it could not be read. */
  function robotsOf(host: string): Promise<string | null> {
    const kept = robots.get(host)
    if (kept && now() - kept.at < ROBOTS_MS) return Promise.resolve(kept.txt)
    let pending = reading.get(host)
    if (!pending) {
      pending = get(`https://${host}/robots.txt`, 'text/plain')
        .then(() => robots.get(host)?.txt ?? null)
        .catch((error) => (error instanceof WebError && error.status === 404 ? '' : null))
        .finally(() => reading.delete(host))
      reading.set(host, pending)
    }
    return pending
  }

  async function get(start: string, accept: string): Promise<{ bytes: Uint8Array; res: Response; url: string }> {
    // A robots.txt asked for (by robotsOf, or by a trial) is fetched plainly and kept for its host.
    const robotsHost = isRobotsTxt(start) ? hostOf(start) : null
    try {
      const got = await hops(start, accept)
      if (robotsHost) robots.set(robotsHost, { txt: new TextDecoder().decode(got.bytes), at: now() })
      return got
    } catch (error) {
      if (robotsHost && error instanceof WebError && error.status === 404) robots.set(robotsHost, { txt: '', at: now() })
      throw error
    }
  }

  async function hops(start: string, accept: string): Promise<{ bytes: Uint8Array; res: Response; url: string }> {
    let url = start
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const host = hostOf(url)
      if (!isAllowed(url, options.verb) && !trialRule(url)) {
        note(url, 'not-allowed')
        throw new WebError(hop === 0 ? 'not-allowed' : 'redirect-not-allowed', `${url} is not on the allowlist`)
      }
      if (pausedNow(host)) {
        note(url, 'paused')
        throw new WebError('paused', `${host} is paused until ${new Date(pausedUntil.get(host)!).toISOString()}`)
      }
      if (!isRobotsTxt(url)) {
        const txt = await robotsOf(host)
        if (txt === null) {
          note(url, 'robots-unreachable')
          throw new WebError('robots', `the robots.txt of ${host} could not be read, so ${url} is not read`)
        }
        const u = new URL(url)
        if (!robotsAllows(txt, `${u.pathname}${u.search}`)) {
          note(url, 'robots-disallowed')
          throw new WebError('robots', `the robots.txt of ${host} does not allow ${u.pathname}`)
        }
        if (pausedNow(host)) {
          note(url, 'paused')
          throw new WebError('paused', `${host} is paused until ${new Date(pausedUntil.get(host)!).toISOString()}`)
        }
      }
      const wait = (lastAt.get(host) ?? -Infinity) + ruleOf(url)!.gapMs - now()
      if (wait > 0) await sleep(wait)
      lastAt.set(host, now())

      let res: Response
      try {
        res = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': USER_AGENT, Accept: accept, ...(options.authorization?.[host] ? { Authorization: options.authorization[host] } : {}) } })
      } catch (error) {
        const name = (error as Error)?.name
        const timedOut = name === 'TimeoutError' || name === 'AbortError'
        note(url, timedOut ? 'timeout' : 'network')
        throw new WebError(timedOut ? 'timeout' : 'network', `${url}: ${timedOut ? 'timed out' : (error as Error).message}`)
      }

      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        note(url, 'redirect')
        try {
          url = new URL(res.headers.get('location')!, url).toString()
        } catch {
          throw new WebError('redirect-not-allowed', `${url} redirected to something that is not a URL`)
        }
        continue
      }
      if (res.status === 429 || res.status === 403) pausedUntil.set(host, now() + PAUSE_MS)
      if (!res.ok) {
        note(url, `http-${res.status}`)
        throw new WebError('http', `${res.status} from ${host}`, res.status)
      }
      try {
        const bytes = await readCapped(res, url)
        note(url, 'ok')
        return { bytes, res, url }
      } catch (error) {
        if (error instanceof WebError) note(url, error.code)
        throw error
      }
    }
    throw new WebError('too-many-redirects', `${start} redirected more than ${MAX_REDIRECTS} times`)
  }

  return {
    log,
    pausedHosts: () => Object.fromEntries([...pausedUntil].filter(([host]) => pausedNow(host)).map(([host, until]) => [host, new Date(until).toISOString()])),
    async text(url, o = {}) {
      return new TextDecoder().decode((await get(url, o.accept ?? '*/*')).bytes)
    },
    async json(url) {
      return JSON.parse(new TextDecoder().decode((await get(url, 'application/json')).bytes))
    },
    async bytes(url, o = {}) {
      const got = await get(url, o.accept ?? '*/*')
      return { bytes: got.bytes, contentType: got.res.headers.get('content-type') ?? '', url: got.url }
    },
  }
}
