import { createServer } from 'node:http'
import type { Browser } from 'playwright'
import { launchChromium } from '../../src/builds/browser.ts'
import { listen, serveDir, wrap, type Fixture } from '../../src/builds/static-server.ts'

export { serveDir, type Fixture }

/**
 * A browser for the tests that need one. The bundled Chromium first (what the server and CI have), then Chrome or Edge
 * if this machine has one. `FORKLING_BROWSER=0` skips these tests; `FORKLING_BROWSER=1` makes a missing browser a
 * failure, which is what CI sets.
 */
export async function launchBrowser(): Promise<Browser | null> {
  if (process.env.FORKLING_BROWSER === '0') return null
  const browser = await launchChromium()
  if (!browser && process.env.FORKLING_BROWSER === '1') throw new Error('FORKLING_BROWSER=1, but no Chromium, Chrome or Edge could be started')
  return browser
}

/** 1x1 transparent PNG. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

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
