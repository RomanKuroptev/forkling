import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRequire } from 'node:module'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { worldFileList } from '../fixtures/fixtures.ts'
import { qaOut, repoRoot } from '../paths.ts'

/**
 * The world checks open the real viewer (`vite build`) on a fixture world served next to it, as `?world=local` reads it:
 * the viewer at `/`, the world's files at `/world/<path>` and their list at `/world/manifest.json` (audit spec 7.1).
 */

export interface BuildViewerOptions {
  /** The build itself (vite by default; tests pass a fake). */
  build?: (out: string) => Promise<void>
  /** How often a caller waiting on another process's build looks again. */
  pollMs?: number
  /** A lock older than this is from a build that died, and is taken over. */
  staleMs?: number
}

// One build per folder per process: concurrent callers share the same promise (#392).
const builds = new Map<string, { promise: Promise<string>; done: boolean }>()

/**
 * Builds the viewer into qa-out/viewer once and returns the folder; every caller waits for that one build. Across
 * processes (vitest workers, `pnpm qa fast` beside a test run) a lock folder `<out>.lock` makes the others wait, and a
 * caller that waited uses the build that finished meanwhile instead of wiping it. The browser tests build once in their
 * global setup, which sets QA_VIEWER_BUILT so no worker builds again. Rejects if the build fails.
 */
export function buildViewer(out = qaOut('viewer'), opts: BuildViewerOptions = {}): Promise<string> {
  const index = join(out, 'index.html')
  if (process.env.QA_VIEWER_BUILT === out && existsSync(index)) return Promise.resolve(out)
  const had = builds.get(out)
  if (had && (!had.done || existsSync(index))) return had.promise
  const entry = { promise: buildOnce(out, opts), done: false }
  builds.set(out, entry)
  entry.promise.then(
    () => (entry.done = true),
    () => builds.get(out) === entry && builds.delete(out),
  )
  return entry.promise
}

async function buildOnce(out: string, { build = viteBuild, pollMs = 250, staleMs = 10 * 60_000 }: BuildViewerOptions): Promise<string> {
  const lock = `${out}.lock`
  const stamp = `${out}.built`
  const asked = Date.now()
  mkdirSync(dirname(out), { recursive: true })
  let waited = false
  for (;;) {
    try {
      mkdirSync(lock)
      break
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      waited = true
      let age = 0
      try {
        age = Date.now() - statSync(lock).mtimeMs
      } catch {
        continue // it was just let go of
      }
      if (age >= staleMs) rmSync(lock, { recursive: true, force: true })
      else await new Promise((r) => setTimeout(r, pollMs))
    }
  }
  try {
    // Another process built while this one waited: use its viewer rather than wipe it under the tests reading it.
    if (waited && existsSync(join(out, 'index.html')) && existsSync(stamp) && Number(readFileSync(stamp, 'utf8')) >= asked) return out
    rmSync(stamp, { force: true })
    await build(out)
    writeFileSync(stamp, String(Date.now()))
    return out
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

async function viteBuild(out: string): Promise<void> {
  const viewerDir = join(repoRoot(), 'apps', 'viewer')
  const vite = join(dirname(createRequire(join(viewerDir, 'package.json')).resolve('vite/package.json')), 'bin', 'vite.js')
  // A plain build at `/`, with no forkling's world or server baked in.
  const env = { ...process.env, VITE_BASE: '/', VITE_WORLD: '', VITE_MIND_URL: '', VITE_TURNSTILE_SITE_KEY: '', VITE_GOATCOUNTER_CODE: '' }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir'], { cwd: viewerDir, env, stdio: ['ignore', 'ignore', 'inherit'] })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`vite build exited with ${code}`))))
  })
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}

/** A file inside `root` for a request path, or null when the path climbs out or is not there. */
function inside(root: string, path: string): string | null {
  const full = normalize(join(root, path))
  if (full !== root && !full.startsWith(root.endsWith(sep) ? root : root + sep)) return null
  return existsSync(full) && statSync(full).isFile() ? full : null
}

export interface Served {
  url: string
  close(): Promise<void>
}

/** Serves `viewer` at `/` and the world folder at `/world/`, on a free local port. */
export async function serveWorld(viewer: string, world: string): Promise<Served> {
  const manifest = JSON.stringify(worldFileList(world))
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
    const send = (file: string) => {
      res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' })
      res.end(readFileSync(file))
    }
    if (path === '/world/manifest.json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(manifest)
      return
    }
    if (path.startsWith('/world/')) {
      const file = inside(world, path.slice('/world/'.length))
      if (file) send(file)
      else {
        res.writeHead(404)
        res.end('not found')
      }
      return
    }
    // Everything else is the viewer, with its page for any address it routes itself.
    send(inside(viewer, path.slice(1)) ?? join(viewer, 'index.html'))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((resolve) => server.close(() => resolve())) }
}
