import { describe, expect, it } from 'vitest'
import { readRun } from '../../src/behaviour/read-run.ts'
import { readLevels, scoreRun } from '../../src/behaviour/score.ts'
import { makeRun, WEEK, WITH_A_MEME } from '../behaviour/make-run.ts'

/**
 * Planted (issue #394): one toy on the shelf three times. From the QR 3-day run on PR #389: the sketch "Pixel Fuck" and two full
 * toys with the same title, made from it with no `remixOf`, because the plan named the sketch by its title. A work made from an
 * earlier one says so (`remixOf`), and one that shares a title with a scrap or a put-away work is not a copy on the shelf.
 */
const NOW = new Date('2026-11-26T12:00:00Z')
const pf = (id: string, made: string, over: Record<string, unknown> = {}) => ({ id, title: 'Pixel Fuck', kind: 'tool', about: 'A joke language that paints pixels.', made, size: 'full', ...over })
const QR = [
  pf('pixel-fuck', '2026-11-20T09:05:00.000Z', { size: 'sketch' }),
  pf('pixel-fuck-2', '2026-11-22T09:35:40.000Z'),
  pf('pixel-fuck-3', '2026-11-22T13:45:40.000Z'),
]

const findings = async (works: Record<string, unknown>[]) => {
  const { world, out } = makeRun({ ...WITH_A_MEME, days: WEEK, works: [...WITH_A_MEME.works!, ...works] })
  const r = await scoreRun(readRun({ world, outDir: out, label: 'test' }), readLevels(), NOW)
  return r.findings.filter((f) => f.id === 'behaviour.work-copies')
}

describe('planted: the same work on the shelf more than once', () => {
  it('raises behaviour.work-copies naming the copies', async () => {
    const f = await findings(QR)
    expect(f).toHaveLength(1)
    expect(f[0]!.fingerprint).toBe('behaviour.work-copies|test')
    expect(f[0]!.fixKind).toBe('code')
    expect(f[0]!.title).toContain('"Pixel Fuck"')
    expect(f[0]!.what).toContain('pixel-fuck-2')
    expect(f[0]!.what).toContain('pixel-fuck-3')
  })

  it('raises nothing for remixes that name what they remix, or a title shared with a scrap or a put-away work', async () => {
    expect(
      await findings([
        pf('pixel-fuck', '2026-11-20T09:05:00.000Z', { size: 'sketch' }),
        pf('pixel-fuck-2', '2026-11-22T09:35:40.000Z', { remixOf: 'pixel-fuck' }),
        pf('pixel-fuck-3', '2026-11-22T13:45:40.000Z', { remixOf: 'pixel-fuck-2' }),
        pf('lamp', '2026-11-21T09:00:00.000Z', { title: 'Lamp', status: 'scrap', scrapReason: 'blank page' }),
        pf('lamp-2', '2026-11-22T09:00:00.000Z', { title: 'Lamp' }),
        pf('wall', '2026-11-21T09:00:00.000Z', { title: 'Wall', status: 'retired', retireReason: 'done with it' }),
        pf('wall-2', '2026-11-22T09:00:00.000Z', { title: 'Wall' }),
      ]),
    ).toEqual([])
  })
})
