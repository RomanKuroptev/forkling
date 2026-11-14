import { describe, expect, it } from 'vitest'
import type { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { DOOR_HALF, createLand, placeCentre, toLandPlace } from '@forkling/sim'
import { FIXTURE_NOW, makeFixtureWorld } from '@forkling/sim/fixture'
import { constructionInstances, SCAFFOLD_HEAD, SCAFFOLD_REACH } from '../src/world/constructionGeometry.ts'
import { SIGN_W, signSpot } from '../src/world/exhibitGeometry.ts'
import { floorHeight } from '../src/world/kitBase.ts'
import { renderBudget, sceneInstances, interiorsToLoad } from '../src/world/kitGeometry.ts'

const fixture = makeFixtureWorld(1, 10)
const NOW = Date.parse(FIXTURE_NOW)
const building = fixture.places.find((p) => p.state.construction)!
const idle = (p: Place): Place => ({ ...p, state: { ...p.state, construction: null } })
const pos = (m: number[]): [number, number, number] => [m[12]!, m[13]!, m[14]!]

describe('the scaffolding of a place being built (spec 4.5)', () => {
  it('is drawn while the construction goes on, and not before it was asked for, after it ended, or for an idle place', () => {
    expect(constructionInstances(building, 0, NOW).length).toBeGreaterThan(20)
    expect(constructionInstances(idle(building), 0, NOW)).toEqual([])
    const ends = Date.parse(building.state.construction!.finishesAt)
    expect(constructionInstances(building, 0, ends)).toEqual([])
    expect(constructionInstances(building, 0, ends + 1)).toEqual([])
    expect(constructionInstances(building, 0, ends - 1).length).toBeGreaterThan(0)
  })

  it('goes by the file when there is no clock: a construction written down is being built', () => {
    expect(constructionInstances(building, 0).length).toBeGreaterThan(20)
  })

  it('stands round the walls: outside the footprint, within a few meters of it, on the ground, and no higher than a little above the roof', () => {
    const [px, pz] = placeCentre(toLandPlace(building))
    const [fw, fd] = building.exterior.footprint
    const top = floorHeight(building) * building.exterior.floors
    for (const inst of constructionInstances(building, 5, NOW)) {
      const [x, y, z] = pos(inst.matrix)
      const dx = Math.abs(x - px) - fw / 2
      const dz = Math.abs(z - pz) - fd / 2
      expect(Math.max(dx, dz), 'outside the walls').toBeGreaterThanOrEqual(-0.01)
      expect(Math.max(dx, dz), 'near the walls').toBeLessThanOrEqual(SCAFFOLD_REACH + 0.01)
      expect(y, 'on the ground or above').toBeGreaterThanOrEqual(5 - 0.01)
      expect(y, 'under the top').toBeLessThanOrEqual(5 + top + 1.5)
    }
  })

  it('has a pole at each corner', () => {
    const [px, pz] = placeCentre(toLandPlace(building))
    const [fw, fd] = building.exterior.footprint
    const poles = constructionInstances(building, 0, NOW).filter((i) => i.shape === 'cylinder').map((i) => pos(i.matrix))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) expect(poles.some(([x, , z]) => Math.abs(x - (px + sx * (fw / 2 + SCAFFOLD_REACH))) < 0.01 && Math.abs(z - (pz + sz * (fd / 2 + SCAFFOLD_REACH))) < 0.01), `corner ${sx},${sz}`).toBe(true)
  })

  /** The box a piece fills: boxes by their scale, cylinders by their diameter and height (nothing is turned). */
  const extent = (inst: { matrix: number[] }) => {
    const [x, y, z] = pos(inst.matrix)
    const [hx, hy, hz] = [inst.matrix[0]! / 2, inst.matrix[5]! / 2, inst.matrix[10]! / 2]
    return { x0: x - hx, x1: x + hx, y0: y - hy, y1: y + hy, z0: z - hz, z1: z + hz }
  }
  /** A visitor's head, with the capsule's float: 1.8 m, and a little room. */
  const HEAD = 1.9
  const sizes: [number, number][] = [[10, 10], [12, 10], [16, 10], [20, 22], [24, 24]]

  it('keeps the way to the door and the sign clear: no pole, rail or board across the front from the door to past the sign', () => {
    for (const [fw, fd] of sizes) {
      const place: Place = { ...building, exterior: { ...building.exterior, footprint: [fw, fd] } }
      const [px, pz] = placeCentre(toLandPlace(place))
      const signX = signSpot(place, 0).position[0]
      const corridor = { x0: Math.min(px - DOOR_HALF, signX - SIGN_W / 2) - 0.4, x1: Math.max(px + DOOR_HALF, signX + SIGN_W / 2) + 0.4, z0: pz + fd / 2 - 0.2, z1: pz + fd / 2 + 3 }
      for (const inst of constructionInstances(place, 0, NOW)) {
        const e = extent(inst)
        const overlaps = e.x1 > corridor.x0 && e.x0 < corridor.x1 && e.z1 > corridor.z0 && e.z0 < corridor.z1
        expect(overlaps, `${fw}x${fd}: a ${inst.shape} at ${pos(inst.matrix).map((v) => v.toFixed(1))} is in the way`).toBe(false)
      }
    }
  })

  it('keeps every rail and board above a visitor\'s head (1.9 m): only poles and the pile of boards on the ground are lower', () => {
    for (const [fw, fd] of sizes) {
      const place: Place = { ...building, exterior: { ...building.exterior, footprint: [fw, fd] } }
      for (const inst of constructionInstances(place, 3, NOW)) {
        if (inst.shape === 'cylinder') continue
        const e = extent(inst)
        if (e.y1 - 3 < 0.5) continue // the pile on the ground
        expect(e.y0 - 3, `${fw}x${fd}: a board at ${pos(inst.matrix).map((v) => v.toFixed(1))}`).toBeGreaterThanOrEqual(HEAD)
      }
    }
  })

  it('still closes the other three sides with rails, and keeps its corner poles at the front', () => {
    const [px, pz] = placeCentre(toLandPlace(building))
    const [fw, fd] = building.exterior.footprint
    const rails = constructionInstances(building, 0, NOW).filter((i) => i.shape === 'box' && extent(i).y0 > HEAD)
    expect(rails.some((r) => extent(r).z1 < pz - fd / 2 && extent(r).x1 - extent(r).x0 > fw)).toBe(true)
    expect(rails.some((r) => extent(r).x1 < px - fw / 2 && extent(r).z1 - extent(r).z0 > fd)).toBe(true)
    expect(rails.some((r) => extent(r).x0 > px + fw / 2 && extent(r).z1 - extent(r).z0 > fd)).toBe(true)
  })

  it('hangs its lowest rail at SCAFFOLD_HEAD, which is above a visitor\'s head', () => {
    expect(SCAFFOLD_HEAD).toBeGreaterThan(HEAD)
  })

  it('is the same every time, and bigger for a bigger building, and never huge: under 200 pieces for the largest place of 24 by 24', () => {
    expect(JSON.stringify(constructionInstances(building, 0, NOW))).toBe(JSON.stringify(constructionInstances(building, 0, NOW)))
    const big: Place = { ...building, exterior: { ...building.exterior, footprint: [24, 24] } }
    const small: Place = { ...building, exterior: { ...building.exterior, footprint: [10, 10] } }
    expect(constructionInstances(big, 0, NOW).length).toBeGreaterThan(constructionInstances(small, 0, NOW).length)
    expect(constructionInstances(big, 0, NOW).length).toBeLessThan(200)
  })

  it('uses the plain shapes of the kit only, in wood colours', () => {
    for (const inst of constructionInstances(building, 0, NOW)) {
      expect(['box', 'cylinder']).toContain(inst.shape)
      expect(inst.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('the scene with scaffolding', () => {
  const land = createLand(1, fixture.places.map(toLandPlace))
  const heightAt = (x: number, z: number) => land.heightAt(x, z)
  const count = (places: readonly Place[]) => {
    const s = sceneInstances(places, kit, { heightAt, interiors: new Set(), nowMs: NOW })
    return s.box.count + s.cylinder.count
  }

  it('draws more for a place being built than for the same place standing finished', () => {
    expect(count([building])).toBeGreaterThan(count([idle(building)]))
    expect(count([building]) - count([idle(building)])).toBe(constructionInstances(building, 0, NOW).length)
  })

  it('stops drawing it once the clock passes the finish time', () => {
    const ends = Date.parse(building.state.construction!.finishesAt)
    const s = (nowMs: number) => sceneInstances([building], kit, { heightAt, interiors: new Set(), nowMs })
    expect(s(ends + 1).box.count).toBeLessThan(s(NOW).box.count)
  })

  it('stays within the render budget: 10 places with one being built, at most 4 draw calls and 80,000 triangles', () => {
    const near = interiorsToLoad(fixture.places, { x: 8, z: 16 })
    const budget = renderBudget(sceneInstances(fixture.places, kit, { heightAt, interiors: near, nowMs: NOW }))
    expect(budget.drawCalls).toBeLessThanOrEqual(4)
    expect(budget.triangles).toBeLessThanOrEqual(80_000)
  })

  it('stays within the budget when every one of 64 places is being built', () => {
    const big = makeFixtureWorld(3, 64)
    const all = big.places.map((p) => ({ ...p, state: { ...p.state, construction: { kind: 'expand' as const, finishesAt: new Date(NOW + 3_600_000).toISOString() } } }))
    const bigLand = createLand(3, all.map(toLandPlace))
    const budget = renderBudget(sceneInstances(all, kit, { heightAt: (x, z) => bigLand.heightAt(x, z), interiors: interiorsToLoad(all, { x: 8, z: 16 }), nowMs: NOW }))
    expect(budget.drawCalls).toBeLessThanOrEqual(4)
    expect(budget.triangles).toBeLessThanOrEqual(300_000)
  })
})
