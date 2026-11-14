import { describe, expect, it } from 'vitest'
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

  it('keeps the first found line, the oldest, when there are several', () => {
    const second = { at: '2026-11-14T10:00:00Z', verb: 'found', summary: 'Another.' }
    const h = [founding, second, ...Array.from({ length: 60 }, (_, i) => line(i))]
    const out = capHistory(h, 50)
    expect(out[0]).toEqual(founding)
    expect(out).toHaveLength(50)
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
