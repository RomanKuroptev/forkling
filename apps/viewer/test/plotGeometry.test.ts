import { describe, expect, it } from 'vitest'
import { PlaceRequest } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { chunkCentre, createLand, toLandPlace } from '@forkling/sim'
import { FIXTURE_NOW, makeFixtureWorld } from '@forkling/sim/fixture'
import { PLOT_HALF, plotInstances, plotSign } from '../src/world/plotGeometry.ts'
import { renderBudget, sceneInstances, interiorsToLoad } from '../src/world/kitGeometry.ts'

const fixture = makeFixtureWorld(1, 10)
const NOW = Date.parse(FIXTURE_NOW)
const open = fixture.requests.find((r) => r.status === 'open')!
const building = fixture.requests.find((r) => r.status === 'building')!
const pos = (m: number[]): [number, number, number] => [m[12]!, m[13]!, m[14]!]
const withStatus = (r: PlaceRequest, status: 'open' | 'building' | 'built' | 'declined' | 'self-built' | 'withdrawn') =>
  PlaceRequest.parse({ ...r, status, statusAt: status === 'open' ? null : '2026-11-15T10:00:00Z', note: status === 'declined' ? 'No.' : null })

describe('the staked plot of an open request (spec 10.3)', () => {
  it('is drawn for an open or building request, and for no other status', () => {
    expect(plotInstances(open, 0).length).toBeGreaterThan(8)
    expect(plotInstances(building, 0).length).toBeGreaterThan(8)
    for (const s of ['built', 'declined', 'self-built', 'withdrawn'] as const) expect(plotInstances(withStatus(open, s), 0), s).toEqual([])
  })

  it('stands in the middle of its chunk, a square of stakes joined by rope, a few meters across', () => {
    const [cx, cz] = chunkCentre(open.chunk)
    expect(PLOT_HALF).toBeGreaterThanOrEqual(4)
    expect(PLOT_HALF).toBeLessThanOrEqual(10)
    const stakes = plotInstances(open, 5).filter((i) => i.shape === 'cylinder').map((i) => pos(i.matrix))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) expect(stakes.some(([x, , z]) => Math.abs(x - (cx + sx * PLOT_HALF)) < 0.01 && Math.abs(z - (cz + sz * PLOT_HALF)) < 0.01), `corner ${sx},${sz}`).toBe(true)
  })

  it('keeps every piece within the chunk and standing on the ground it is given', () => {
    const [cx, cz] = chunkCentre(open.chunk)
    for (const inst of plotInstances(open, 5)) {
      const [x, y, z] = pos(inst.matrix)
      expect(Math.abs(x - cx)).toBeLessThanOrEqual(16)
      expect(Math.abs(z - cz)).toBeLessThanOrEqual(16)
      expect(y).toBeGreaterThanOrEqual(5 - 0.01)
      expect(y).toBeLessThanOrEqual(5 + 4)
    }
  })

  it('has a sign by the front, whose spot is where a visitor can point at, within the plot and on the ground', () => {
    const [cx, cz] = chunkCentre(open.chunk)
    const spot = plotSign(open, 5)
    expect(Math.abs(spot.position[0] - cx)).toBeLessThanOrEqual(PLOT_HALF + 2)
    expect(spot.position[2]).toBeGreaterThan(cz)
    expect(spot.position[1]).toBe(5)
  })

  it('shows that Roman is building it: a pennant the open plot does not have', () => {
    expect(plotInstances(building, 0).filter((i) => i.shape === 'cone').length).toBeGreaterThan(plotInstances(open, 0).filter((i) => i.shape === 'cone').length)
    expect(plotInstances(building, 0).length).toBeGreaterThan(plotInstances(withStatus(building, 'open'), 0).length)
  })

  it('is the same every time, small, and made of the kit\'s plain shapes', () => {
    expect(JSON.stringify(plotInstances(open, 0))).toBe(JSON.stringify(plotInstances(open, 0)))
    expect(plotInstances(building, 0).length).toBeLessThan(60)
    for (const i of plotInstances(open, 0)) {
      expect(['box', 'cylinder', 'cone']).toContain(i.shape)
      expect(i.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('the scene with plots', () => {
  const land = createLand(1, fixture.places.map(toLandPlace), fixture.requests.map((r) => r.chunk))
  const heightAt = (x: number, z: number) => land.heightAt(x, z)
  const count = (plots?: readonly PlaceRequest[]) => {
    const s = sceneInstances(fixture.places, kit, { heightAt, interiors: new Set(), nowMs: NOW, ...(plots ? { plots } : {}) })
    return s.box.count + s.cylinder.count + s.cone.count
  }

  it('draws more with the plots than without, and nothing for a request that is not open', () => {
    expect(count(fixture.requests)).toBeGreaterThan(count())
    expect(count(fixture.requests.map((r) => withStatus(r, 'built')))).toBe(count())
  })

  it('stays within the render budget: 10 places with their plots, at most 4 draw calls and 80,000 triangles', () => {
    const near = interiorsToLoad(fixture.places, { x: 8, z: 16 })
    const budget = renderBudget(sceneInstances(fixture.places, kit, { heightAt, interiors: near, nowMs: NOW, plots: fixture.requests }))
    expect(budget.drawCalls).toBeLessThanOrEqual(4)
    expect(budget.triangles).toBeLessThanOrEqual(80_000)
  })

  it('stays within the budget for 64 places and 2 plots', () => {
    const big = makeFixtureWorld(3, 62)
    const bigLand = createLand(3, big.places.map(toLandPlace), big.requests.map((r) => r.chunk))
    const budget = renderBudget(sceneInstances(big.places, kit, { heightAt: (x, z) => bigLand.heightAt(x, z), interiors: interiorsToLoad(big.places, { x: 8, z: 16 }), nowMs: NOW, plots: big.requests }))
    expect(budget.drawCalls).toBeLessThanOrEqual(4)
    expect(budget.triangles).toBeLessThanOrEqual(300_000)
  })
})
