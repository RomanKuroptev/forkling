import { describe, expect, it } from 'vitest'
import { lastSizeChange } from '../src/build-rules.ts'
import { capHistory } from '../src/place-history.ts'

const line = (n: number, verb = 'tend') => ({ at: `2026-11-${String((n % 28) + 1).padStart(2, '0')}T10:00:00Z`, verb, summary: `line ${n}` })
const founding = { at: '2026-11-01T09:00:00Z', verb: 'found', summary: 'Asked for by Merge, built by Roman with Claude Code.' }

describe('capHistory: a place keeps its last 50 history lines, and always the one that says who had the idea (spec 5.1, 10.3)', () => {
  it('leaves a short history alone, as a copy', () => {
    const h = [founding, line(1), line(2)]
    const out = capHistory(h, 50)
    expect(out).toEqual(h)
    expect(out).not.toBe(h)
  })

  it('keeps the founding line when the history is cut, and the newest lines after it', () => {
    const h = [founding, ...Array.from({ length: 60 }, (_, i) => line(i))]
    const out = capHistory(h, 50)
    expect(out).toHaveLength(50)
    expect(out[0]).toEqual(founding)
    expect(out.at(-1)).toEqual(line(59))
    expect(out[1]).toEqual(line(11)) // 49 newest of the 60: lines 11 to 59
  })

  it('does not repeat the founding line when it is still among the newest', () => {
    const h = [...Array.from({ length: 10 }, (_, i) => line(i)), founding, ...Array.from({ length: 45 }, (_, i) => line(100 + i))]
    const out = capHistory(h, 50)
    expect(out).toHaveLength(50)
    expect(out.filter((x) => x.verb === 'found')).toHaveLength(1)
    expect(out.at(-1)).toEqual(line(144))
  })

  it('keeps every founding line when there are several (the plain version, then the full one), in their order', () => {
    const second = { at: '2026-11-14T10:00:00Z', verb: 'found', summary: 'Another.' }
    const h = [founding, second, ...Array.from({ length: 60 }, (_, i) => line(i))]
    const out = capHistory(h, 50)
    expect(out.slice(0, 2)).toEqual([founding, second])
    expect(out).toHaveLength(50)
    expect(out.at(-1)).toEqual(line(59))
  })

  it('cuts to the newest when the history has no founding line', () => {
    const h = Array.from({ length: 60 }, (_, i) => line(i))
    const out = capHistory(h, 50)
    expect(out).toHaveLength(50)
    expect(out[0]).toEqual(line(10))
    expect(out.at(-1)).toEqual(line(59))
  })

  it('never changes the list it is given', () => {
    const h = [founding, ...Array.from({ length: 60 }, (_, i) => line(i))]
    const copy = [...h]
    capHistory(h, 50)
    expect(h).toEqual(copy)
  })
})

describe('capHistory keeps what the rules read (spec 2.5 reads the last size change)', () => {
  const expand = { at: '2026-11-05T10:00:00Z', verb: 'expand', summary: 'Added a room.' }

  it('keeps the newest expand line however many tends follow it, so the expand gate does not loosen', () => {
    const h = [founding, expand, ...Array.from({ length: 80 }, (_, i) => line(i))]
    const out = capHistory(h, 50)
    expect(out).toHaveLength(50)
    expect(out).toContainEqual(expand)
    expect(lastSizeChange({ founded: '2026-11-01', history: out as never })).toBe(Date.parse(expand.at))
  })

  it('keeps only the newest expand when there are several, and stays in the order it was given', () => {
    const older = { at: '2026-11-03T10:00:00Z', verb: 'expand', summary: 'Added a room.' }
    const h = [founding, older, expand, ...Array.from({ length: 80 }, (_, i) => line(i))]
    const out = capHistory(h, 50)
    expect(out).toContainEqual(expand)
    expect(out).not.toContainEqual(older)
    expect(out.map((x) => h.indexOf(x))).toEqual([...out.map((x) => h.indexOf(x))].sort((a, b) => a - b))
  })

  it('leaves exactly 50 alone and cuts 51 to 50', () => {
    const fifty = [founding, ...Array.from({ length: 49 }, (_, i) => line(i))]
    expect(capHistory(fifty, 50)).toEqual(fifty)
    expect(capHistory([...fifty, line(99)], 50)).toHaveLength(50)
  })

  it('is idempotent: cutting a cut history changes nothing', () => {
    const h = [founding, expand, ...Array.from({ length: 80 }, (_, i) => line(i))]
    const once = capHistory(h, 50)
    expect(capHistory(once, 50)).toEqual(once)
  })

  it('never returns more than max, even when the lines that must stay are many, and copes with a max of 1 or 0', () => {
    const founds = Array.from({ length: 6 }, (_, i) => ({ at: `2026-11-0${i + 1}T10:00:00Z`, verb: 'found', summary: `found ${i}` }))
    expect(capHistory([...founds, ...Array.from({ length: 5 }, (_, i) => line(i))], 4)).toHaveLength(4)
    expect(capHistory(founds, 1)).toEqual([founds[5]])
    expect(capHistory(founds, 0)).toEqual([])
    expect(capHistory([line(1), line(2)], 1)).toEqual([line(2)])
  })
})
