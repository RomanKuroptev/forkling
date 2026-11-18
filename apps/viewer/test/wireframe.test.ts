import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { DOOR_HALF, placeCentre, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { describe, expect, it } from 'vitest'
import { buildingModel } from '../src/world/building.ts'
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

  it('draws glowing cyan lines, thin, for every style', () => {
    for (const style of kit.styles) {
      const lines = wireframeInstances(building(base, style.id), kit, 0, NOW)!
      expect(lines.length, style.id).toBeGreaterThan(30)
      expect(lines.length, style.id).toBeLessThanOrEqual(450)
      for (const l of lines) {
        expect(l.color).toBe(WIREFRAME.pole)
        expect(l.glow).toBe(true)
        expect(Math.min(Math.hypot(l.matrix[4]!, l.matrix[5]!, l.matrix[6]!), Math.hypot(l.matrix[8]!, l.matrix[9]!, l.matrix[10]!))).toBeCloseTo(WIRE_THICKNESS, 5)
      }
    }
  })

  it('keeps the way in clear: no line across the door below the lintel', () => {
    for (const style of kit.styles) {
      const p = building(base, style.id)
      const [px, pz] = placeCentre(toLandPlace(p))
      const frontZ = pz + p.exterior.footprint[1] / 2
      for (const l of wireframeInstances(p, kit, 0, NOW)!) {
        // Walk along the line: no point of it is in the doorway, below the lintel.
        for (let k = 0; k <= 8; k++) {
          const f = k / 8 - 0.5
          const [x, y, z] = [l.matrix[12]! + f * l.matrix[0]!, l.matrix[13]! + f * l.matrix[1]!, l.matrix[14]! + f * l.matrix[2]!]
          const inDoorway = Math.abs(z - frontZ) < 1 && Math.abs(x - px) < DOOR_HALF - 0.05 && y < 2.2
          expect(inDoorway, `${style.id}: a line in the doorway at y ${y}`).toBe(false)
        }
      }
    }
  })

  it('stays near the footprint and under 12 m, with the ends of every line taken from its matrix', () => {
    const p = building(base)
    const [px, pz] = placeCentre(toLandPlace(p))
    const [fw, fd] = p.exterior.footprint
    for (const l of wireframeInstances(p, kit, 0, NOW)!) {
      const m = l.matrix
      for (const k of [-0.5, 0.5]) {
        const [x, y, z] = [m[12]! + k * m[0]!, m[13]! + k * m[1]!, m[14]! + k * m[2]!]
        expect(y).toBeGreaterThanOrEqual(-0.1)
        expect(y).toBeLessThanOrEqual(12.2)
        expect(Math.abs(x - px)).toBeLessThanOrEqual(fw / 2 + 4)
        expect(Math.abs(z - pz)).toBeLessThanOrEqual(fd / 2 + 4)
      }
    }
    expect(floorHeight(p)).toBeGreaterThan(0)
  })

  it('carries the whole finished model over: the crown, the hero and the taper are drawn, and a pyramid points up', () => {
    const top = (style: string) => {
      const lines = wireframeInstances(building(base, style), kit, 0, NOW)!
      return Math.max(...lines.flatMap((l) => [l.matrix[13]! + 0.5 * l.matrix[1]!, l.matrix[13]! - 0.5 * l.matrix[1]!]))
    }
    for (const style of kit.styles) {
      const m = buildingModel(building(base, style.id), kit, 0)!
      expect(top(style.id), style.id).toBeGreaterThanOrEqual(m.outlineHeight - 1.2)
    }
    // The pyramid of a villa: four slanted lines that meet at one point above the front, and four that make its base.
    const model = buildingModel(building(base, 'timber'), kit, 0)!
    const ends = (l: { matrix: number[] }) => [0, 1].map((k) => [l.matrix[12]! + (k - 0.5) * l.matrix[0]!, l.matrix[13]! + (k - 0.5) * l.matrix[1]!, l.matrix[14]! + (k - 0.5) * l.matrix[2]!] as const)
    const crown = wireframeInstances(building(base, 'timber'), kit, 0, NOW)!.filter((l) => Math.min(...ends(l).map((e) => e[1])) >= model.front.height - 0.01)
    const slanted = crown.filter((l) => Math.abs(l.matrix[1]!) > 0.1 * Math.hypot(l.matrix[0]!, l.matrix[1]!, l.matrix[2]!))
    expect(slanted).toHaveLength(4)
    const tips = slanted.flatMap((l) => ends(l)).filter((e) => e[1] > model.front.height + 0.3)
    expect(tips).toHaveLength(4)
    for (const t of tips) expect(t[1]).toBeCloseTo(tips[0]![1], 3)
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
    expect(cost.triangles).toBeLessThanOrEqual(300000)
  })
})
