import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { isAllowed } from '@forkling/mind/src/web/allowlist.ts'
import { repoRoot } from '../paths.ts'
import type { CheckResult } from '../report/finding.ts'
import type { Check } from '../run/check.ts'
import type { SourceList } from './list.ts'

// The web snapshot of QB.4 (lane B records it, `pnpm qa web-snapshot`); lane S checks it (QS.4). The format was agreed
// between the lanes (docs/spec/audit/lanes/s.md): qa/web-snapshot/manifest.json and files/<sha256 first 16 hex>.<ext>.

export const SnapshotEntry = z.object({
  url: z.string().min(1),
  host: z.string().min(1),
  /** An id in qa/sources.json. */
  source: z.string().min(1),
  status: z.number().int(),
  contentType: z.string().optional(),
  /** Repo-relative to the snapshot folder; absent for a request that failed. */
  file: z.string().min(1).optional(),
  bytes: z.number().int().nonnegative().optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
})

export const SnapshotManifest = z.object({
  version: z.literal(1),
  takenAt: z.iso.datetime({ offset: true }),
  engine: z.string().min(1),
  userAgent: z.string().min(1),
  entries: z.array(SnapshotEntry),
  sources: z.record(z.string(), z.object({ items: z.number().int().nonnegative() })),
})
export type SnapshotManifest = z.infer<typeof SnapshotManifest>

export const snapshotDir = (): string => join(repoRoot(), 'qa', 'web-snapshot')
export const MAX_AGE_DAYS = 14

const manifestPath = (dir: string) => join(dir, 'manifest.json')
const anyVerbAllows = (url: string) => isAllowed(url, 'wander') || isAllowed(url, 'tinker') || isAllowed(url, 'meme')

const FORMAT = 'sources.web-snapshot-format'
const formatFinding = (key: string, title: string, what: string, severity: CheckResult['severity'] = 'major'): CheckResult => ({
  id: FORMAT,
  fingerprint: `${FORMAT}|${key}`,
  severity,
  title,
  what,
  causes: 'A replay on this snapshot would read something Merge may not read, or nothing at all.',
  evidence: ['qa/web-snapshot/manifest.json'],
  where: 'qa/web-snapshot/',
  fixKind: 'data',
})

/**
 * The PR tier: the committed snapshot parses, every URL is on the allowlist, every file it names is there and matches its
 * hash, every source is one qa/sources.json knows. It cannot go stale; no snapshot committed yet is nothing to check.
 */
export function checkSnapshotFormat(dir: string, list: SourceList): CheckResult[] {
  if (!existsSync(manifestPath(dir))) return []
  let manifest: SnapshotManifest
  try {
    manifest = SnapshotManifest.parse(JSON.parse(readFileSync(manifestPath(dir), 'utf8')))
  } catch (e) {
    return [formatFinding('manifest', 'The web snapshot manifest does not parse', `qa/web-snapshot/manifest.json: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`)]
  }
  const out: CheckResult[] = []
  const known = new Set(list.sources.map((s) => s.id))
  for (const e of manifest.entries) {
    if (!anyVerbAllows(e.url)) out.push(formatFinding(`not-allowed|${e.url}`, 'The web snapshot holds a page off the allowlist', `${e.url} is not on the allowlist (apps/mind/src/web/allowlist.ts).`))
    if (!known.has(e.source)) out.push(formatFinding(`unknown-source|${e.source}`, 'The web snapshot names a source qa/sources.json does not know', `Entry ${e.url} says source "${e.source}".`, 'minor'))
    if (!e.file) continue
    const full = join(dir, e.file)
    if (!existsSync(full)) {
      out.push(formatFinding(`no-file|${e.file}`, 'A web snapshot file is missing', `${e.url} points at ${e.file}, which is not there.`))
      continue
    }
    if (e.sha256 && createHash('sha256').update(readFileSync(full)).digest('hex') !== e.sha256)
      out.push(formatFinding(`hash|${e.file}`, 'A web snapshot file does not match its hash', `${e.file} (${e.url}) is not what was recorded.`))
  }
  // One finding per fingerprint.
  return [...new Map(out.map((f) => [f.fingerprint, f])).values()]
}

/** The live run: the snapshot is under 14 days old and every source on the list has items in it. No snapshot throws (did not run). */
export function checkSnapshotFresh(dir: string, list: SourceList, now: Date): CheckResult[] {
  if (!existsSync(manifestPath(dir))) throw new Error('there is no web snapshot yet (qa/web-snapshot/manifest.json); run pnpm qa web-snapshot')
  const manifest = SnapshotManifest.parse(JSON.parse(readFileSync(manifestPath(dir), 'utf8')))
  const out: CheckResult[] = []
  const age = Math.floor((now.getTime() - Date.parse(manifest.takenAt)) / 86_400_000)
  if (age >= MAX_AGE_DAYS)
    out.push({
      id: 'sources.web-snapshot-age',
      fingerprint: 'sources.web-snapshot-age',
      severity: 'major',
      title: `The web snapshot is ${age} days old`,
      what: `It was taken on ${manifest.takenAt.slice(0, 10)}, ${age} days ago; it should be under ${MAX_AGE_DAYS}. Run the web-snapshot job in qa-live.yml.`,
      causes: 'Real behaviour runs read an old web, so their meme formats and front pages are not what Merge sees today.',
      evidence: ['qa/web-snapshot/manifest.json'],
      where: 'qa/web-snapshot/',
      fixKind: 'data',
    })
  for (const s of list.sources.filter((x) => x.state === 'on the list'))
    if ((manifest.sources[s.id]?.items ?? 0) < 1)
      out.push({
        id: 'sources.web-snapshot-missing',
        fingerprint: `sources.web-snapshot-missing|${s.id}`,
        severity: 'major',
        title: `The web snapshot has nothing from ${s.name}`,
        what: `qa/web-snapshot/manifest.json has no items for "${s.id}" (${s.hosts.join(', ')}).`,
        causes: 'A real behaviour run on the snapshot cannot read this source, so its scores say nothing about it.',
        evidence: ['qa/web-snapshot/manifest.json'],
        where: 'qa/web-snapshot/',
        fixKind: 'data',
      })
  return out
}

/** The live run's snapshot check (the format check is in the PR tier, `sources/checks.ts`). */
export const snapshotFreshCheck = (dir: string, list: SourceList): Check => ({
  id: 'sources.web-snapshot-fresh',
  area: 'live',
  title: 'The web snapshot is fresh and has every source',
  run: async (ctx) => checkSnapshotFresh(dir, list, ctx.now),
})
