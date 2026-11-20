import { describe, expect, it } from 'vitest'
import { START_VIEW_SHARE, classifyRays, startViewFindings, viewRays, type ViewKind } from '../../src/world/start-view.ts'

const kinds = (sky: number, land: number, thing: number): ViewKind[] => [...Array(sky).fill('sky'), ...Array(land).fill('land'), ...Array(thing).fill('thing')]

describe('the arrival view sees sky and land (issue 452; audit QW.2)', () => {
  it('casts its rays across the whole view, the top row up and the bottom row down, round the way the visitor faces', () => {
    const rays = viewRays(Math.PI, 0, 1.6)
    expect(rays).toHaveLength(99)
    expect(rays[0]![1]).toBeGreaterThan(0.35)
    expect(rays[98]![1]).toBeLessThan(-0.35)
    // Facing 180 deg is facing -z.
    expect(rays[49]![2]).toBeCloseTo(-1, 6)
  })

  it('sees the sky where a ray meets nothing, the land where it meets the ground outside a place, a thing elsewhere', () => {
    const eye: [number, number, number] = [8, 1.6, 31]
    const down: [number, number, number] = [0, -Math.SQRT1_2, -Math.SQRT1_2]
    const flat: [number, number, number] = [0, 0, -1]
    const got = classifyRays(eye, [{ dir: [0, 1, 0], hit: null }, { dir: down, hit: { distance: 1.6 * Math.SQRT2 } }, { dir: flat, hit: { distance: 9 } }, { dir: down, hit: { distance: 1.6 * Math.SQRT2 } }], () => 0, [{ x0: 2, z0: 11, x1: 14, z1: 21 }])
    expect(got.slice(0, 3)).toEqual(['sky', 'land', 'thing'])
    // The floor inside a place is on the ground but is not the land.
    expect(classifyRays([8, 1.6, 17.6], [{ dir: down, hit: { distance: 1.6 * Math.SQRT2 } }], () => 0, [{ x0: 2, z0: 11, x1: 14, z1: 21 }])).toEqual(['thing'])
  })

  it('finds nothing when the view has sky and land in it, as from 10 m back', () => {
    expect(startViewFindings('test', kinds(40, 30, 29), [8, 1.6, 31])).toEqual([])
  })

  it('planted: the view under the porch roof, all ceiling, columns and wall, is a major look finding', () => {
    const found = startViewFindings('test', kinds(0, 2, 97), [8, 1.6, 25])
    expect(found.map((f) => f.fingerprint)).toEqual(['world.start-view|test'])
    expect(found[0]).toMatchObject({ severity: 'major', fixKind: 'look', where: 'packages/sim/src/body-world.ts' })
    expect(found[0]!.title).toContain('sky and land')
  })

  it('planted: a view of only sky, or only land, is a finding too', () => {
    const n = Math.floor(99 * START_VIEW_SHARE) - 1
    expect(startViewFindings('test', kinds(99 - n, n, 0), [0, 0, 0])[0]!.title).toContain('land')
    expect(startViewFindings('test', kinds(n, 99 - n, 0), [0, 0, 0])[0]!.title).toContain('sky')
  })
})
