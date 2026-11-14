import { describe, expect, it } from 'vitest'
import { CHUNK_SIZE, MAX_PLACES, chunkAt, chunkCentre, choosePlacement, chooseRequestChunk, createLand, layoutProblems, placementCandidates, rawHeight, toLandPlace, type LandPlace } from '../src/land.ts'

const home: LandPlace = { id: 'home', chunk: [0, 0], offset: [-8, 0], footprint: [12, 10], tags: ['home'] }
const workshop: LandPlace = { id: 'workshop', chunk: [0, 0], offset: [8, 0], footprint: [12, 10], tags: ['making'] }
const signals: LandPlace = { id: 'signals', chunk: [1, 0], footprint: [16, 12], tags: ['lighthouses', 'signals'] }
const moss: LandPlace = { id: 'moss', chunk: [0, 1], footprint: [10, 10], tags: ['moss'] }

describe('chunks (spec 4.1: 32 meter chunks, chunk (cx, cz) covers x from 32 cx to 32 cx + 32)', () => {
  it('finds the chunk of a world point, also below zero', () => {
    expect(CHUNK_SIZE).toBe(32)
    expect(chunkAt(0, 0)).toEqual([0, 0])
    expect(chunkAt(31.99, 31.99)).toEqual([0, 0])
    expect(chunkAt(32, 0)).toEqual([1, 0])
    expect(chunkAt(-0.01, -0.01)).toEqual([-1, -1])
    expect(chunkAt(-32, -33)).toEqual([-1, -2])
  })
  it('puts a chunk\'s centre in the middle of it', () => {
    expect(chunkCentre([0, 0])).toEqual([16, 16])
    expect(chunkCentre([-1, 2])).toEqual([-16, 80])
  })
})

describe('owned, edge and fog (spec 4.1)', () => {
  const land = createLand(7, [home, workshop, signals])
  it('calls a chunk with a place owned, the empty ones around it (all 8 neighbours) edge, and the rest fog', () => {
    expect(land.classify([0, 0])).toBe('owned')
    expect(land.classify([1, 0])).toBe('owned')
    expect(land.classify([-1, -1])).toBe('edge')
    expect(land.classify([0, 1])).toBe('edge')
    expect(land.classify([1, 1])).toBe('edge')
    expect(land.classify([2, 1])).toBe('edge')
    expect(land.classify([3, 0])).toBe('fog')
    expect(land.classify([0, -2])).toBe('fog')
  })
  it('lists the places in a chunk', () => {
    expect(land.placesIn([0, 0]).map((p) => p.id).sort()).toEqual(['home', 'workshop'])
    expect(land.placesIn([1, 0]).map((p) => p.id)).toEqual(['signals'])
    expect(land.placesIn([5, 5])).toEqual([])
  })
})

describe('terrain height (spec 4.1: a seeded noise of world coordinates, so chunks join without seams)', () => {
  const land = createLand(7, [home, workshop, signals, moss])
  it('is the same every time for one seed, and different for another', () => {
    expect(rawHeight(7, 40.5, -12.25)).toBe(rawHeight(7, 40.5, -12.25))
    expect(rawHeight(7, 40.5, -12.25)).not.toBe(rawHeight(8, 40.5, -12.25))
    expect(land.heightAt(40.5, -12.25)).toBe(createLand(7, [home, workshop, signals, moss]).heightAt(40.5, -12.25))
  })
  it('stays within a gentle range', () => {
    for (let i = 0; i < 400; i++) {
      const h = rawHeight(3, i * 7.3 - 900, i * 3.1 - 500)
      expect(Math.abs(h)).toBeLessThanOrEqual(6)
    }
  })
  it('has no seam: the height just either side of a chunk edge is the same, also under places', () => {
    for (const edge of [0, 32, 64, -32]) {
      for (let k = 0; k < 40; k++) {
        const z = -50 + k * 3.7
        expect(Math.abs(land.heightAt(edge - 1e-6, z) - land.heightAt(edge + 1e-6, z))).toBeLessThan(1e-3)
        expect(Math.abs(land.heightAt(z, edge - 1e-6) - land.heightAt(z, edge + 1e-6))).toBeLessThan(1e-3)
      }
    }
  })
  it('is flat under a place\'s footprint, at the height of the ground at its middle', () => {
    const [cx, cz] = chunkCentre(signals.chunk)
    const base = land.heightAt(cx, cz)
    for (const [dx, dz] of [[-7.9, -5.9], [7.9, 5.9], [0, 0], [-7.9, 5.9]] as const) expect(land.heightAt(cx + dx, cz + dz)).toBeCloseTo(base, 6)
  })
  it('flattens each of two places that share a chunk, to its own height', () => {
    const [cx, cz] = chunkCentre([0, 0])
    expect(land.heightAt(cx - 8 - 5.9, cz)).toBeCloseTo(land.heightAt(cx - 8, cz), 6)
    expect(land.heightAt(cx + 8 + 5.9, cz)).toBeCloseTo(land.heightAt(cx + 8, cz), 6)
  })
  it('is the plain ground far from every place, and blends smoothly between (no step)', () => {
    expect(land.heightAt(300, 300)).toBe(rawHeight(7, 300, 300))
    const [cx, cz] = chunkCentre(signals.chunk)
    let last = land.heightAt(cx + 8, cz)
    for (let x = cx + 8; x <= cx + 8 + 12; x += 0.1) {
      const h = land.heightAt(x, cz)
      expect(Math.abs(h - last)).toBeLessThan(0.25)
      last = h
    }
  })
})

describe('where a new place goes (spec 4.2)', () => {
  it('only offers empty chunks that touch an owned chunk on a side, never a diagonal, never an owned one', () => {
    const c = placementCandidates([home, workshop, signals]).map((x) => x.join(','))
    expect(c.sort()).toEqual(['-1,0', '0,-1', '0,1', '1,-1', '1,1', '2,0'].sort())
  })

  it('takes the chunk with the best score: 1 for each shared tag and 0.5 for a related place the found named, over the grid distance', () => {
    // [1,1] is next to signals (shares signals: 1/1) and to moss (named related: 0.5/1); nowhere else scores as much.
    expect(choosePlacement([home, workshop, signals, moss], { tags: ['signals'], related: ['moss'] }, 1)).toEqual([1, 1])
    // Without the naming, the tie between the chunks next to signals is broken by the seed.
    const next = choosePlacement([home, workshop, signals], { tags: ['signals'], related: [] }, 1)
    expect(['2,0', '1,1', '1,-1']).toContain(next!.join(','))
  })

  it('divides by the grid distance, so a place two chunks away counts for half as much', () => {
    // Place: a line home - a - b. New tags match b (far end) only; the chunk next to b beats the chunk next to home.
    const a: LandPlace = { id: 'a', chunk: [1, 0], footprint: [10, 10], tags: ['x'] }
    const b: LandPlace = { id: 'b', chunk: [2, 0], footprint: [10, 10], tags: ['y'] }
    expect(choosePlacement([home, workshop, a, b], { tags: ['y'], related: [] }, 1)!.join(',')).toMatch(/^(3,0|2,1|2,-1)$/)
  })

  it('breaks a tie with the seeded PRNG: the same seed always gives the same chunk, other seeds can give others', () => {
    const results = new Set<string>()
    for (let seed = 0; seed < 40; seed++) {
      const first = choosePlacement([home, workshop], { tags: [], related: [] }, seed)!
      expect(choosePlacement([home, workshop], { tags: [], related: [] }, seed)).toEqual(first)
      results.add(first.join(','))
    }
    expect(results.size).toBeGreaterThan(1)
    for (const r of results) expect(['1,0', '-1,0', '0,1', '0,-1']).toContain(r)
  })

  it('stops at 64 places', () => {
    const many: LandPlace[] = Array.from({ length: MAX_PLACES }, (_, i) => ({ id: `p${i}`, chunk: [i % 8, Math.floor(i / 8)], footprint: [10, 10], tags: [] }))
    expect(MAX_PLACES).toBe(64)
    expect(choosePlacement(many, { tags: [], related: [] }, 1)).toBeNull()
    expect(choosePlacement(many.slice(0, 63), { tags: [], related: [] }, 1)).not.toBeNull()
  })
})

describe('the layout rules (spec 4.1: each chunk holds exactly one place, except the founding clearing)', () => {
  it('accepts Home and the Workshop in the clearing and one place in each other chunk', () => {
    expect(layoutProblems([home, workshop, signals, moss])).toEqual([])
  })
  it('rejects two places in one chunk outside the clearing, and the same chunk twice in the clearing beyond Home and Workshop', () => {
    expect(layoutProblems([home, workshop, signals, { ...moss, chunk: [1, 0] }]).join(' ')).toMatch(/chunk 1,0/)
    expect(layoutProblems([home, workshop, { ...moss, chunk: [0, 0] }]).join(' ')).toMatch(/chunk 0,0/)
  })
  it('rejects a place whose footprint leaves its chunk, or overlaps another place in the clearing', () => {
    expect(layoutProblems([home, workshop, { ...signals, offset: [10, 0] }]).join(' ')).toMatch(/inside its chunk/)
    expect(layoutProblems([home, { ...workshop, offset: [-4, 0] }]).join(' ')).toMatch(/overlap/)
  })
  it('rejects a place that does not touch the rest of the world, so the world stays connected', () => {
    expect(layoutProblems([home, workshop, { ...signals, chunk: [3, 3] }]).join(' ')).toMatch(/not connected/)
  })
  it('rejects more than 64 places', () => {
    const many: LandPlace[] = Array.from({ length: 65 }, (_, i) => ({ id: `p${i}`, chunk: [i % 9, Math.floor(i / 9)], footprint: [10, 10], tags: [] }))
    expect(layoutProblems(many).join(' ')).toMatch(/64/)
  })
})

describe('a place file on the land', () => {
  it('gives the land its chunk, offset, footprint, tags and related places, and the date for ordering paths', () => {
    const file = { id: 'house-of-lights', name: 'House of Lights', purpose: 'p', tags: ['signals'], founded: '2026-11-20', chunk: [1, 0], offset: [0, 0], related: ['workshop'], exterior: { style: 'stone', footprint: [16, 12], floors: 1, palette: 'harbour', sign: 'S' }, rooms: [], exhibits: [], state: { construction: null, lastCareAt: null, neglect: 0, lamps: true }, history: [] }
    expect(toLandPlace(file as never)).toEqual({ id: 'house-of-lights', chunk: [1, 0], offset: [0, 0], footprint: [16, 12], tags: ['signals'], related: ['workshop'], founded: '2026-11-20' })
  })
})

describe('where a place request goes (spec 4.2, 10.3: a staked plot is taken before it is built)', () => {
  const staked = (chunk: [number, number], tags: string[] = []) => ({ chunk, tags })

  it('is the chunk the rule of 4.2 picks when nothing is staked', () => {
    const incoming = { tags: ['signals'], related: [] }
    expect(chooseRequestChunk([home, workshop, signals], [], incoming, 1)).toEqual(choosePlacement([home, workshop, signals], incoming, 1))
  })

  it('never picks a chunk that another request has staked', () => {
    for (let seed = 1; seed < 30; seed++) {
      const c = chooseRequestChunk([home, workshop], [staked([1, 0]), staked([0, 1])], { tags: [], related: [] }, seed)!
      expect(['1,0', '0,1']).not.toContain(c.join(','))
      expect(c.join(',')).not.toBe('0,0')
    }
  })

  it('counts a staked plot as ground a new request may touch, so requests can cluster', () => {
    // Only (1,0) is staked beside the clearing; a related request is pulled next to it.
    const picked = chooseRequestChunk([home, workshop], [staked([1, 0], ['lighthouses'])], { tags: ['lighthouses'], related: [] }, 1)!
    expect([[2, 0], [1, 1], [1, -1]].map((c) => c.join(','))).toContain(picked.join(','))
  })

  it('is the same every time for one seed, and null when the world is full', () => {
    const args = [[home, workshop], [staked([1, 0])], { tags: ['x'], related: [] }, 7] as const
    expect(chooseRequestChunk(...args)).toEqual(chooseRequestChunk(...args))
    const many: LandPlace[] = Array.from({ length: MAX_PLACES - 1 }, (_, i) => ({ id: `p${i}`, chunk: [i, 0], footprint: [10, 10], tags: [] }))
    expect(chooseRequestChunk(many, [staked([100, 100])], { tags: [], related: [] }, 1)).toBeNull()
  })
})

describe('a staked plot is land the visitor can see and stand on (spec 10.3: while a request is open its chunk shows a plot)', () => {
  const staked: [number, number][] = [[1, 0]]

  it('is edge land, like the empty chunks round a place, and never fog', () => {
    const land = createLand(7, [home, workshop], staked)
    expect(land.classify([1, 0])).toBe('edge')
    expect(createLand(7, [home, workshop]).classify([1, 0])).toBe('edge') // it touches the clearing anyway
    const far = createLand(7, [home, workshop], [[4, 4]])
    expect(far.classify([4, 4])).toBe('edge')
    expect(createLand(7, [home, workshop]).classify([4, 4])).toBe('fog')
  })

  it('does not turn the chunks round it into land, or take a chunk that holds a place', () => {
    const far = createLand(7, [home, workshop], [[4, 4]])
    expect(far.classify([5, 4])).toBe('fog')
    expect(far.classify([3, 3])).toBe('fog')
    expect(createLand(7, [home, workshop, signals], [[1, 0]]).classify([1, 0])).toBe('owned')
  })

  it('does not change the ground: the height is the same with or without a plot', () => {
    const a = createLand(7, [home, workshop])
    const b = createLand(7, [home, workshop], [[4, 4], [1, 0]])
    for (const [x, z] of [[10, 10], [60, 20], [140, 140], [-20, 40]]) expect(b.heightAt(x!, z!)).toBe(a.heightAt(x!, z!))
  })
})
