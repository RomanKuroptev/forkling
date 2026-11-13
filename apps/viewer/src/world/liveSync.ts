import { NowJson, Place } from '@forkling/schema'

/** The server's `/places.json`, or null when it does not fit: a rev, and at most 64 places that all fit the place schema. */
function readPlacesResponse(json: unknown): { rev: string; places: Place[] } | null {
  if (typeof json !== 'object' || json === null) return null
  const { rev, places } = json as { rev?: unknown; places?: unknown }
  if (typeof rev !== 'string' || rev.length > 16 || !Array.isArray(places) || places.length > 64) return null
  const parsed = places.map((p) => Place.safeParse(p))
  return parsed.every((p) => p.success) ? { rev, places: parsed.map((p) => (p as { data: Place }).data) } : null
}

export interface LiveSyncDeps {
  /** The mind server's address, or null when the world is read from GitHub alone. */
  mindUrl: string | null
  intervalMs: number
  fetch: typeof fetch
  setTimer: (run: () => void, ms: number) => unknown
  clearTimer: (id: unknown) => void
  /** The fingerprint of the places the viewer already shows. */
  knownRev: string | null
  /** The places changed on the server: show these. */
  onPlaces: (places: Place[], rev: string) => void
}

/**
 * Keeps the places current (spec 4.6): every `intervalMs` it reads the server's `now.json`, and when its `placesRev` is not the
 * one on show it reads `/places.json` and hands over the places that fit the schema. A server that is down, or an answer that
 * does not fit, leaves what is on show as it is, and the next poll tries again. Returns a function that stops it.
 */
export function startLiveSync(deps: LiveSyncDeps): () => void {
  if (!deps.mindUrl) return () => {}
  const base = deps.mindUrl.replace(/\/+$/, '')
  let known = deps.knownRev
  let stopped = false
  let timer: unknown = null

  const poll = async () => {
    try {
      const nowRes = await deps.fetch(`${base}/now.json`, { cache: 'no-store' })
      const now = NowJson.safeParse(await nowRes.json())
      if (now.success && now.data.placesRev && now.data.placesRev !== known) {
        const res = await deps.fetch(`${base}/places.json`, { cache: 'no-store' })
        const parsed = readPlacesResponse(await res.json())
        if (parsed && !stopped) {
          known = parsed.rev
          deps.onPlaces(parsed.places, parsed.rev)
        }
      }
    } catch {
      // The server is down or slow: keep what is on show.
    }
    if (!stopped) timer = deps.setTimer(() => void poll(), deps.intervalMs)
  }

  timer = deps.setTimer(() => void poll(), deps.intervalMs)
  return () => {
    stopped = true
    deps.clearTimer(timer)
  }
}

/**
 * The mind server's address: `?mind=` on the page address wins over the build's `VITE_MIND_URL`. Only https (or a plain-http
 * localhost, for trying it out) counts, so a page address cannot send the viewer somewhere it cannot trust; anything else is none.
 */
export function mindUrlFrom(param: string | null, built: string | undefined): string | null {
  for (const candidate of [param, built]) {
    if (!candidate) continue
    try {
      const url = new URL(candidate)
      const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
      if (url.protocol === 'https:' || local) return url.origin
    } catch {
      // Not an address: try the next one.
    }
  }
  return null
}
