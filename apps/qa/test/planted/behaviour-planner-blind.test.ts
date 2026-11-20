import { describe, expect, it } from 'vitest'
import { readRun } from '../../src/behaviour/read-run.ts'
import { readLevels, scoreRun } from '../../src/behaviour/score.ts'
import { makeRun, VISITS, WEEK, WITH_A_MEME, WORKS_CHECKED } from '../behaviour/make-run.ts'

/**
 * Planted (issues #400 and #422): the planner was never shown the visits nor what the work check found, so Merge waited for
 * visitors it could not notice and planned to run sketches that had already run. The prompts here are the R2 run's shape: a
 * morning and a decide prompt after a work was made, with neither block. Prompts that carry both raise nothing.
 */
const NOW = new Date('2026-11-26T12:00:00Z')
const BLIND = 'Tinker kinds: art, game, meme (a meme costs 30 points). Starting points: https://imgflip.com/meme/181913649'

const findings = async (user: string) => {
  // The work is made before the day's prompts (they are written at 08:00 on the first day).
  const works = WITH_A_MEME.works!.map((w) => ({ ...w, made: '2026-11-19T06:00:00.000Z' }))
  const { world, out } = makeRun({ ...WITH_A_MEME, works, days: WEEK, prompts: [{ kind: 'morning', user }, { kind: 'decide', user }] })
  const r = await scoreRun(readRun({ world, outDir: out, label: 'test' }), readLevels(), NOW)
  return r.findings.filter((f) => f.id === 'behaviour.visits-unseen' || f.id === 'behaviour.work-check-unseen')
}

describe('planted: the planner is blind to its visits and its work check', () => {
  it('raises both, as data fixes', async () => {
    const f = await findings(BLIND)
    expect(f.map((x) => x.id).sort()).toEqual(['behaviour.visits-unseen', 'behaviour.work-check-unseen'])
    expect(f.every((x) => x.fixKind === 'data' && x.severity === 'major')).toBe(true)
    expect(f.find((x) => x.id === 'behaviour.visits-unseen')!.fingerprint).toBe('behaviour.visits-unseen|test')
  })

  it('raises nothing when the prompts carry both', async () => {
    expect(await findings(`${BLIND}${VISITS}${WORKS_CHECKED}`)).toEqual([])
  })

  it('raises nothing for a run with no captured prompts (live)', async () => {
    const { world } = makeRun({ ...WITH_A_MEME, days: WEEK })
    const r = await scoreRun(readRun({ world, outDir: null, label: 'test' }), readLevels(), NOW)
    expect(r.findings.filter((f) => f.id.endsWith('-unseen'))).toEqual([])
  })
})
