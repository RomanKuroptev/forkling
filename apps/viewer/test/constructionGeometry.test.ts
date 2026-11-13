import { describe, expect, it } from 'vitest'
import type { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { createLand, placeCentre, toLandPlace } from '@forkling/sim'
import { FIXTURE_NOW, makeFixtureWorld } from '@forkling/sim/fixture'
import { constructionInstances, SCAFFOLD_REACH } from '../src/world/constructionGeometry.ts'
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
