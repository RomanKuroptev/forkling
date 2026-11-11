import { hostRule, isAllowed, USER_AGENT } from './allowlist.ts'

/** The most one response may be, in bytes (spec 6.2). */
export const MAX_BYTES = 2 * 1024 * 1024
export const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 5
const PAUSE_MS = 24 * 3_600_000

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>

export type WebErrorCode = 'not-allowed' | 'redirect-not-allowed' | 'too-many-redirects' | 'paused' | 'timeout' | 'network' | 'too-big' | 'http'

export class WebError extends Error {
  constructor(
    readonly code: WebErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

/** One request or refusal, for the tick log and for checking that nothing went outside the list. */
export interface FetchLine {
  at: string
  url: string
  host: string
  /** `ok`, `redirect`, `not-allowed`, `paused`, `timeout`, `network`, `too-big` or `http-<status>`. */
  outcome: string
}

export interface FetcherOptions {
  fetchImpl?: FetchImpl
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** Hosts an earlier tick paused, with the time each pause ends. */
  paused?: Record<string, string>
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
 * no retry. Every request and every refusal goes in `log`.
 */
export function createFetcher(options: FetcherOptions = {}): Fetcher {
  const fetchImpl: FetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init))
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const pausedUntil = new Map<string, number>(Object.entries(options.paused ?? {}).map(([host, iso]) => [host, Date.parse(iso)]))
  const lastAt = new Map<string, number>()
  const log: FetchLine[] = []

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

  async function get(start: string, accept: string): Promise<{ bytes: Uint8Array; res: Response; url: string }> {
    let url = start
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const host = hostOf(url)
      if (!isAllowed(url)) {
        note(url, 'not-allowed')
        throw new WebError(hop === 0 ? 'not-allowed' : 'redirect-not-allowed', `${url} is not on the allowlist`)
      }
      if (pausedNow(host)) {
        note(url, 'paused')
        throw new WebError('paused', `${host} is paused until ${new Date(pausedUntil.get(host)!).toISOString()}`)
      }
      const wait = (lastAt.get(host) ?? -Infinity) + hostRule(host)!.gapMs - now()
      if (wait > 0) await sleep(wait)
      lastAt.set(host, now())

      let res: Response
      try {
        res = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': USER_AGENT, Accept: accept } })
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
