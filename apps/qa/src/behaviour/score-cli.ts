import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { qaOut } from '../paths.ts'
import { didNotRun } from '../run/check.ts'
import { readRun } from './read-run.ts'
import { readLevels, scoreRun } from './score.ts'
import { writeBehaviour } from './write.ts'

export const SCORE_USAGE = `pnpm qa score --world <world> [--out <fast-forward output>] [--label <name>] [--from <date> --to <date>] [--days 7]
  scores one run (spec 9.2): a fast-forward's world and output folder, or a world clone alone (its last --days logged days).
  Writes qa-out/behaviour/<label>/ (findings.json, report.md, scores.json). Reads only.`

/** `pnpm qa score`: exit 0 when it ran (alarms are findings, not a failure of the command), 2 on bad arguments. */
export async function scoreCommand(argv: string[]): Promise<number> {
  const { values } = parseArgs({ args: argv, options: { world: { type: 'string' }, out: { type: 'string' }, label: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, days: { type: 'string', default: '7' } } })
  if (!values.world) {
    console.log(SCORE_USAGE)
    return 2
  }
  const base = process.env.INIT_CWD ?? process.cwd()
  const label = values.label ?? 'run'
  const outDir = qaOut('behaviour', label)
  const now = new Date()
  try {
    const run = readRun({ world: resolve(base, values.world), outDir: values.out ? resolve(base, values.out) : null, label, ...(values.from ? { from: values.from } : {}), ...(values.to ? { to: values.to } : {}), lastDays: Number(values.days) })
    const { scores, findings } = await scoreRun(run, readLevels(), now)
    writeBehaviour(outDir, [{ label, from: run.from, to: run.to, scores }], findings, `behaviour ${label}`)
    for (const s of scores) console.log(`${s.alarm ? 'ALARM' : 'ok   '} ${s.title}: ${s.value}`)
    console.log(`${findings.length} findings; report in ${outDir}`)
  } catch (e) {
    const finding = didNotRun({ id: `behaviour.read|${label}`, area: 'behaviour', title: `Reading the run ${label}` }, e, now)
    writeBehaviour(outDir, [], [finding], `behaviour ${label}`)
    console.log(finding.what)
  }
  return 0
}
