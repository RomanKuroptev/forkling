import { describe, expect, it } from 'vitest'
import { fightFindings, type SurfaceFight } from '../../src/world/fights.ts'

const fight = (place: string, a: string, b: string, area: number, at: [number, number, number]): SurfaceFight => ({ place, a, b, area, at, normal: [0, 0, 1] })

describe("a sign's painted face fighting its post (issue 406)", () => {
  it("planted: Home's sign face flush with the fronts of both its posts is one finding, pointing at the sign's geometry", () => {
    const found = fightFindings([fight('home', 'the sign post', 'the sign board', 0.144, [10, 1.5, 23.66]), fight('home', 'the sign post', 'the sign board', 0.144, [12.4, 1.5, 23.66])], 'day-7')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ id: 'world.surfaces-fight', fingerprint: 'world.surfaces-fight|day-7|home', severity: 'minor', fixKind: 'look', where: 'apps/viewer/src/world/signGeometry.ts' })
    expect(found[0]!.what).toContain('the sign post and the sign board, standing upright')
  })

  it('a fight of the building itself still points at the building', () => {
    expect(fightFindings([fight('home', 'the body of the building', 'a floor', 0.5, [0, 1, 0])], 'day-7')[0]!.where).toBe('apps/viewer/src/world/building.ts')
  })
})
