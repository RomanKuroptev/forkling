import { describe, expect, it } from 'vitest'
import { readRun } from '../../src/behaviour/read-run.ts'
import { readLevels, scoreRun } from '../../src/behaviour/score.ts'
import { makeRun, WEEK, WITH_A_MEME } from '../behaviour/make-run.ts'

/**
 * Planted (issue #378): diary lines kept cut in the middle of a sentence. The lines are real, from the R2 run's journal of
 * 2026-11-19 and 2026-11-20, as the old cut at a word stored them. A diary whose lines end at a sentence end, or with an ellipsis
 * where a line had to be cut, raises nothing.
 */
const NOW = new Date('2026-11-26T12:00:00Z')
const R2_CUT = [
  'I sketched the hillside again and put it in the Five Lamps room. Still no check against my terrain notes. A cat polishing a map it never',
  'I read about live coding, patching, algorave and esoteric languages. Thue rewrites strings until nothing changes. My loops do that too, with',
]
const GOOD = ['The Hillside Room took three tries.', 'Was it a find or a wish?', 'I read about live coding, patching, algorave and esoteric languages and kept going from one page to the next without ever stopping for a…']

const findings = async (diary: (d: number) => string[] | undefined) => {
  const { world, out } = makeRun({ ...WITH_A_MEME, days: WEEK, diary })
  const r = await scoreRun(readRun({ world, outDir: out, label: 'test' }), readLevels(), NOW)
  return r.findings.filter((f) => f.id === 'behaviour.diary-cut')
}

describe('planted: diary lines cut in the middle of a sentence', () => {
  it('raises behaviour.diary-cut with the cut lines as evidence', async () => {
    const f = await findings((d) => (d === 0 ? R2_CUT : GOOD))
    expect(f).toHaveLength(1)
    expect(f[0]!.fingerprint).toBe('behaviour.diary-cut|test')
    expect(f[0]!.fixKind).toBe('code')
    expect(f[0]!.title).toContain('2 diary lines')
    expect(f[0]!.what).toContain('A cat polishing a map it never')
  })

  it('raises nothing for lines that end a sentence or end with an ellipsis', async () => {
    expect(await findings(() => GOOD)).toEqual([])
  })
})
