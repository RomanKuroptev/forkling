import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { NowJson, Place } from '@forkling/schema'
import type { HealthResponse } from './health-response.ts'
import { visitFromQuery, type VisitHit } from './visits.ts'

export interface MindServerOptions {
  /** `now.json` as the last reflex tick left it, or null before the first. */
  now: () => NowJson | null
  health: () => HealthResponse
  /** The places as the last tick left them, with their fingerprint, or null before the first tick. */
  places?: () => { rev: string; places: Place[] } | null
  /** The notes the world shows, for `GET /notes.json` (spec 10.1), or none while there is no mailbox to read. */
  publicNotes?: () => unknown
  /** The mailbox behind `POST /notes` (spec 10.1). Without it the server says the mailbox is closed. */
  notes?: { submit(body: unknown, ip: string): Promise<{ status: number; body: unknown }> }
  /** The only origin that may call the server from a browser: Merge's Pages address (spec 11.2). */
  pagesOrigin: string
  /** Counts the visits the viewer's poll of now.json says (issue #422): only from Merge's own page, never from a call with no origin. */
  visits?: { record(hit: VisitHit): void }
}

/** A note is up to 500 characters of text; this leaves room for the name, the token and the JSON around them. */
export const MAX_BODY_BYTES = 8 * 1024

/** The loopback port Caddy forwards to. The unit file and the Caddyfile name the same one, and a test holds them together. */
export const DEFAULT_PORT = 8787

/** The server exposes only these (spec 11.2; `/places.json` is the W5 addition and `/notes.json` the W7 one, read-only like `/now.json`). */
const ROUTES: Record<string, string> = { '/now.json': 'GET', '/health': 'GET', '/places.json': 'GET', '/notes': 'POST', '/notes.json': 'GET' }

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}

/**
 * The server on the box (spec 2.2, 11.2): `GET /now.json`, `GET /places.json`, `GET /health` and `POST /notes`, and nothing else. It binds to
 * the loopback address, behind Caddy, which does the HTTPS. A browser call from any origin but Merge's own Pages address is
 * refused; a request with no origin (the watchdog, curl) is not a cross-origin one and is served. `POST /notes` hands a JSON body of
 * at most 8 KB, and the visitor's address as Caddy saw it, to the mailbox (`notes`); with no mailbox it says the mailbox is closed.
 */
export function createMindServer(opts: MindServerOptions): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    try {
      const origin = req.headers.origin
      if (origin !== undefined && origin !== opts.pagesOrigin) return send(res, 403, { error: 'origin not allowed' })
      const cors: Record<string, string> = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' }

      const url = new URL(req.url ?? '/', 'http://localhost')
      const path = url.pathname
      const method = ROUTES[path]
      if (!method) return send(res, 404, { error: 'not found' }, cors)

      if (req.method === 'OPTIONS') {
        res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': `${method}, OPTIONS`, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' })
        return void res.end()
      }
      if (req.method !== method) return send(res, 405, { error: 'method not allowed' }, { ...cors, Allow: `${method}, OPTIONS` })

      if (path === '/now.json') {
        // A visit is counted only from the viewer on Merge's own page: counts, no address, no id (issue #422).
        const hit = origin === opts.pagesOrigin ? visitFromQuery(url.searchParams) : null
        if (hit) opts.visits?.record(hit)
        const now = opts.now()
        return now ? send(res, 200, now, cors) : send(res, 503, { error: 'not ready yet' }, cors)
      }
      if (path === '/places.json') {
        const places = opts.places?.() ?? null
        return places ? send(res, 200, places, cors) : send(res, 503, { error: 'not ready yet' }, cors)
      }
      if (path === '/notes.json') {
        const notes = opts.publicNotes?.() ?? null
        return notes ? send(res, 200, notes, cors) : send(res, 503, { error: 'not ready yet' }, cors)
      }
      if (path === '/health') return send(res, 200, opts.health(), cors)
      // /notes: a body is read only if there is a mailbox to give it to, and only up to the limit.
      if (!opts.notes) {
        req.resume()
        return send(res, 503, { ok: false, error: 'The mailbox is closed.' }, cors)
      }
      return void takeNote(req, res, opts.notes, cors)
    } catch {
      // The reason stays in the server's own log, never in what a stranger is told.
      if (!res.headersSent) send(res, 500, { error: 'internal error' })
      else res.end()
    }
  })
}

/** The address of the visitor: the last in `X-Forwarded-For`, which is the one Caddy added, not one the visitor wrote. */
function visitorAddress(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  const list = (Array.isArray(forwarded) ? forwarded.join(',') : (forwarded ?? '')).split(',').map((a) => a.trim()).filter(Boolean)
  return list.at(-1) ?? req.socket.remoteAddress ?? 'unknown'
}

async function takeNote(req: IncomingMessage, res: ServerResponse, notes: NonNullable<MindServerOptions['notes']>, cors: Record<string, string>): Promise<void> {
  try {
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
      req.resume()
      return send(res, 415, { ok: false, error: 'A note is sent as JSON.' }, cors)
    }
    const chunks: Buffer[] = []
    let size = 0
    let tooBig = false
    for await (const chunk of req) {
      size += (chunk as Buffer).length
      if (size > MAX_BODY_BYTES) tooBig = true
      else chunks.push(chunk as Buffer)
    }
    if (tooBig) return send(res, 413, { ok: false, error: 'That is too long for a note.' }, cors)
    let body: unknown
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      return send(res, 400, { ok: false, error: 'That is not a note.' }, cors)
    }
    const answer = await notes.submit(body, visitorAddress(req))
    send(res, answer.status, answer.body, cors)
  } catch {
    // The reason stays in the server's own log, never in what a stranger is told.
    if (!res.headersSent) send(res, 500, { ok: false, error: 'internal error' }, cors)
    else res.end()
  }
}
