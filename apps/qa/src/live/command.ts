import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readWorldSources, scoreSources } from '../behaviour/sources.ts'
import { writeRun } from '../report/write.ts'
import { runChecks, type Check } from '../run/check.ts'
import { sourceListChecks } from '../sources/checks.ts'
import { readSourceList } from '../sources/list.ts'
import { snapshotDir, snapshotFreshCheck } from '../sources/snapshot.ts'
import { writeRunInfo } from '../triage/run-info.ts'
import { backfillImgflip, mergeHistory } from './imgflip.ts'
import { checkSourceHealth, type ImgflipHistory } from './sources.ts'

// How far back the Imgflip back-fill reads Merge's history: past the 14 days of the stale alarm (qa-live.yml clones as deep).
const BACKFILL_SINCE = '20 days ago'

export const LIVE_USAGE = `  live --sources                the read-only source run (network: the allowlisted hosts only, robots.txt first)
          [--world <clone>]            also score what Merge read, from a clone of its repo
          [--imgflip-history <file>]   last run's Imgflip list (an Actions artefact); the new one goes to qa-out/imgflip-history.json
          [--snapshot <dir>]           the web snapshot to check (default qa/web-snapshot)`

const readHistory = (path: string | undefined): ImgflipHistory | null => {
  if (!path || !existsSync(path)) return null
  try {
    const h = JSON.parse(readFileSync(path, 'utf8')) as ImgflipHistory
    return h?.version === 1 && Array.isArray(h.entries) ? h : null
  } catch {
    return null
  }
}

// `pnpm qa live --sources`: source health, Imgflip freshness, the snapshot's age, the promised sources, and what the live
// Merge read. Read only. Exits 1 on a blocker (a robots.txt that now disallows), so the Actions run shows red.
export async function liveCommand(args: string[], ctx: { out: string; cwd: string }): Promise<number> {
  const { values } = parseArgs({ args, options: { sources: { type: 'boolean' }, world: { type: 'string' }, 'imgflip-history': { type: 'string' }, snapshot: { type: 'string' } } })
  if (!values.sources) {
    console.log(`pnpm qa\n\n${LIVE_USAGE}`)
    return 2
  }
  const at = (p: string) => resolve(ctx.cwd, p)
  const list = readSourceList()
  const oldHistoryPath = values['imgflip-history'] ? at(values['imgflip-history']) : undefined
  // Earlier runs' lists (the artefact) win per date; days they miss are back-filled from Merge's own morning lists.
  const backfill = values.world ? backfillImgflip(readWorldSources(at(values.world), { since: BACKFILL_SINCE }).offered) : []
  const history = mergeHistory(readHistory(oldHistoryPath), backfill)
  if (backfill.length > 0) console.log(`Imgflip history: ${backfill.length} days back-filled from Merge's morning lists (${backfill[0]!.date} to ${backfill.at(-1)!.date})`)
  mkdirSync(ctx.out, { recursive: true })

  const health: Check = {
    id: 'sources.health',
    area: 'live',
    title: 'Every source answers, robots.txt allows us, the source code finds its items',
    run: async ({ now }) => {
      const r = await checkSourceHealth({ now, list, history, ...(process.env.GITHUB_TOKEN ? { githubToken: process.env.GITHUB_TOKEN } : {}) })
      // Keep the old history when Imgflip could not be read, so one bad morning does not lose it.
      const keep = r.history ?? history
      if (keep) writeFileSync(join(ctx.out, 'imgflip-history.json'), `${JSON.stringify(keep, null, 2)}\n`)
      return r.findings
    },
  }
  const checks: Check[] = [...sourceListChecks, health, snapshotFreshCheck(values.snapshot ? at(values.snapshot) : snapshotDir(), list)]
  if (values.world) {
    const world = at(values.world)
    checks.push({
      id: 'sources.what-merge-read',
      area: 'behaviour',
      title: `What Merge read (${basename(world)})`,
      run: async () => {
        const { summary, findings } = scoreSources(readWorldSources(world), list, { label: 'live' })
        mkdirSync(join(ctx.out, 'sources'), { recursive: true })
        writeFileSync(join(ctx.out, 'sources', 'behaviour-live.json'), `${JSON.stringify(summary, null, 2)}\n`)
        return findings
      },
    })
  }
  const findings = await runChecks(checks, { now: new Date() })
  writeRun(ctx.out, findings, { title: 'live sources' })
  writeRunInfo(ctx.out, { title: 'live sources', areas: checks.map((c) => c.area) })
  console.log(`${checks.length} checks, ${findings.length} findings; report in ${ctx.out}`)
  return findings.some((f) => f.severity === 'blocker') ? 1 : 0
}
