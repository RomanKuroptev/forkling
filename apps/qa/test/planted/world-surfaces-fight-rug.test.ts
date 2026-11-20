import { describe, expect, it } from 'vitest'
import { fightFindings, type SurfaceFight } from '../../src/world/fights.ts'

describe('no rug in the plane of its floor (issue 432)', () => {
  it("planted: the Five Lamps Room's round rug with its top in the floor's top is a major finding, pointed at the inside's layout", () => {
    // As `__qa.fights()` lists it: the rug's inner disc (a cylinder, 1.3 m across) in the plane of the floor's top, facing up.
    const rug: SurfaceFight = { place: 'hillside-room-five-lamps', a: 'a floor', b: 'part lamp-room/13 (rug-round)', area: 1.69, at: [16, 0.14, -15.1], normal: [0, 1, 0] }
    const [found, ...rest] = fightFindings([rug], 'day-7')
    expect(rest).toEqual([])
    expect(found!.fingerprint).toBe('world.surfaces-fight|day-7|hillside-room-five-lamps')
    expect(found!.severity).toBe('major')
    expect(found!.what).toContain('a floor and part lamp-room/13 (rug-round), facing up')
    expect(found!.where).toBe('apps/viewer/src/world/kitGeometry.ts')
  })

  it("a building's own faces still point at the building", () => {
    const [found] = fightFindings([{ place: 'workshop', a: 'the base of the building', b: 'a floor', area: 1, at: [0, 0.14, 0], normal: [0, 1, 0] }], 'day-7')
    expect(found!.where).toBe('apps/viewer/src/world/building.ts')
  })
})
