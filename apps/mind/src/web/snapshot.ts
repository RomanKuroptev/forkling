import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FetchImpl } from './fetch.ts'

/**
 * A recorded copy of the allowed web (the audit harness's web snapshot, `qa/web-snapshot/`, audit spec 9.1), so a behaviour run
 * reads the same pages every time and always meets meme formats. `recordingFetch` sits under the real fetcher and keeps every
 * answer; `snapshotFetch` answers from the copy, and anything not in it is a 404. The fetcher above both is the normal one, so
 * the allowlist and the rates hold as always. Merge never knows which web it reads.
 *
 * The format was agreed with lane S (docs/spec/audit/lanes/s.md): `manifest.json` and `files/<first 16 hex of sha256>.<ext>`.
 * A redirect also keeps its `location`, so a replay can follow it.
 */

export interface SnapshotEntry {
  url: string
  host: string
  /** An id in `qa/sources.json`. */
  source: string
  /** 0 when the request did not get an answer. */
  status: number
  contentType?: string
  file?: string
  bytes?: number
  sha256?: string
  location?: string
}

export interface SnapshotManifest {
  version: 1
  takenAt: string
  engine: string
  userAgent: string
  entries: SnapshotEntry[]
  sources: Record<string, { items: number }>
}

const EXT: [RegExp, string][] = [
  [/html/, 'html'],
  [/json/, 'json'],
  [/xml/, 'xml'],
  [/png/, 'png'],
  [/jpe?g/, 'jpg'],
  [/gif/, 'gif'],
  [/webp/, 'webp'],
  [/svg/, 'svg'],
  [/text\/plain/, 'txt'],
]
const extFor = (contentType: string): string => EXT.find(([re]) => re.test(contentType))?.[1] ?? 'bin'

/**
 * Less HTML to keep, same text: scripts, styles, comments, `<svg>`, `<noscript>`, `<link>` and `<meta>` go, and so do `style`
 * and `data-*` attributes. Text, links, ids and classes stay, which is all the engine's cleaner and its source adapters read.
 */
export function trimHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(link|meta)\b[^>]*>/gi, '')
    .replace(/\s(?:style|data-[\w-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\n\s*\n+/g, '\n')
}

/**
 * A page cut to `max` bytes at the end of a tag. The engine keeps at most 3,000 tokens of a page's text (about 12 KB), so the
 * first 100 KB of HTML hold all it reads and the links near the top. A front page (`Main_Page`) is kept whole: its sections run long.
 */
export const MAX_PAGE_BYTES = 100_000
export function cutHtml(url: string, html: string, max = MAX_PAGE_BYTES): string {
  if (Buffer.byteLength(html) <= max || /\/Main_Page$/.test(new URL(url).pathname)) return html
  const head = Buffer.from(html).subarray(0, max).toString('utf8')
  return head.slice(0, head.lastIndexOf('>') + 1)
}

export function recordingFetch(inner: FetchImpl, dir: string, sourceOf: (host: string) => string): FetchImpl & { entries: SnapshotEntry[]; bytes: () => number } {
  const entries: SnapshotEntry[] = []
  const byUrl = new Map<string, SnapshotEntry>()
  let total = 0
  mkdirSync(join(dir, 'files'), { recursive: true })
  const record = (e: SnapshotEntry) => {
    if (byUrl.has(e.url)) return
    byUrl.set(e.url, e)
    entries.push(e)
  }
  const fn = (async (url, init) => {
    const host = new URL(url).hostname
    const base = { url, host, source: sourceOf(host) }
    let res: Response
    try {
      res = await inner(url, init)
    } catch (e) {
      record({ ...base, status: 0 })
      throw e
    }
    const contentType = res.headers.get('content-type') ?? ''
    const location = res.headers.get('location')
    if (!res.ok) {
      record({ ...base, status: res.status, ...(contentType ? { contentType } : {}), ...(location ? { location } : {}) })
      return res
    }
    let body = Buffer.from(await res.arrayBuffer())
    if (/html/.test(contentType)) body = Buffer.from(cutHtml(url, trimHtml(body.toString('utf8'))))
    const sha256 = createHash('sha256').update(body).digest('hex')
    const file = `files/${sha256.slice(0, 16)}.${extFor(contentType)}`
    if (!byUrl.has(url)) {
      writeFileSync(join(dir, file), body)
      total += body.length
    }
    record({ ...base, status: res.status, contentType, file, bytes: body.length, sha256 })
    return new Response(body, { status: res.status, headers: { 'content-type': contentType } })
  }) as FetchImpl & { entries: SnapshotEntry[]; bytes: () => number }
  fn.entries = entries
  fn.bytes = () => total
  return fn
}

/** Items per source: answers kept with a file, not counting robots.txt. */
export function itemsPerSource(entries: readonly SnapshotEntry[]): Record<string, { items: number }> {
  const out: Record<string, { items: number }> = {}
  for (const e of entries) {
    if (!e.file || new URL(e.url).pathname === '/robots.txt') continue
    out[e.source] = { items: (out[e.source]?.items ?? 0) + 1 }
  }
  return out
}

export function writeManifest(dir: string, m: Omit<SnapshotManifest, 'version' | 'sources'>): SnapshotManifest {
  const manifest: SnapshotManifest = { version: 1, ...m, sources: itemsPerSource(m.entries) }
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

/** A fetch that answers from a snapshot folder. An address not in it is a 404; a request that failed when it was taken fails again. */
export function snapshotFetch(dir: string): FetchImpl {
  const path = join(dir, 'manifest.json')
  if (!existsSync(path)) throw new Error(`${dir} has no manifest.json: not a web snapshot`)
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as SnapshotManifest
  const byUrl = new Map(manifest.entries.map((e) => [e.url, e]))
  return async (url) => {
    const e = byUrl.get(url)
    if (!e) return new Response('not in the web snapshot', { status: 404, headers: { 'content-type': 'text/plain' } })
    if (e.status === 0) throw new Error(`${url} did not answer when the snapshot was taken`)
    const headers: Record<string, string> = {}
    if (e.contentType) headers['content-type'] = e.contentType
    if (e.location) headers.location = e.location
    const body = e.file && existsSync(join(dir, e.file)) ? readFileSync(join(dir, e.file)) : null
    return new Response(e.status >= 300 && e.status < 400 ? null : body, { status: e.status, headers })
  }
}
