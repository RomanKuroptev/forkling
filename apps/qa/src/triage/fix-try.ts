import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { parseMarker, withMarker } from './marker.ts'
import type { Tracker } from './tracker.ts'

// `pnpm qa fix-try <issue> --failed "<what was tried>" | --merged <pr>`: the fixer's result on the issue.
// After 2 failed tries the issue gets fix-failed (spec 10.6) and is not picked again.
export const FIX_TRIES = 2

export const FixRecord = z.object({
  date: z.string(),
  issue: z.number().int(),
  title: z.string(),
  result: z.enum(['merged', 'failed', 'fix-failed']),
  pr: z.number().int().optional(),
  what: z.string().optional(),
})
export type FixRecord = z.infer<typeof FixRecord>

const fixesFile = (out: string): string => join(out, 'fixes.json')

export function readFixes(out: string): FixRecord[] {
  const file = fixesFile(out)
  return existsSync(file) ? z.array(FixRecord).parse(JSON.parse(readFileSync(file, 'utf8'))) : []
}

function addFix(out: string, record: FixRecord): void {
  mkdirSync(out, { recursive: true })
  writeFileSync(fixesFile(out), `${JSON.stringify([...readFixes(out), record], null, 2)}\n`)
}

export type FixResult = { issue: number } & ({ failed: string; merged?: undefined } | { merged: number; failed?: undefined })

export async function recordFix(tracker: Tracker, result: FixResult, opts: { out: string; date: string }): Promise<FixRecord> {
  const issue = await tracker.getIssue(result.issue)
  const state = parseMarker(issue.body)
  if (!state) throw new Error(`#${result.issue} is not a triage issue (no qa-state line); fix-try only records fixes of issues triage opened`)

  if (result.merged !== undefined) {
    await tracker.editBody(issue.number, withMarker(issue.body, { ...state, fixedBy: result.merged }))
    await tracker.comment(issue.number, `Fixed by #${result.merged} (merged after its checks passed). This closes itself after 2 runs that look and do not see it.`)
    const record: FixRecord = { date: opts.date, issue: issue.number, title: issue.title, result: 'merged', pr: result.merged }
    addFix(opts.out, record)
    return record
  }

  const tries = state.tries + 1
  await tracker.editBody(issue.number, withMarker(issue.body, { ...state, tries }))
  const gaveUp = tries >= FIX_TRIES
  await tracker.comment(
    issue.number,
    [`Fix try ${tries} did not work: ${result.failed}`, ...(gaveUp ? ['', `That is ${FIX_TRIES} tries, so this is labelled fix-failed and waits for Roman.`] : [])].join('\n'),
  )
  if (gaveUp) await tracker.addLabels(issue.number, ['fix-failed'])
  const record: FixRecord = { date: opts.date, issue: issue.number, title: issue.title, result: gaveUp ? 'fix-failed' : 'failed', what: result.failed }
  addFix(opts.out, record)
  return record
}
