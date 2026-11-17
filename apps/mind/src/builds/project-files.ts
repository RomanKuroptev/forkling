import { lstatSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { PROJECT_EXTENSIONS, PROJECT_LIMITS } from '@forkling/schema'

/**
 * The files of a project (spec-v4 3.1): static web files in `projects/<id>/src/` and nowhere else. The file tools of a build
 * session (step 4) go through these functions, so a path is checked by code before anything touches the disk. The name rule
 * and the limits are pure; `resolveProjectPath` also looks at the disk, so that a link cannot lead out of `src/`.
 */

/** The limits and kinds of file live with the project schema; they are re-exported here for the file tools. */
export { PROJECT_EXTENSIONS, PROJECT_LIMITS }

export type Refusal = { ok: false; reason: string }
export type PathCheck = { ok: true; rel: string } | Refusal
export type ResolvedPath = { ok: true; rel: string; abs: string } | Refusal
export interface ProjectFile {
  /** Relative to `src/`, with `/`. */
  path: string
  bytes: number
}

const NAME = /^[a-z0-9\-_./]+$/
const no = (reason: string): Refusal => ({ ok: false, reason })
const shown = (path: string) => JSON.stringify(path.slice(0, 80))

/**
 * The name rule: lowercase letters, digits, `-`, `_`, `.` and `/`; no `..`, no absolute path, no part that starts with a dot,
 * and one of the allowed kinds of file. A leading `src/` is taken off, so `src/index.html` and `index.html` are the same file.
 * Gives the path relative to `src/`.
 */
export function checkProjectPath(path: string): PathCheck {
  if (path === '') return no('the path is empty')
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return no(`${shown(path)} is an absolute path, and a project's files are named from its src/ folder`)
  if (path.split(/[\\/]/).includes('..')) return no(`${shown(path)} goes up a folder (..), and a project stays inside its src/ folder`)
  if (!NAME.test(path)) return no(`${shown(path)} has a character outside the name rule: lowercase letters, digits, -, _, . and /`)
  const rel = path.startsWith('src/') ? path.slice(4) : path
  const parts = rel.split('/')
  if (parts.some((p) => p === '')) return no(`${shown(path)} has an empty part (a / at the start or end, or two together)`)
  if (parts.some((p) => p.startsWith('.'))) return no(`${shown(path)} has a part that starts with a dot`)
  const ext = extname(rel)
  if (!PROJECT_EXTENSIONS.includes(ext)) {
    return no(`${ext ? `a ${ext} file` : `${shown(path)}`} is not a kind of file a project may hold: ${PROJECT_EXTENSIONS.join(', ')}`)
  }
  return { ok: true, rel }
}

const isLink = (path: string): boolean | null => {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return null
  }
}

/**
 * Where a project path is on disk, or why not. `projectDir` is `projects/<id>`. Every part of the path that exists is looked at,
 * and a link anywhere (the `src/` folder itself, a folder on the way, the file) refuses it: a link could lead out of the project.
 */
export function resolveProjectPath(projectDir: string, path: string): ResolvedPath {
  const checked = checkProjectPath(path)
  if (!checked.ok) return checked
  let at = join(projectDir, 'src')
  if (isLink(at)) return no('the src/ folder is a link, and a project stays inside its own folder')
  for (const part of checked.rel.split('/')) {
    at = join(at, part)
    const link = isLink(at)
    if (link === null) break
    if (link) return no(`${shown(path)} is or passes through a link, and a link could lead out of the project`)
  }
  return { ok: true, rel: checked.rel, abs: join(projectDir, 'src', ...checked.rel.split('/')) }
}

/** The files in `src/`, relative to it and sorted, with their sizes. Links are left out (they are never followed). */
export function listProjectFiles(projectDir: string): ProjectFile[] {
  const root = join(projectDir, 'src')
  if (isLink(root) !== false) return []
  const out: ProjectFile[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const rel = `${prefix}${entry.name}`
      if (entry.isDirectory()) walk(join(dir, entry.name), `${rel}/`)
      else if (entry.isFile()) out.push({ path: rel, bytes: lstatSync(join(dir, entry.name)).size })
    }
  }
  walk(root, '')
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

const kb = (bytes: number) => `${Math.ceil(bytes / 1024)} KB`

/**
 * Whether writing `bytes` to `path` keeps the project within 3.1's limits, given the files it has now. A write that replaces a
 * file counts that file once. Pure.
 */
export function checkWrite(files: readonly ProjectFile[], path: string, bytes: number): { ok: true } | Refusal {
  if (bytes > PROJECT_LIMITS.fileBytes) return no(`the file would be ${kb(bytes)}, over the ${kb(PROJECT_LIMITS.fileBytes)} a file may be`)
  const old = files.find((f) => f.path === path)
  if (!old && files.length >= PROJECT_LIMITS.files) return no(`the project already has ${files.length} files, and ${PROJECT_LIMITS.files} files is the most it may hold; delete one first`)
  const total = files.reduce((sum, f) => sum + f.bytes, 0) - (old?.bytes ?? 0) + bytes
  if (total > PROJECT_LIMITS.totalBytes) return no(`the project would be ${kb(total)} in all, over the 2 MB a project may be`)
  return { ok: true }
}
