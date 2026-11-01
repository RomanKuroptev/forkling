import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { Goals } from '@forkling/schema'
import { quirkWeights, simReport, worldWithObjects, type ReportStep } from '@forkling/sim'
import { defaultSteps, formatReport } from './report-format.ts'
import { loadSpecies } from './species.ts'
import { readWorld } from './world.ts'

const USAGE = `usage: pnpm --filter @forkling/mind sim-report [--world <dir>] [--days 14] [--seed <n>] [--seed2 <n>] [--plan <goals.json>] [--json]

Plays the body for days against a world, with the sleep schedule, no visitors and no model, and prints what it measured:
time per verb, how much of the plan the body really did and what broke it off, and how long each need ran critical.
--world is a world repo (default: the engine's own template). --seed defaults to the forkling's own seed, and its
temperament shapes the choices. --plan reads the steps of a goals file (like mind/goals.json); without it the plan is
the verbs the pack lets a body do on its own, 25 minutes each. A second --seed2 prints a second run to compare.`

const engineTemplate = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))

function stepsFrom(path: string): ReportStep[] {
  const goals = Goals.parse(JSON.parse(readFileSync(path, 'utf8')))
  return (goals.today?.steps ?? []).map((s) => ({ verb: s.verb, ...(s.targetId ? { targetId: s.targetId } : {}), minutes: s.minutes }))
}

function main(): void {
  const { values } = parseArgs({
    options: {
      world: { type: 'string' },
      days: { type: 'string' },
      seed: { type: 'string' },
      seed2: { type: 'string' },
      plan: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) {
    console.log(USAGE)
    return
  }
  const base = process.env.INIT_CWD ?? process.cwd()
  const dir = values.world ? resolve(base, values.world) : engineTemplate
  const days = Number(values.days ?? 14)
  if (!Number.isInteger(days) || days < 1 || days > 60) throw new Error(`--days "${values.days}" must be a whole number from 1 to 60`)

  const w = readWorld(dir, () => '2026-11')
  const species = loadSpecies(w.forkling.species)
  const weights = w.temperament ? quirkWeights(w.temperament, species.pools) : {}
  const steps = values.plan ? stepsFrom(resolve(base, values.plan)) : defaultSteps(species.pack)
  if (steps.length === 0) console.log('note: no plan steps, so the body is never given a focus')
  const world = worldWithObjects(w.objects)
  const seeds = [values.seed ? Number(values.seed) : w.forkling.seed, ...(values.seed2 ? [Number(values.seed2)] : [])]
  if (seeds.some((s) => !Number.isInteger(s))) throw new Error('a seed must be a whole number')

  const out: string[] = []
  for (const seed of seeds) {
    const report = simReport({ pack: species.pack, behaviors: species.behaviors, seed, days, timezone: w.forkling.timezone, world, steps, quirkWeights: weights })
    out.push(values.json ? JSON.stringify(report) : formatReport(report))
  }
  console.log(out.join(values.json ? '\n' : '\n\n'))
  if (process.env.GITHUB_STEP_SUMMARY && existsSync(process.env.GITHUB_STEP_SUMMARY)) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Sim report\n\n\`\`\`\n${out.join('\n\n')}\n\`\`\`\n`)
  }
}

try {
  main()
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
