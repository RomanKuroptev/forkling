import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { eyeCamUrl } from '../src/eyecam/params.ts'
import { contentType, insideRoot, listWorldFiles, shotsToRender } from './eyecamLib.ts'

const USAGE = `usage: pnpm --filter @forkling/viewer eyecam --world <dir> --out <dir> [--dist <dir>]

Renders each shot queued in <world>/mind/state.json to <out>/<shot id>.jpg (512 x 512), through the forkling's eyes.

  --world  the world repo
  --out    where to leave the frames
  --dist   the built viewer (default: dist next to this script's package)

Set EYECAM_CHANNEL=msedge (or chrome) to use an installed browser instead of Playwright's chromium.`

/** The size of a frame: what the vision call is given, and about what it costs. */
const SIZE = 512
const READY_TIMEOUT_MS = 90_000

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { world: { type: 'string' }, out: { type: 'string' }, dist: { type: 'string' }, help: { type: 'boolean', short: 'h', default: false } },
  })
  if (values.help || !values.world || !values.out) {
    console.log(USAGE)
    return
  }
  const base = process.env.INIT_CWD ?? process.cwd()
  const world = resolve(base, values.world)
  const out = resolve(base, values.out)
  const dist = resolve(base, values.dist ?? join(import.meta.dirname, '../dist'))
  const shots = shotsToRender(world)
  if (shots.length === 0) {
    console.log('no shots queued')
    return
  }
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`${dist} has no built viewer: run "pnpm --filter @forkling/viewer build" first`)
  mkdirSync(out, { recursive: true })

  // The viewer, and the world at /world/, served from where they are. Nothing leaves this machine.
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
    let file: string | null = null
    if (path === '/world/manifest.json') {
      res.writeHead(200, { 'content-type': contentType('manifest.json') })
      res.end(JSON.stringify(listWorldFiles(world)))
      return
    }
    if (path.startsWith('/world/')) file = insideRoot(world, path.slice('/world/'.length))
    else file = insideRoot(dist, path === '/' ? 'index.html' : path.slice(1))
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      if (path.startsWith('/world/')) {
        res.writeHead(404)
        res.end()
        return
      }
      file = join(dist, 'index.html')
    }
    res.writeHead(200, { 'content-type': contentType(file) })
    res.end(readFileSync(file))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const channel = process.env.EYECAM_CHANNEL
  const browser = await chromium.launch({
    ...(channel ? { channel } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  })
  let rendered = 0
  try {
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 })
      try {
        page.on('pageerror', (e) => console.warn(`${shot.id}: page error: ${e.message}`))
        await page.goto(`${origin}/${eyeCamUrl(shot, shot.at)}`)
        await page.waitForFunction(() => (window as unknown as { __eyecamReady?: boolean }).__eyecamReady === true, null, { timeout: READY_TIMEOUT_MS })
        await page.screenshot({ path: join(out, `${shot.id}.jpg`), type: 'jpeg', quality: 80 })
        rendered += 1
        console.log(`rendered ${shot.id}`)
      } catch (e) {
        // One bad frame must not stop the others, or the tick's commit.
        console.warn(`could not render ${shot.id}: ${(e as Error).message}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
    server.close()
  }
  console.log(`rendered ${rendered} of ${shots.length} frames`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
