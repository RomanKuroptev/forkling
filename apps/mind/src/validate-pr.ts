import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { WorkMeta } from '@forkling/schema'
import type { WorkChecker } from './builds/browser-check.ts'
import { memeSeeds, verifyMemeSources } from './builds/memes.ts'
import { staticCheck } from './builds/work-check.ts'
import type { GitRunner } from './tick/git.ts'

/** The only folders a pull request from a build may change (spec 11.1, CLAUDE.md). */
const ALLOWED = ['places/', 'works/', 'wishes/']
const WORK_FILES = new Set(['index.html', 'meta.json', 'thumb.png'])
const WORK_ID = /^[a-z0-9][a-z0-9-]{0,60}$/
const MAX_THUMB_BYTES = 300_000
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export interface Change {
  status: 'A' | 'M' | 'D'
  path: string
}

/** What `git diff --name-status` says. A rename is a delete and an add; a copy is an add. */
export function parseNameStatus(output: string): Change[] {
  const changes: Change[] = []
  for (const line of output.split('\n')) {
    const [code, first, second] = line.split('\t')
    if (!code || !first) continue
    const kind = code[0]
    if (kind === 'A' || kind === 'C') changes.push({ status: 'A', path: second ?? first })
    else if (kind === 'M' || kind === 'T') changes.push({ status: 'M', path: first })
    else if (kind === 'D') changes.push({ status: 'D', path: first })
    else if (kind === 'R') {
      changes.push({ status: 'D', path: first })
      if (second) changes.push({ status: 'A', path: second })
    }
  }
  return changes
}

/** The files a pull request changes, between the commit it branched from and its head. */
export async function listChanges(git: GitRunner, base: string, head: string): Promise<Change[]> {
  const r = await git(['diff', '--name-status', '--no-renames', `${base}...${head}`])
  if (r.code !== 0) throw new Error(`git diff failed (exit code ${r.code})`)
  return parseNameStatus(r.stdout)
}

export interface ValidateOptions {
  /** The pull request's head, checked out. */
  world: string
  changes: readonly Change[]
  /** The browser check. Without one only the static checks run. */
  checker?: WorkChecker | undefined
  /** The pull request's branch. One named `work/<id>` is the build worker's and is merged by itself, so it may hold that one work only. */
  branch?: string
}

export interface ValidateResult {
  ok: boolean
  problems: string[]
}

const readJson = (file: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(readFileSync(file, 'utf8')) }
  } catch {
    return { ok: false }
  }
}

/**
 * What `validate.yml` asks of a pull request (spec 11.1, 14.3): it changes only `places/`, `works/` and `wishes/`; a place or a
 * wish is JSON that parses; a work is `index.html`, `meta.json` and (when it is on the shelf) `thumb.png`, nothing else, with a
 * meta that fits its schema and a page that passes the work check again. A work in a pull request is new: only the mind
 * retires, changes or removes one. A scrap is kept with its reason and not run. Every problem is listed, not just the first.
 */
export async function validatePullRequest(o: ValidateOptions): Promise<ValidateResult> {
  const problems: string[] = []

  const branchId = /^work\/([a-z0-9][a-z0-9-]*)$/.exec(o.branch ?? '')?.[1]
  if (branchId) {
    if (o.changes.length === 0) problems.push(`the pull request from work/${branchId} changes nothing`)
    for (const c of o.changes) if (!c.path.startsWith(`works/${branchId}/`)) problems.push(`the pull request from work/${branchId} may change only works/${branchId}/, and it changes ${c.path}`)
  }

  const byWork = new Map<string, Change[]>()
  for (const c of o.changes) {
    if (!ALLOWED.some((prefix) => c.path.startsWith(prefix)) || c.path.includes('..') || c.path.includes('\\')) {
      problems.push(`${c.path} is outside places/, works/ and wishes/, which a build may not change`)
      continue
    }
    const work = /^works\/([^/]+)\/(.+)$/.exec(c.path)
    if (work) {
      byWork.set(work[1]!, [...(byWork.get(work[1]!) ?? []), c])
      continue
    }
    if (c.path.startsWith('works/')) problems.push(`${c.path} is not inside a work's own folder`)
    else if (c.status !== 'D' && c.path.endsWith('.json')) {
      if (!existsSync(join(o.world, c.path)) || !readJson(join(o.world, c.path)).ok) problems.push(`${c.path} is not valid JSON`)
    }
  }

  for (const [id, changes] of byWork) {
    const here = (message: string) => problems.push(`works/${id}: ${message}`)
    if (!WORK_ID.test(id)) {
      here('the folder name is not a plain id')
      continue
    }
    let touched = false
    for (const c of changes) {
      const name = c.path.slice(`works/${id}/`.length)
      if (!WORK_FILES.has(name)) here(`${name} is not one of index.html, meta.json and thumb.png`)
      else if (c.status === 'M') here(`an existing work cannot be changed by a pull request (${name})`)
      else if (c.status === 'D') here(`a pull request cannot delete a work file (${name})`)
      else touched = true
    }
    if (!touched) continue

    const folder = join(o.world, 'works', id)
    const metaRead = existsSync(join(folder, 'meta.json')) ? readJson(join(folder, 'meta.json')) : { ok: false as const }
    if (!metaRead.ok) {
      here('meta.json is missing or is not JSON')
      continue
    }
    const meta = WorkMeta.safeParse(metaRead.value)
    if (!meta.success) {
      here(`meta.json does not fit the work schema (${meta.error.issues.map((i) => `${i.path.join('.') || 'meta'}: ${i.message}`).slice(0, 3).join('; ')})`)
      continue
    }
    if (meta.data.id !== id) here(`its id is "${meta.data.id}", not "${id}"`)
    if (meta.data.status === 'retired') here('a pull request cannot bring in a retired work: only the mind retires one')
    if (!existsSync(join(folder, 'index.html'))) {
      here('index.html is missing')
      continue
    }
    if (meta.data.status !== 'shelf') continue

    const thumb = join(folder, 'thumb.png')
    if (!existsSync(thumb)) here('thumb.png is missing')
    else {
      const bytes = readFileSync(thumb)
      if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) here('thumb.png is not a PNG')
      else if (statSync(thumb).size > MAX_THUMB_BYTES) here(`thumb.png is over ${MAX_THUMB_BYTES / 1000} KB`)
    }

    const html = readFileSync(join(folder, 'index.html'), 'utf8')
    const fixed = staticCheck(html, { size: meta.data.size, kind: meta.data.kind })
    for (const reason of fixed.reasons) here(reason)
    if (meta.data.kind === 'meme') for (const reason of verifyMemeSources(meta.data.sources, memeSeeds(o.world))) here(reason)
    if (fixed.ok && o.checker) {
      const checked = await o.checker.check(html, { size: meta.data.size, kind: meta.data.kind })
      if (!checked.ok) for (const reason of checked.reasons) here(reason)
    }
  }

  return { ok: problems.length === 0, problems }
}
