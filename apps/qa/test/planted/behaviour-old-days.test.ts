import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readRun } from '../../src/behaviour/read-run.ts'
import { scoreRuns } from '../../src/behaviour/runner.ts'
import { readLevels } from '../../src/behaviour/score.ts'
import { makeRun } from '../behaviour/make-run.ts'

/**
 * Planted (behaviour.reviewer|fixture-clock-overlap): a start world that already holds six logged days (the R2 run in day-7),
 * then one day of the run itself. Even when the run's summary claims the old days too, the scores count only the run's own
 * days: nothing the world made, read or did before the run started.
 */

const OLD = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25']
const RUN_DAY = '2026-11-26'

describe('planted: a fixture with logged days, scored after a run', () => {
  it('reading the run counts none of the old days', () => {
    const { world, out } = makeRun({ days: [...OLD, RUN_DAY] })
    const run = readRun({ world, outDir: out, label: 'seed-0', notBefore: RUN_DAY })
    expect(run.from).toBe(RUN_DAY)
    expect(run.days).toEqual([RUN_DAY])
    expect(run.made.map((m) => m.date)).toEqual([RUN_DAY, RUN_DAY])
    expect(run.steps.every((s) => s.date === RUN_DAY)).toBe(true)
    expect(run.report.made.items.every((m) => m.at >= `${RUN_DAY}T`)).toBe(true)
  })

  it('scoring the seed scores only its own window', async () => {
    const { world, out } = makeRun({ days: [...OLD, RUN_DAY] })
    const root = mkdtempSync(join(tmpdir(), 'qa-old-days-'))
    const { scored } = await scoreRuns([{ label: 'seed-0', world, outDir: out, from: RUN_DAY }], readLevels(), 'old-days', root, new Date('2026-11-27T12:00:00Z'))
    expect(scored.map((s) => [s.from, s.to])).toEqual([[RUN_DAY, RUN_DAY]])
    const visual = scored[0]!.scores.find((s) => s.id === 'visual-every-day')
    expect(visual?.value).toBe('1 of 1 days')
  })
})
