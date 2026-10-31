import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { MindState, type PhotoShot } from '@forkling/schema'

/** Every file of the world, relative to its root with forward slashes: what the viewer's local loader is told exists. */
export function listWorldFiles(root: string): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === '.git' || name === 'node_modules') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else files.push(relative(root, full).split(sep).join('/'))
    }
  }
  walk(root)
  return files
}

/** `rel` under `root`, or null if it would leave it. */
export function insideRoot(root: string, rel: string): string | null {
  const base = resolve(root)
  const full = resolve(base, rel)
  return full === base || full.startsWith(base + sep) ? full : null
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

export function contentType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/** The shots the tick queued, in the order it queued them. */
export function shotsToRender(world: string): PhotoShot[] {
  const path = join(world, 'mind/state.json')
  if (!existsSync(path)) return []
  const parsed = MindState.safeParse(JSON.parse(readFileSync(path, 'utf8')))
  return parsed.success ? (parsed.data.photos?.queue ?? []) : []
}
