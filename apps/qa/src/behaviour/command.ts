import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { qaOut } from '../paths.ts'
import { blocking } from '../report/write.ts'
import { snapshotDir } from '../sources/snapshot.ts'
import { cloneLive, day0, runSeeds, scoreRuns, type SeedRun } from './runner.ts'
import { SCENARIOS, type Scenario } from './scenarios.ts'
import { readLevels } from './score.ts'

export const BEHAVIOUR_USAGE = `  behaviour --fake|--real|--live   behaviour runs and their scores (spec 9.1, 9.2, 9.5), into qa-out/behaviour/<label>/
          [--days 7] [--seeds 1] [--cap <dollars>]   --real needs --cap (each seed gets cap/seeds; harness budget, a line in spend.md)
          [--world <start world>]   default: test/fixtures/worlds/day-0 (the fresh start); it is copied, never changed
          [--scenario plain|same-topic|no-memes|rest-40]   the fake model (--fake only)
          [--snapshot <dir>] [--start <date>] [--sessions] [--env-file <file>] [--label <name>]
          --live scores a fresh read-only clone of Merge's repo (or --world <clone>), its last 7 logged days`

export async function behaviourCommand(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      fake: { type: 'boolean' },
      real: { type: 'boolean' },
      live: { type: 'boolean' },
      days: { type: 'string', default: '7' },
      seeds: { type: 'string', default: '1' },
      cap: { type: 'string' },
      world: { type: 'string' },
      scenario: { type: 'string' },
      snapshot: { type: 'string' },
      start: { type: 'string' },
      sessions: { type: 'boolean' },
      'env-file': { type: 'string' },
      label: { type: 'string' },
    },
  })
  const at = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p)
  const modes = [values.fake, values.real, values.live].filter(Boolean).length
  const days = Number(values.days)
  const seeds = Number(values.seeds)
  const scenario = (values.scenario ?? 'plain') as Scenario
  const bad =
    modes !== 1 ? 'pick one of --fake, --real, --live'
    : !Number.isInteger(days) || days < 1 || days > 31 ? '--days is 1 to 31'
    : !Number.isInteger(seeds) || seeds < 1 || seeds > 5 ? '--seeds is 1 to 5'
    : values.real && !(Number(values.cap) > 0) ? '--real needs --cap: real runs come out of the harness budget'
    : !SCENARIOS.includes(scenario) ? `--scenario is one of ${SCENARIOS.join(', ')}`
    : null
  if (bad) {
    console.log(`${bad}\n\n${BEHAVIOUR_USAGE}`)
    return 2
  }
  const mode = values.live ? 'live' : values.real ? 'real' : 'fake'
  const label = values.label ?? (mode === 'live' ? 'live' : `${mode}-${mode === 'fake' ? `${scenario}-` : ''}${days}d-${seeds}s`)
  const outRoot = qaOut('behaviour', label)
  mkdirSync(outRoot, { recursive: true })
  const now = new Date()

  let runs: SeedRun[]
  if (mode === 'live') {
    const world = values.world ? at(values.world) : cloneLive()
    runs = [{ label: 'live', world, outDir: join(outRoot, 'no-output') }]
  } else {
    const world = values.world ? at(values.world) : day0()
    runs = await runSeeds({
      mode,
      days,
      seeds,
      capUsd: Number(values.cap ?? 0),
      world,
      outRoot,
      snapshot: values.snapshot ? at(values.snapshot) : snapshotDir(),
      scenario,
      ...(values.sessions ? { sessions: true } : {}),
      ...(values.start ? { start: values.start } : {}),
      ...(values['env-file'] ? { envFile: at(values['env-file']) } : {}),
      log: (l) => console.log(l),
    })
  }
  const { findings, scored } = await scoreRuns(runs, readLevels(), label, outRoot, now)
  for (const s of scored) console.log(`${s.label}: ${s.scores.filter((x) => x.alarm).map((x) => x.title).join(', ') || 'no alarms'}`)
  console.log(`${findings.length} findings; report in ${outRoot}`)
  // Behaviour alarms are findings for the triage, not a failed command; a blocker (a rail) is.
  return blocking(findings.filter((f) => f.severity === 'blocker')) ? 1 : 0
}
