import { describe, expect, it } from 'vitest'
import type { LandPlace } from '../src/land.ts'
import { PATH_WIDTH, derivePaths, findChunkPath, pathPolyline } from '../src/paths.ts'

const key = (c: readonly [number, number]) => `${c[0]},${c[1]}`
const owned = (...cs: [number, number][]) => new Set(cs.map(key))

describe('a route over chunk centres (spec 4.3: A*)', () => {
  it('goes straight along a line of owned chunks', () => {
    expect(findChunkPath([0, 0], [3, 0], owned([0, 0], [1, 0], [2, 0], [3, 0]))).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]])
  })
  it('goes round a gap, by the shortest way, and only over owned chunks', () => {
    const route = findChunkPath([0, 0], [2, 0], owned([0, 0], [0, 1], [1, 1], [2, 1], [2, 0], [0, -1], [1, -1], [2, -1], [3, 0]))!
    expect(route).toHaveLength(5)
    expect(route[0]).toEqual([0, 0])
    expect(route.at(-1)).toEqual([2, 0])
    for (const c of route) expect(owned([0, 0], [0, 1], [1, 1], [2, 1], [2, 0], [0, -1], [1, -1], [2, -1]).has(key(c))).toBe(true)
    for (let i = 1; i < route.length; i++) expect(Math.abs(route[i]![0] - route[i - 1]![0]) + Math.abs(route[i]![1] - route[i - 1]![1])).toBe(1)
  })
  it('is one chunk when the two places share it, and null when there is no way', () => {
    expect(findChunkPath([0, 0], [0, 0], owned([0, 0]))).toEqual([[0, 0]])
    expect(findChunkPath([0, 0], [5, 5], owned([0, 0], [5, 5]))).toBeNull()
  })
  it('always gives the same route for the same world (ties are broken the same way)', () => {
    const world = owned([0, 0], [1, 0], [0, 1], [1, 1])
    const first = findChunkPath([0, 0], [1, 1], world)
    for (let i = 0; i < 10; i++) expect(findChunkPath([0, 0], [1, 1], world)).toEqual(first)
  })
})

describe('the drawn path', () => {
  it('is a line through the chunk centres, 3 meters wide', () => {
    expect(PATH_WIDTH).toBe(3)
    expect(pathPolyline([[0, 0], [1, 0], [1, 1]])).toEqual([[16, 16], [48, 16], [48, 48]])
  })
})

const place = (id: string, chunk: [number, number], tags: string[], founded: string, related: string[] = []): LandPlace & { founded: string } => ({ id, chunk, footprint: [10, 10], tags, related, founded })

describe('the paths a world has (spec 4.3: founding always makes one path, to the best related place or to Home)', () => {
  const home = place('home', [0, 0], ['home'], '2026-11-01')
  const workshop = place('workshop', [0, 0], ['making'], '2026-11-01')

  it('joins each new place to the best-scoring place that was there before it, in the order they were founded', () => {
    const signals = place('signals', [1, 0], ['signals'], '2026-11-10')
    const lamps = place('lamps', [2, 0], ['signals'], '2026-11-12')
    const paths = derivePaths([lamps, home, signals, workshop])
    expect(paths.map((p) => `${p.from}>${p.to}`)).toEqual(['signals>home', 'lamps>signals'])
    expect(paths[1]!.chunks).toEqual([[2, 0], [1, 0]])
  })

  it('goes to Home when nothing is related, and names the place the found called related', () => {
    const moss = place('moss', [0, 1], ['moss'], '2026-11-10')
    const ferns = place('ferns', [0, 2], ['ferns'], '2026-11-12', ['moss'])
    const bog = place('bog', [1, 1], ['bog'], '2026-11-14')
    const paths = derivePaths([home, workshop, moss, ferns, bog])
    expect(paths.map((p) => `${p.from}>${p.to}`)).toEqual(['moss>home', 'ferns>moss', 'bog>home'])
  })

  it('has no path for Home, the Workshop sharing its chunk, or a world of one place', () => {
    expect(derivePaths([home, workshop])).toEqual([])
    expect(derivePaths([home])).toEqual([])
  })

  it('breaks a tie between equally good places in favour of the one founded first', () => {
    const a = place('a', [1, 0], ['x'], '2026-11-05')
    const b = place('b', [0, 1], ['x'], '2026-11-06')
    const c = place('c', [1, 1], ['x'], '2026-11-07')
    expect(derivePaths([home, workshop, a, b, c]).find((p) => p.from === 'c')!.to).toBe('a')
  })
})
