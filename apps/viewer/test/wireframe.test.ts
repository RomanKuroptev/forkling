import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { DOOR_HALF, placeCentre, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { describe, expect, it } from 'vitest'
import { buildingModel } from '../src/world/building.ts'
import { floorHeight } from '../src/world/kitBase.ts'
import { interiorParts, renderBudget, sceneInstances } from '../src/world/kitGeometry.ts'
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

/** The two ends of a line from its matrix. */
const endOf = (m: readonly number[], k: number): number[] => [m[12]! + k * m[0]!, m[13]! + k * m[1]!, m[14]! + k * m[2]!]
const endsOf = (m: readonly number[]): [number[], number[]] => [endOf(m, -0.5), endOf(m, 0.5)]
/** How far a point is from a segment. */
function toSegment(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const d = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]
  const len2 = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0]! - a[0]!) * d[0]! + (p[1]! - a[1]!) * d[1]! + (p[2]! - a[2]!) * d[2]!) / len2))
  return Math.hypot(p[0]! - a[0]! - t * d[0]!, p[1]! - a[1]! - t * d[1]!, p[2]! - a[2]! - t * d[2]!)
}

describe('the wireframe is thin single lines, and the inside is wireframe too (issues 330, 329)', () => {
  it('draws hairlines: each line is at most 5 cm thick', () => {
    expect(WIRE_THICKNESS).toBeLessThanOrEqual(0.05)
  })

  it('never doubles a line: no line lies along another within 20 cm', () => {
    for (const style of kit.styles) {
      const lines = wireframeInstances(building(base, style.id), kit, 0, NOW)!.map((l) => endsOf(l.matrix))
      for (let i = 0; i < lines.length; i++) {
        for (let j = 0; j < lines.length; j++) {
          if (i === j) continue
          const [a, b] = lines[i]!
          const [c, d] = lines[j]!
          const along = toSegment(a, c, d) < 0.2 && toSegment(b, c, d) < 0.2
          expect(along, `${style.id}: line ${i} doubles line ${j}`).toBe(false)
        }
      }
    }
  })

  it('draws the inside of a place being built as cyan lines too, not as finished furniture', () => {
    const p: Place = { ...building(base), exhibits: [] }
    expect(interiorParts(p, kit, 0).instances.length).toBeGreaterThan(5)
    const scene = sceneInstances([p], kit, { heightAt: () => 0, interiors: new Set([p.id]), nowMs: NOW })
    const cyan = WIREFRAME.pole
    const [r, g, b] = [1, 3, 5].map((k) => Number.parseInt(cyan.slice(k, k + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    for (const shape of ['box', 'sphere', 'cylinder', 'cone'] as const) {
      const s = scene[shape]
      for (let k = 0; k < s.count; k++) {
        expect([s.colors[k * 3]!, s.colors[k * 3 + 1]!, s.colors[k * 3 + 2]!].map((c) => Math.round(c * 1000)), `${shape} ${k} is not a cyan line`).toEqual([r!, g!, b!].map((c) => Math.round(c * 1000)))
      }
    }
    expect(scene.glassBox.count).toBe(0)
    expect(Object.keys(scene.models)).toEqual([])
    // More lines than the outside alone: the furniture is there, as lines.
    expect(scene.box.count).toBeGreaterThan(wireframeInstances(p, kit, 0, NOW)!.length)
  })

  it('keeps the way in clear inside too: no line of the inside across the door below the lintel', () => {
    const p: Place = { ...building(base), exhibits: [] }
    const [px, pz] = placeCentre(toLandPlace(p))
    const frontZ = pz + p.exterior.footprint[1] / 2
    const scene = sceneInstances([p], kit, { heightAt: () => 0, interiors: new Set([p.id]), nowMs: NOW })
    for (let k = 0; k < scene.box.count; k++) {
      const m = [...scene.box.matrices.slice(k * 16, k * 16 + 16)]
      for (let s = 0; s <= 8; s++) {
        const f = s / 8 - 0.5
        const [x, y, z] = [m[12]! + f * m[0]!, m[13]! + f * m[1]!, m[14]! + f * m[2]!]
        expect(Math.abs(z - frontZ) < 1 && Math.abs(x - px) < DOOR_HALF - 0.05 && y < 2.2 && y > 0.2, `a line in the doorway at ${x}, ${y}, ${z}`).toBe(false)
      }
    }
  })
})
