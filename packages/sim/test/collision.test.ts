import { describe, expect, it } from 'vitest'
import { COLLISION_FRESH_DAYS, COLLISION_MIN_DISTANCE, COLLISION_REUSE_DAYS, drawCollision, type CollisionPlace, type CollisionSouvenir } from '../src/collision.ts'

const place = (id: string, chunk: [number, number], tags: string[]): CollisionPlace => ({ id, chunk, tags })
const souv = (id: string, placedIn: string | null, topics: string[]): CollisionSouvenir => ({ id, placedIn, topics })

// A row of places: a (0,0), b (1,0), c (2,0), d (4,0).
const places = [place('a', [0, 0], ['maps']), place('b', [1, 0], ['maps', 'tides']), place('c', [2, 0], ['knots']), place('d', [4, 0], ['bells'])]
const souvenirs = [souv('s-a', 'a', ['maps']), souv('s-b', 'b', ['tides']), souv('s-c', 'c', ['knots']), souv('s-d', 'd', ['bells'])]
const interests = ['maps', 'tides', 'knots', 'bells']

const dist = (p: CollisionPlace, q: CollisionPlace) => Math.abs(p.chunk[0] - q.chunk[0]) + Math.abs(p.chunk[1] - q.chunk[1])

describe('drawCollision (spec 12.4, item 5)', () => {
  it('is two chunks apart at least, and by the grid distance of 4.2', () => {
    expect(COLLISION_MIN_DISTANCE).toBe(2)
  })

  it('pairs souvenirs from two places at least 2 chunks apart, never the same place twice', () => {
    for (let i = 0; i < 80; i++) {
      const c = drawCollision({ places, souvenirs: souvenirs.slice(), interests: [] }, 5, `k${i}`)
      expect(c?.how).toBe('places')
      if (c?.how !== 'places') continue
      const [p, q] = [places.find((x) => x.id === c.a.place)!, places.find((x) => x.id === c.b.place)!]
      expect(c.a.place).not.toBe(c.b.place)
      expect(dist(p, q)).toBeGreaterThanOrEqual(2)
      expect(c.a.souvenir).not.toBe(c.b.souvenir)
    }
  })

  it('is the same for the same seed and key, and varies with the key', () => {
    const run = (key: string) => JSON.stringify(drawCollision({ places, souvenirs, interests: [] }, 5, key))
    expect(run('x')).toBe(run('x'))
    expect(new Set(Array.from({ length: 60 }, (_, i) => run(`k${i}`))).size).toBeGreaterThan(3)
  })

  it('does not depend on the order the lists come in', () => {
    const forward = JSON.stringify(drawCollision({ places, souvenirs, interests: [] }, 5, 'k'))
    const backward = JSON.stringify(drawCollision({ places: [...places].reverse(), souvenirs: [...souvenirs].reverse(), interests: [] }, 5, 'k'))
    expect(backward).toBe(forward)
  })

  it('falls back to two interests that share no place when no two places are far enough apart', () => {
    const near = [place('a', [0, 0], ['maps']), place('b', [1, 0], ['tides', 'maps']), place('c', [0, 1], ['knots'])]
    const kept = [souv('s1', 'a', ['maps']), souv('s2', 'b', ['tides']), souv('s3', null, ['knots']), souv('s4', null, ['knots'])]
    // Within 2 chunks of each other, so no places pair. maps+tides share place b; maps+knots and tides+knots share none.
    for (let i = 0; i < 60; i++) {
      const c = drawCollision({ places: near, souvenirs: kept, interests: ['maps', 'tides', 'knots'] }, 9, `k${i}`)
      expect(c?.how).toBe('interests')
      if (c?.how !== 'interests') continue
      const pair = [c.a.interest, c.b.interest].sort().join('+')
      expect(['knots+maps', 'knots+tides']).toContain(pair)
      expect(c.a.souvenir).not.toBe(c.b.souvenir)
    }
  })

  it('takes a souvenir for each interest from those that carry it, a pile souvenir included', () => {
    const near = [place('a', [0, 0], ['maps']), place('b', [1, 0], ['tides'])]
    const kept = [souv('s1', 'a', ['maps']), souv('s2', null, ['tides'])]
    const c = drawCollision({ places: near, souvenirs: kept, interests: ['maps', 'tides'] }, 1, 'k')
    expect(c).toMatchObject({ how: 'interests' })
    expect(c && c.how === 'interests' && [c.a.souvenir, c.b.souvenir].sort()).toEqual(['s1', 's2'])
  })

  it('is null with nothing to put together: no souvenirs, one place, or interests that all share a place', () => {
    expect(drawCollision({ places, souvenirs: [], interests }, 1, 'k')).toBeNull()
    expect(drawCollision({ places: [places[0]!], souvenirs: [souv('s', 'a', ['maps'])], interests: ['maps'] }, 1, 'k')).toBeNull()
    const one = [place('a', [0, 0], ['maps', 'tides'])]
    expect(drawCollision({ places: one, souvenirs: [souv('s1', 'a', ['maps']), souv('s2', 'a', ['tides'])], interests: ['maps', 'tides'] }, 1, 'k')).toBeNull()
  })

  it('ignores a souvenir whose place does not exist, and a souvenir with no topic in interest mode', () => {
    const c = drawCollision({ places, souvenirs: [souv('lost', 'gone', ['maps']), souv('s-a', 'a', []), souv('s-d', 'd', [])], interests: ['maps'] }, 1, 'k')
    // Only places a and d hold souvenirs; they are 4 apart, so they pair.
    expect(c).toMatchObject({ how: 'places' })
    expect(c && c.how === 'places' && [c.a.souvenir, c.b.souvenir].sort()).toEqual(['s-a', 's-d'])
  })

  it('uses both ways over many draws when both are possible', () => {
    const kept = [...souvenirs, souv('p1', null, ['maps']), souv('p2', null, ['bells'])]
    const hows = new Set(Array.from({ length: 80 }, (_, i) => drawCollision({ places, souvenirs: kept, interests }, 2, `k${i}`)?.how))
    expect(hows).toEqual(new Set(['places', 'interests']))
  })
})

describe('drawCollision with what is fresh and what was used lately (audit 17 Nov)', () => {
  const NOW = Date.parse('2026-11-17T12:00:00Z')
  const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
  const dated = (ageOf: Record<string, number>): CollisionSouvenir[] => souvenirs.map((s) => ({ ...s, at: daysAgo(ageOf[s.id] ?? 10) }))
  const ids = (c: ReturnType<typeof drawCollision>) => (c ? [c.a.souvenir, c.b.souvenir] : [])

  it('keeps the windows it names: fresh is the last 3 days, a souvenir is not used again for 7', () => {
    expect(COLLISION_FRESH_DAYS).toBe(3)
    expect(COLLISION_REUSE_DAYS).toBe(7)
  })

  it('never offers a souvenir that was in a collision in the last 7 days', () => {
    for (let i = 0; i < 80; i++) {
      const c = drawCollision({ places, souvenirs: dated({}), interests: [], nowMs: NOW, usedRecently: ['s-a', 's-d'] }, 5, `k${i}`)
      for (const id of ids(c)) expect(['s-a', 's-d']).not.toContain(id)
    }
  })

  it('offers nothing when every souvenir that could be paired was used lately', () => {
    expect(drawCollision({ places, souvenirs: dated({}), interests: [], nowMs: NOW, usedRecently: ['s-a', 's-b', 's-c', 's-d'] }, 5, 'k')).toBeNull()
  })

  it('prefers a pair with a souvenir from the last 3 days, when there is one', () => {
    for (let i = 0; i < 60; i++) {
      const c = drawCollision({ places, souvenirs: dated({ 's-a': 1 }), interests: [], nowMs: NOW }, 5, `k${i}`)
      expect(ids(c)).toContain('s-a')
    }
  })

  it('falls back to the older souvenirs when nothing is fresh, and when the fresh one has no partner', () => {
    expect(drawCollision({ places, souvenirs: dated({}), interests: [], nowMs: NOW }, 5, 'k')).not.toBeNull()
    // s-b is fresh but sits one chunk from a and c, so only d can pair with it.
    const c = drawCollision({ places, souvenirs: dated({ 's-b': 0 }), interests: [], nowMs: NOW }, 5, 'k')
    expect(ids(c)).toContain('s-b')
    expect(ids(c)).toContain('s-d')
  })

  it('prefers a fresh pair among souvenirs drawn from two interests, too', () => {
    const noPlaces: CollisionPlace[] = []
    const two = [souv('old-1', null, ['maps']), souv('old-2', null, ['maps']), souv('new-1', null, ['maps']), souv('t-1', null, ['tides'])].map((s) => ({ ...s, at: daysAgo(s.id === 'new-1' ? 0 : 20) }))
    for (let i = 0; i < 60; i++) {
      const c = drawCollision({ places: noPlaces, souvenirs: two, interests: ['maps', 'tides'], nowMs: NOW }, 5, `k${i}`)
      expect(ids(c)).toContain('new-1')
    }
  })

  it('draws as before when it is given no times and no list of used souvenirs', () => {
    for (let i = 0; i < 20; i++) expect(drawCollision({ places, souvenirs, interests }, 5, `k${i}`)).toEqual(drawCollision({ places, souvenirs: souvenirs.slice(), interests: interests.slice() }, 5, `k${i}`))
  })
})
