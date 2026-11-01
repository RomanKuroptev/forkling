import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, sep } from 'node:path'
import { BuildRequest, type BudgetCall } from '@forkling/schema'
import { skillLevel } from '@forkling/sim'
import { artifactFrom } from './art.ts'
import { monthOf } from './budget.ts'
import { writeBuildResult } from './build-result.ts'
import { clampText } from './decision.ts'
import { readWorld, writeJson } from './world.ts'

/** What a coded project may contain, in total and file by file. */
export const MAX_PROJECT_BYTES = 200_000
const EXTENSIONS = new Set(['.html', '.js', '.css', '.svg', '.json'])
/** The one outside host a project may load a pinned library from. */
const ALLOWED_HOST = 'cdnjs.cloudflare.com'
const MAX_DEPTH = 4

/** Calls out of the page. A project is a toy that works offline: nothing in it may phone anyone. */
const NETWORK: [RegExp, string][] = [
  [/\bfetch\s*\(/, 'fetch('],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\bimportScripts\s*\(/, 'importScripts('],
  [/\bEventSource\b/, 'EventSource'],
]
/** Things that put another page in this one or send the visitor elsewhere. */
const MARKUP: [RegExp, string][] = [
  [/<\s*iframe\b/i, '<iframe>'],
  [/<\s*(object|embed)\b/i, '<object> or <embed>'],
  [/<\s*form\b/i, '<form>'],
  [/http-equiv\s*=\s*["']?refresh/i, 'a meta refresh'],
]

export interface ProjectCheck {
  ok: boolean
  problems: string[]
}

const walk = (root: string, dir = root, depth = 0): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return depth < MAX_DEPTH ? walk(root, full, depth + 1) : [`${full.slice(root.length + 1)}/ (too deep)`]
    return [full.slice(root.length + 1).split(sep).join('/')]
  })

/**
 * Whether a project folder is something the site may publish: an `index.html`, only plain web files, small, offline, and
 * with nothing that pulls another page in or sends the visitor away. This is a lint that catches the careless; a
 * person still reads every coded project before it merges.
 */
export function checkProject(dir: string, id: string): ProjectCheck {
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(id)) return { ok: false, problems: [`"${id}" is not a project name`] }
  const root = join(dir, 'site/projects', id)
  if (!existsSync(root) || !statSync(root).isDirectory()) return { ok: false, problems: [`site/projects/${id}/ is not there`] }
  const problems: string[] = []
  const files = walk(root)
  if (!files.includes('index.html')) problems.push('there is no index.html to open')
  let total = 0
  for (const rel of files) {
    if (rel.endsWith('(too deep)')) {
      problems.push(`${rel}: folders go no deeper than ${MAX_DEPTH}`)
      continue
    }
    const full = join(root, rel)
    if (!EXTENSIONS.has(extname(rel).toLowerCase())) {
      problems.push(`${rel}: this type of file is not allowed (only ${[...EXTENSIONS].join(', ')})`)
      continue
    }
    total += statSync(full).size
    const text = readFileSync(full, 'utf8')
    for (const m of text.matchAll(/(?:https?:)?\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
      if (m[1]!.toLowerCase() !== ALLOWED_HOST) problems.push(`${rel}: an address on ${m[1]} is not allowed (only ${ALLOWED_HOST})`)
    }
    for (const [re, name] of NETWORK) if (re.test(text)) problems.push(`${rel}: ${name} is not allowed: a project does not use the network`)
    for (const [re, name] of MARKUP) if (re.test(text)) problems.push(`${rel}: ${name} is not allowed`)
  }
  if (total > MAX_PROJECT_BYTES) problems.push(`the project is too big: ${total} bytes of ${MAX_PROJECT_BYTES}`)
  return { ok: problems.length === 0, problems: [...new Set(problems)] }
}

export interface ProjectResult extends ProjectCheck {
  written: string[]
}

/**
 * After the builder has written a project: if its files pass `checkProject`, the project becomes an artifact in `art/`
 * (so it shows on the site once the pull request merges), and what the builder spent goes into the ledger.
 */
export function finishProject(dir: string, input: { now: Date; id: string; usd: number }): ProjectResult {
  const result: ProjectResult = { ok: false, problems: [], written: [] }
  const requestPath = join(dir, 'mind/builds', `${input.id}.json`)
  const parsed = existsSync(requestPath) ? BuildRequest.safeParse(JSON.parse(readFileSync(requestPath, 'utf8'))) : null
  if (!parsed?.success || parsed.data.kind !== 'code') {
    result.problems.push(`mind/builds/${input.id}.json is not a request for a coded project`)
    return result
  }
  const request = parsed.data
  const nowMs = input.now.getTime()
  const w = readWorld(dir, (f) => monthOf(f.timezone, nowMs))

  // The builder's only report to the mind. What it spent counts whatever came of it; the mind books it, and closes a
  // failed build so it may ask again. The builder never writes the ledger, the stream or the mind's state.
  const calls: BudgetCall[] =
    input.usd > 0 ? [{ at: input.now.toISOString(), kind: 'code', model: 'claude-haiku-5-5', input: 0, cacheRead: 0, cacheWrite: 0, output: 0, usd: input.usd }] : []
  const report = (status: 'pr-open' | 'failed', reason?: string) =>
    result.written.push(writeBuildResult(dir, { id: request.id, kind: 'code', status, ...(reason ? { reason: clampText(reason, 300) } : {}), calls, at: input.now.toISOString() }))

  const check = checkProject(dir, input.id)
  result.problems.push(...check.problems)
  if (!check.ok) {
    // It will not be published.
    report('failed', check.problems[0] ?? 'it did not pass the checks')
    return result
  }

  const art = artifactFrom(
    'code',
    { title: request.name, idea: request.purpose, howItPlays: request.howItPlays ?? 'Open it and see.' },
    { skillLevel: skillLevel(w.skills, 'mind'), ...(request.goalRef ? { goalRef: request.goalRef } : {}), nowIso: input.now.toISOString(), takenIds: new Set(), code: { project: input.id } },
  )
  if (!art) {
    result.problems.push('the artifact for the project could not be made')
    report('failed', 'the artifact for the project could not be made')
    return result
  }
  if (writeJson(dir, `art/${art.id}.json`, art)) result.written.push(`art/${art.id}.json`)
  result.ok = true
  // It passed its checks and goes to a person by pull request: waiting for them is what `pr-open` means.
  report('pr-open')
  return result
}
