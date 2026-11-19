import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { DOOR_HALF, placeCentre, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { describe, expect, it } from 'vitest'
import {
  CROWN_SHARE,
  BASE_HEIGHT,
  BASE_REACH,
  MAX_OUTLINE_HEIGHT,
  MIN_THICKNESS,
  WINDOW_EVERY,
  WINDOW_SIZE,
  buildingModel,
  crownHeight,
  frontHeight,
  frontWidth,
} from '../src/world/building.ts'
import { COLORS } from '../src/world/theme.ts'
import { exteriorInstances, floorHeight, renderBudget, sceneInstances } from '../src/world/kitGeometry.ts'
import type { Instance } from '../src/world/kitBase.ts'

const fixture = makeFixtureWorld(1, 10)
const home = fixture.places[0]!
const STYLES = ['tower', 'timber', 'stone', 'glass', 'tin-shack'] as const
const model = (p: Place) => buildingModel(p, kit, 0)!

/** Half the size of an instance along each axis, from its matrix (axis-aligned boxes only). */
const half = (i: Instance): [number, number, number] => [0.5 * Math.hypot(i.matrix[0]!, i.matrix[1]!, i.matrix[2]!), 0.5 * Math.hypot(i.matrix[4]!, i.matrix[5]!, i.matrix[6]!), 0.5 * Math.hypot(i.matrix[8]!, i.matrix[9]!, i.matrix[10]!)]
const at = (i: Instance): [number, number, number] => [i.matrix[12]!, i.matrix[13]!, i.matrix[14]!]

describe('the building model, every style', () => {
  it('draws all five styles, and nothing for a style it does not know', () => {
    for (const style of kit.styles) expect(buildingModel({ ...home, exterior: { ...home.exterior, style: style.id } }, kit, 0), style.id).not.toBeNull()
    expect(buildingModel({ ...home, exterior: { ...home.exterior, style: 'nope' } }, kit, 0)).toBeNull()
  })

  it('gives each style its own outline: the crowns differ in shape or size', () => {
    const signature = (style: string) => model({ ...home, exterior: { ...home.exterior, style } }).slots.crown.map((i) => `${i.shape}:${half(i).map((n) => n.toFixed(2)).join(',')}`).join('|')
    expect(new Set(STYLES.map(signature)).size).toBe(STYLES.length)
  })

  it('gives each style a crown whose tip stays under 12 m and a hero of its own', () => {
    const heroes = STYLES.map((style) => model({ ...home, exterior: { ...home.exterior, style } }).slots.hero.map((i) => i.shape).join(','))
    expect(new Set(heroes).size).toBeGreaterThanOrEqual(4)
    for (const style of STYLES) for (const floors of [1, 2, 3]) expect(model({ ...home, exterior: { ...home.exterior, style, floors } }).outlineHeight).toBeLessThanOrEqual(12.0001)
  })
})

describe('the glass of a glass house', () => {
  it('goes to its own see-through draw call, and only a glass house has any', () => {
    for (const style of STYLES) {
      const scene = sceneInstances([{ ...home, exterior: { ...home.exterior, style } }], kit, { heightAt: () => 0, interiors: new Set(), nowMs: 0 })
      if (style === 'glass') expect(scene.glassBox.count).toBeGreaterThan(0)
      else expect(scene.glassBox.count, style).toBe(0)
    }
  })
})

describe.each(STYLES)('the building model, %s style', (style) => {
  const tower = (p: Place, floors = 1, footprint: [number, number] = p.exterior.footprint, palette = p.exterior.palette): Place => ({ ...p, exterior: { ...p.exterior, style, floors, footprint, palette } })

  it('has the six slots, and exteriorInstances draws them plus the sign', () => {
    const m = model(tower(home))
    for (const slot of ['base', 'body', 'front', 'crown', 'hero', 'glow'] as const) expect(m.slots[slot].length, slot).toBeGreaterThan(0)
    expect(exteriorInstances(tower(home), kit, 0).length).toBeGreaterThan(m.instances.length)
  })

  it('stands on a low slab 0.8 m wider than the footprint on each side', () => {
    const p = tower(home)
    const [fw, fd] = p.exterior.footprint
    const slab = model(p).slots.base[0]!
    expect(half(slab)[0] * 2).toBeCloseTo(fw + 2 * BASE_REACH, 5)
    expect(half(slab)[2] * 2).toBeCloseTo(fd + 2 * BASE_REACH, 5)
    expect(half(slab)[1] * 2).toBeCloseTo(BASE_HEIGHT, 5)
  })

  it('uses only the body, accent and glow of its palette, chrome and white marble', () => {
    for (const palette of kit.palettes) {
      const c = palette.colors
      const allowed = new Set([c.wall, c.accent, c.glow, c.metal, COLORS.white, COLORS.metal])
      for (const floors of [1, 2, 3]) for (const i of model(tower(home, floors, [12, 10], palette.id)).instances) expect(allowed.has(i.color), `${palette.id} ${i.color}`).toBe(true)
    }
  })

  it('has nothing thinner than 0.15 m unless it is neon (a glowing line); the base slab is 0.12 m by the model and so is exempt', () => {
    for (const floors of [1, 2, 3]) {
      const m = model(tower(home, floors))
      for (const i of [...m.slots.body, ...m.slots.front, ...m.slots.crown, ...m.slots.hero, ...m.slots.glow]) {
        if (i.glow) continue
        expect(Math.min(...half(i)) * 2, `${floors} floors`).toBeGreaterThanOrEqual(MIN_THICKNESS - 1e-9)
      }
    }
  })

  it('has few big windows: one for at most each 4 m of wall, each at least 1.2 m wide and 1.6 m tall, and they stick out of the wall', () => {
    expect(WINDOW_SIZE[0]).toBeGreaterThanOrEqual(1.2)
    expect(WINDOW_SIZE[1]).toBeGreaterThanOrEqual(1.6)
    const p = tower(home, 1, [12, 10])
    const windows = model(p).slots.glow.filter((i) => Math.abs(half(i)[1] * 2 - WINDOW_SIZE[1]) < 1e-6)
    const perimeter = 2 * (12 + 10)
    expect(windows.length).toBeGreaterThan(0)
    expect(windows.length).toBeLessThanOrEqual(perimeter / WINDOW_EVERY)
    for (const w of windows) expect(Math.min(...half(w).filter((_, k) => k !== 1)) * 2).toBeGreaterThan(0.4)
  })

  it('has a front as tall as the larger of 1.5 times the body or the body plus 2.5 m, over the middle 8 m of a building wider than 16 m', () => {
    expect(frontHeight(3)).toBeCloseTo(5.5, 5)
    expect(frontHeight(6)).toBeCloseTo(9, 5)
    expect(frontWidth(12)).toBe(12)
    expect(frontWidth(20)).toBe(8)
    const m = model(tower(home, 1, [12, 10]))
    expect(m.front.height).toBeCloseTo(frontHeight(floorHeight(home)), 5)
    const bar = m.slots.front.find((i) => i.color === kit.palettes.find((q) => q.id === home.exterior.palette)!.colors.accent)!
    expect(half(bar)[0] * 2).toBeCloseTo(12, 5)
  })

  it('clamps front and crown to the 12 m limit of spec 5.2 (Roman to decide), whatever the floors', () => {
    expect(MAX_OUTLINE_HEIGHT).toBe(12)
    for (const floors of [1, 2, 3]) {
      const m = model(tower(home, floors))
      const body = floorHeight(home) * floors
      expect(m.front.height, `${floors} floors`).toBeLessThanOrEqual(12)
      expect(m.outlineHeight, `${floors} floors`).toBeLessThanOrEqual(12.0001)
      expect(body + crownHeight(body)).toBeLessThanOrEqual(12)
    }
    // The crown stands on the front: two thirds of the body when the clamp leaves room, less when it does not.
    expect(crownHeight(3)).toBeCloseTo(2, 5)
    expect(frontHeight(6) + crownHeight(6)).toBeCloseTo(12, 5)
    expect(CROWN_SHARE[style]).toBeGreaterThanOrEqual(1 / 3)
    expect(CROWN_SHARE[style]).toBeLessThanOrEqual(2 / 3)
    expect(crownHeight(12)).toBe(0)
    expect(crownHeight(9)).toBe(0)
  })

  it('has lit surface that faces the front of at least 15 percent of the front area', () => {
    for (const floors of [1, 2, 3]) for (const footprint of [[12, 10], [8, 8], [20, 14], [24, 24]] as [number, number][]) {
      const m = model(tower(home, floors, footprint))
      expect(m.frontGlowArea / m.front.area, `${floors} floors, ${footprint.join('x')}`).toBeGreaterThanOrEqual(0.15)
    }
  })

  it('has one hero, clear of the way in', () => {
    const p = tower(home)
    const [px, pz] = placeCentre(toLandPlace(p))
    const hero = model(p).slots.hero
    expect(hero.length).toBeGreaterThanOrEqual(1)
    if (style === 'tower') for (const i of hero) expect(i.glow).toBe(true)
    // Nothing of the ring stands in the door gap below the lintel.
    for (const i of hero) {
      const [x, y, z] = at(i)
      const [hx, , hz] = half(i)
      if (y < 2.3 && Math.abs(z - (pz + p.exterior.footprint[1] / 2)) < 1.2) expect(Math.min(Math.abs(x - px) + hx, 99) <= DOOR_HALF + 1e-9 && Math.abs(x - px) - hx < DOOR_HALF, `ring in the door at x ${x - px}`).toBe(false)
      void hz
    }
  })

  it('keeps the door gap open: no body piece in the door gap at walking height', () => {
    const p = tower(home, 2)
    const [px, pz] = placeCentre(toLandPlace(p))
    const frontZ = pz + p.exterior.footprint[1] / 2
    for (const i of model(p).slots.body) {
      const [x, y, z] = at(i)
      const [hx, hy, hz] = half(i)
      const inFront = Math.abs(z - frontZ) < 1.2 && hz < 1
      const reachesDoor = Math.abs(x - px) - hx < DOOR_HALF - 0.05
      const lowDown = y - hy < 2.2 - 0.05
      const isDoorLeaf = hx * 2 === 2 && Math.abs(x - px) < 1e-6
      if (inFront && reachesDoor && lowDown && !isDoorLeaf) expect.fail(`a body piece stands in the way in at y ${y}`)
    }
  })

  it('is the same every time, and a closed place has its door boarded', () => {
    expect(model(tower(home))).toEqual(model(tower(home)))
    const closed = tower({ ...home, state: { ...home.state, closed: { at: '2026-11-01T00:00:00Z', reason: 'resting' } } })
    expect(model(closed).slots.body.length).toBeGreaterThan(model(tower(home)).slots.body.length)
  })

  it('stays within the render budget, for ten places and for 64', () => {
    const heightAt = () => 0
    const cost = (places: Place[]) => renderBudget(sceneInstances(places, kit, { heightAt, interiors: new Set(), nowMs: 0 }))
    const ten = cost(fixture.places.map((p) => tower(p)))
    expect(ten.drawCalls).toBeLessThanOrEqual(4)
    expect(ten.triangles).toBeLessThanOrEqual(80000)
    const sixtyFour = cost(Array.from({ length: 64 }, (_, i) => ({ ...tower(fixture.places[i % fixture.places.length]!), id: `p${i}` })))
    expect(sixtyFour.drawCalls).toBeLessThanOrEqual(4)
    expect(sixtyFour.triangles).toBeLessThanOrEqual(80000)
  })
})

describe('the title bar', () => {
  it('carries the whole name, never cut at 24 characters (issue 366)', () => {
    const hill = { ...home, name: 'Hillside Room, Five Lamps', exterior: { ...home.exterior, style: 'timber' } }
    expect(buildingModel(hill, kit, 0)!.titleBar!.text).toBe('HILLSIDE ROOM, FIVE LAMPS')
    const longest = { ...hill, name: 'The Observatory of Patient Little Birds!' }
    expect(buildingModel(longest, kit, 0)!.titleBar!.text).toBe('THE OBSERVATORY OF PATIENT LITTLE BIRDS!')
  })
})
