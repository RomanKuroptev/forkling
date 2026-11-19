import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
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

let built: string | null = null

/** Builds the viewer once per process into qa-out/viewer and returns the folder. Throws if the build fails. */
export function buildViewer(out = qaOut('viewer')): string {
  if (built === out && existsSync(join(out, 'index.html'))) return out
  const viewerDir = join(repoRoot(), 'apps', 'viewer')
  const vite = join(dirname(createRequire(join(viewerDir, 'package.json')).resolve('vite/package.json')), 'bin', 'vite.js')
  // A plain build at `/`, with no forkling's world or server baked in.
  const env = { ...process.env, VITE_BASE: '/', VITE_WORLD: '', VITE_MIND_URL: '', VITE_TURNSTILE_SITE_KEY: '', VITE_GOATCOUNTER_CODE: '' }
  execFileSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir'], { cwd: viewerDir, env, stdio: ['ignore', 'ignore', 'inherit'] })
  built = out
  return out
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
