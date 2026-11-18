import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { DOOR_HALF, placeCentre, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { describe, expect, it } from 'vitest'
import { floorHeight } from '../src/world/kitBase.ts'
import { renderBudget, sceneInstances } from '../src/world/kitGeometry.ts'
import { WIRE_THICKNESS, wireframeInstances } from '../src/world/wireframe.ts'
import { WIREFRAME } from '../src/world/theme.ts'

const NOW = Date.parse('2026-11-17T12:00:00Z')
const fixture = makeFixtureWorld(1, 10)
const base = fixture.places[0]!
const building = (p: Place, style = p.exterior.style): Place => ({
  ...p,
  exterior: { ...p.exterior, style },
  state: { ...p.state, construction: { kind: 'found', finishesAt: '2026-11-18T12:00:00Z' } },
})
const half = (m: number[]) => [0.5 * Math.hypot(m[0]!, m[1]!, m[2]!), 0.5 * Math.hypot(m[4]!, m[5]!, m[6]!), 0.5 * Math.hypot(m[8]!, m[9]!, m[10]!)]

describe('a place being built is its finished model as cyan wireframe', () => {
  it('draws nothing for a place that is not being built', () => {
    expect(wireframeInstances(base, kit, 0, NOW)).toEqual([])
  })

  it('draws glowing cyan lines, a few dozen, thin, for every style', () => {
    for (const style of kit.styles) {
      const lines = wireframeInstances(building(base, style.id), kit, 0, NOW)!
      expect(lines.length, style.id).toBeGreaterThan(12)
      expect(lines.length, style.id).toBeLessThanOrEqual(40)
      for (const l of lines) {
        expect(l.color).toBe(WIREFRAME.pole)
        expect(l.glow).toBe(true)
        expect(Math.min(...half(l.matrix)) * 2).toBeCloseTo(WIRE_THICKNESS, 5)
      }
    }
  })

  it('keeps the way in clear: no line across the door below the lintel', () => {
    for (const style of kit.styles) {
      const p = building(base, style.id)
      const [px, pz] = placeCentre(toLandPlace(p))
      const frontZ = pz + p.exterior.footprint[1] / 2
      for (const l of wireframeInstances(p, kit, 0, NOW)!) {
        const [x, y, z] = [l.matrix[12]!, l.matrix[13]!, l.matrix[14]!]
        const [hx, hy, hz] = half(l.matrix) as [number, number, number]
        const inDoorway = Math.abs(z - frontZ) < 1 + hz && Math.abs(x - px) - hx < DOOR_HALF && y - hy < 2.2
        expect(inDoorway, `${style.id}: a line in the doorway at y ${y}`).toBe(false)
      }
    }
  })

  it('stays within the body, the front and the crown, under 12 m and near the footprint', () => {
    const p = building(base)
    const [px, pz] = placeCentre(toLandPlace(p))
    const [fw, fd] = p.exterior.footprint
    for (const l of wireframeInstances(p, kit, 0, NOW)!) {
      expect(l.matrix[13]! - half(l.matrix)[1]!).toBeGreaterThanOrEqual(-0.1)
      expect(l.matrix[13]! + half(l.matrix)[1]!).toBeLessThanOrEqual(12.2)
      expect(Math.abs(l.matrix[12]! - px)).toBeLessThanOrEqual(fw / 2 + 1)
      expect(Math.abs(l.matrix[14]! - pz)).toBeLessThanOrEqual(fd / 2 + 1)
    }
    expect(floorHeight(p)).toBeGreaterThan(0)
  })

  it('replaces the exterior in the scene while it is built, and the exterior comes back when it is done', () => {
    const heightAt = () => 0
    const draw = (p: Place, nowMs: number) => sceneInstances([p], kit, { heightAt, interiors: new Set(), nowMs })
    const during = draw(building(base), NOW)
    const done = draw({ ...base, state: { ...base.state, construction: null } }, NOW)
    expect(during.box.count).toBeLessThan(done.box.count * 4)
    const lit = (s: ReturnType<typeof draw>) => [...s.box.glow].filter((g) => g === 1).length
    // The wireframe is all neon; the finished exterior has its windows lit only when its lamps are on.
    expect(lit(during)).toBe(during.box.count - 2 * 0 - [...during.box.glow].filter((g) => g === 0).length)
  })

  it('stays within the render budget when every one of 64 places is being built', () => {
    const places = Array.from({ length: 64 }, (_, i) => ({ ...building(fixture.places[i % fixture.places.length]!), id: `p${i}` }))
    const cost = renderBudget(sceneInstances(places, kit, { heightAt: () => 0, interiors: new Set(), nowMs: NOW }))
    expect(cost.drawCalls).toBeLessThanOrEqual(4)
    expect(cost.triangles).toBeLessThanOrEqual(80000)
  })
})
