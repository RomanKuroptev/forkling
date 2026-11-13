import { describe, expect, it } from 'vitest'
import type { LandPlace } from '../src/land.ts'
import { PATH_WIDTH, allPaths, derivePaths, findChunkPath, pathPolyline } from '../src/paths.ts'

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

describe('allPaths: the founding paths and the paths an expand added (spec 4.3, 5.4)', () => {
  // home (0,0), workshop (0,0) shares it, a (1,0), b (2,0), c (1,1): a row with a spur.
  const withPaths = (p: LandPlace & { founded: string }, paths: { to: string; at: string }[]) => ({ ...p, paths })
  const world = () => [
    withPaths(place('home', [0, 0], ['home'], '2026-11-01'), []),
    withPaths(place('a', [1, 0], ['maps'], '2026-11-02', ['home']), []),
    withPaths(place('b', [2, 0], ['tides'], '2026-11-03', ['a']), []),
    withPaths(place('c', [1, 1], ['knots'], '2026-11-04', ['a']), []),
  ]

  it('is the founding paths, and nothing more, when no expand added one', () => {
    expect(allPaths(world())).toEqual(derivePaths(world()).map((p) => ({ ...p, kind: 'founding' })))
  })

  it('adds each path an expand made, routed over the owned chunks, and marks it as one', () => {
    const w = world()
    w[3] = withPaths(w[3]!, [{ to: 'b', at: '2026-11-10' }])
    const added = allPaths(w).filter((p) => p.kind === 'expand')
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ from: 'c', to: 'b' })
    expect(added[0]!.chunks[0]).toEqual([1, 1])
    expect(added[0]!.chunks.at(-1)).toEqual([2, 0])
    for (const c of added[0]!.chunks) expect(['0,0', '1,0', '2,0', '1,1']).toContain(key(c))
  })

  it('draws a path that two places both made once, and one that founding already made not at all', () => {
    const w = world()
    w[3] = withPaths(w[3]!, [{ to: 'b', at: '2026-11-10' }, { to: 'a', at: '2026-11-11' }])
    w[2] = withPaths(w[2]!, [{ to: 'c', at: '2026-11-12' }, { to: 'a', at: '2026-11-12' }])
    const pairs = allPaths(w).map((p) => [p.from, p.to].sort().join('+'))
    expect(pairs.filter((p) => p === 'b+c')).toHaveLength(1)
    expect(pairs.filter((p) => p === 'a+c')).toHaveLength(1) // founding made c -> a
    expect(pairs.filter((p) => p === 'a+b')).toHaveLength(1) // founding made b -> a
  })

  it('leaves out a path to a place that does not exist, and one with no way through the owned chunks', () => {
    const w = world()
    w[1] = withPaths(w[1]!, [{ to: 'nowhere', at: '2026-11-10' }])
    expect(allPaths(w).filter((p) => p.kind === 'expand')).toEqual([])
    const far = [...world(), withPaths(place('z', [9, 9], ['far'], '2026-11-05'), [])]
    far[1] = withPaths(far[1]!, [{ to: 'z', at: '2026-11-10' }])
    expect(allPaths(far).filter((p) => p.kind === 'expand' && p.to === 'z')).toEqual([])
  })

  it('is the same every time and does not depend on the order of the places', () => {
    const w = world()
    w[3] = withPaths(w[3]!, [{ to: 'b', at: '2026-11-10' }])
    expect(JSON.stringify(allPaths([...w].reverse()))).toBe(JSON.stringify(allPaths(w)))
  })
})
