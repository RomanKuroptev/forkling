import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize, sep } from 'node:path'
import { chromium, type Browser } from 'playwright'

/**
 * A browser for the tests that need one. The bundled Chromium first (what the server and CI have), then Chrome or Edge
 * if this machine has one. `FORKLING_BROWSER=0` skips these tests; `FORKLING_BROWSER=1` makes a missing browser a
 * failure, which is what CI sets.
 */
export async function launchBrowser(): Promise<Browser | null> {
  if (process.env.FORKLING_BROWSER === '0') return null
  for (const options of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) {
    try {
      return await chromium.launch(options)
    } catch {
      // try the next one
    }
  }
  if (process.env.FORKLING_BROWSER === '1') throw new Error('FORKLING_BROWSER=1, but no Chromium, Chrome or Edge could be started')
  return null
}

export interface Fixture {
  /** `http://127.0.0.1:<port>`: a different port is a different origin. */
  origin: string
  /** Requests received, by path. */
  hits: Map<string, number>
  total(): number
  close(): Promise<void>
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
}

/** 1x1 transparent PNG. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))
  })
}

function wrap(server: Server, origin: string, hits: Map<string, number>): Fixture {
  return {
    origin,
    hits,
    total: () => [...hits.values()].reduce((a, b) => a + b, 0),
    close: () => new Promise((resolve) => (server.closeAllConnections(), server.close(() => resolve()))),
  }
}

/**
 * A static site on loopback, standing in for GitHub Pages. Pages answers every file with `access-control-allow-origin: *`,
 * which a sandboxed page (its origin is opaque) needs to load a module script; `acaoStar: false` leaves it out to show that.
 */
export async function serveDir(root: string, opts: { acaoStar?: boolean } = {}): Promise<Fixture> {
  const hits = new Map<string, number>()
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    hits.set(path, (hits.get(path) ?? 0) + 1)
    const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path))
    if (!file.startsWith(root + sep)) return void res.writeHead(403).end()
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', ...(opts.acaoStar === false ? {} : { 'Access-Control-Allow-Origin': '*' }) })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  return wrap(server, await listen(server), hits)
}

/**
 * "The outside": a second origin that answers anything, harmlessly, and counts it. Any request that reaches it from a
 * sandboxed work is a leak. It also upgrades WebSocket attempts, so a socket that got through is counted too.
 */
export async function outsideServer(): Promise<Fixture> {
  const hits = new Map<string, number>()
  const count = (url: string | undefined) => {
    const path = new URL(url ?? '/', 'http://x').pathname
    hits.set(path, (hits.get(path) ?? 0) + 1)
    return path
  }
  const server = createServer((req, res) => {
    const path = count(req.url)
    const cors = { 'Access-Control-Allow-Origin': '*' }
    if (path.endsWith('.png')) res.writeHead(200, { 'Content-Type': 'image/png', ...cors }).end(PIXEL)
    else if (path.endsWith('.css')) res.writeHead(200, { 'Content-Type': 'text/css', ...cors }).end('body{}')
    else res.writeHead(200, { 'Content-Type': 'text/plain', ...cors }).end('outside')
  })
  server.on('upgrade', (req, socket) => {
    count(req.url)
    socket.destroy()
  })
  return wrap(server, await listen(server), hits)
}
