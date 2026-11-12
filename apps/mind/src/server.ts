import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { NowJson } from '@forkling/schema'
import type { HealthResponse } from './health-response.ts'

export interface MindServerOptions {
  /** `now.json` as the last reflex tick left it, or null before the first. */
  now: () => NowJson | null
  health: () => HealthResponse
  /** The only origin that may call the server from a browser: Merge's Pages address (spec 11.2). */
  pagesOrigin: string
}

/** The loopback port Caddy forwards to. The unit file and the Caddyfile name the same one, and a test holds them together. */
export const DEFAULT_PORT = 8787

/** The server exposes only these three (spec 11.2). */
const ROUTES: Record<string, string> = { '/now.json': 'GET', '/health': 'GET', '/notes': 'POST' }

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}

/**
 * The server on the box (spec 2.2, 11.2): `GET /now.json`, `GET /health` and `POST /notes`, and nothing else. It binds to
 * the loopback address, behind Caddy, which does the HTTPS. A browser call from any origin but Merge's own Pages address is
 * refused; a request with no origin (the watchdog, curl) is not a cross-origin one and is served. `POST /notes` says the
 * mailbox is closed until W7 builds it.
 */
export function createMindServer(opts: MindServerOptions): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    try {
      const origin = req.headers.origin
      if (origin !== undefined && origin !== opts.pagesOrigin) return send(res, 403, { error: 'origin not allowed' })
      const cors: Record<string, string> = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' }

      const path = new URL(req.url ?? '/', 'http://localhost').pathname
      const method = ROUTES[path]
      if (!method) return send(res, 404, { error: 'not found' }, cors)

      if (req.method === 'OPTIONS') {
        res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': `${method}, OPTIONS`, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' })
        return void res.end()
      }
      if (req.method !== method) return send(res, 405, { error: 'method not allowed' }, { ...cors, Allow: `${method}, OPTIONS` })

      if (path === '/now.json') {
        const now = opts.now()
        return now ? send(res, 200, now, cors) : send(res, 503, { error: 'not ready yet' }, cors)
      }
      if (path === '/health') return send(res, 200, opts.health(), cors)
      // /notes: nobody reads a note until W7, so the body is thrown away unread.
      req.resume()
      return send(res, 503, { error: 'the mailbox is closed' }, cors)
    } catch {
      // The reason stays in the server's own log, never in what a stranger is told.
      if (!res.headersSent) send(res, 500, { error: 'internal error' })
      else res.end()
    }
  })
}
