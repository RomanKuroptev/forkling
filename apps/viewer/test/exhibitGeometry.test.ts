import { describe, expect, it } from 'vitest'
import type { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { createLand, neglectFor, placeCentre, toLandPlace } from '@forkling/sim'
import { FIXTURE_NOW, makeFixtureWorld } from '@forkling/sim/fixture'
import { exhibitInstances, exhibitSpots, neglectInstances, neglectLook, signSpot } from '../src/world/exhibitGeometry.ts'
import { exteriorInstances, interiorParts, renderBudget, sceneInstances, interiorsToLoad } from '../src/world/kitGeometry.ts'

const fixture = makeFixtureWorld(1, 10)
const place = (id: string) => fixture.places.find((p) => p.id === id)!
const palette = kit.palettes.find((p) => p.id === 'harbour')!
const NOW = Date.parse(FIXTURE_NOW)
const pos = (m: number[]): [number, number, number] => [m[12]!, m[13]!, m[14]!]
// A generated place has shelves, a frame, a case and a plaque stand, with exhibits in them.
const stocked = fixture.places.find((p) => p.exhibits.length >= 5 && p.id !== 'home')!

describe('where an exhibit stands (spec 5.1: a slot is room / part index / slot index)', () => {
  it('finds each exhibit at its slot on its part, in the world', () => {
    const [px, pz] = placeCentre(toLandPlace(stocked))
    const spots = exhibitSpots(stocked, kit, 10)
    expect(spots).toHaveLength(stocked.exhibits.length)
    const first = stocked.exhibits[0]!
    const [roomId, partIndex, slotIndex] = first.slot.split('/') as [string, string, string]
    const room = stocked.rooms.find((r) => r.id === roomId)!
    const placed = room.parts[Number(partIndex)]!
    const slot = kit.parts.find((p) => p.id === placed.part)!.slots[Number(slotIndex)]!
    const spot = spots.find((s) => s.exhibit.id === first.id)!
    expect(spot.slotKind).toBe(slot.kind)
    expect(spot.placeId).toBe(stocked.id)
    const c = Math.cos(placed.rot)
    const s = Math.sin(placed.rot)
    expect(spot.position[0]).toBeCloseTo(px + room.at[0] + placed.at[0] + slot.at[0] * c + slot.at[2] * s, 5)
    expect(spot.position[1]).toBeCloseTo(10 + room.floor * 3.4 + placed.at[1] + slot.at[1], 5)
    expect(spot.position[2]).toBeCloseTo(pz + room.at[1] + placed.at[2] - slot.at[0] * s + slot.at[2] * c, 5)
  })

  it('turns the slot with its part', () => {
    const turned: Place = { ...stocked, rooms: stocked.rooms.map((r) => ({ ...r, parts: r.parts.map((p) => ({ ...p, rot: Math.PI / 2 })) })) }
    const a = exhibitSpots(stocked, kit, 0)[0]!
    const b = exhibitSpots(turned, kit, 0)[0]!
    expect(a.position[1]).toBeCloseTo(b.position[1], 6)
    expect(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])).toBeGreaterThan(0.1)
  })

  it('skips an exhibit whose slot is not there, and never throws', () => {
    const broken: Place = { ...stocked, exhibits: [...stocked.exhibits, { ...stocked.exhibits[0]!, id: 'ghost', slot: 'nowhere/9/9' }, { ...stocked.exhibits[0]!, id: 'odd', slot: 'not a slot' }] }
    const spots = exhibitSpots(broken, kit, 0)
    expect(spots.map((s) => s.exhibit.id)).not.toContain('ghost')
    expect(spots.map((s) => s.exhibit.id)).not.toContain('odd')
    expect(spots).toHaveLength(stocked.exhibits.length)
  })
})

describe('what an exhibit looks like', () => {
  const spots = exhibitSpots(stocked, kit, 0)
  it('is something to see at every spot, within half a meter of it', () => {
    for (const spot of spots) {
      const shapes = exhibitInstances(spot, palette.colors)
      expect(shapes.length, `${spot.slotKind} ${spot.exhibit.id}`).toBeGreaterThan(0)
      for (const i of shapes) {
        const [x, y, z] = pos(i.matrix)
        expect(Math.hypot(x - spot.position[0], y - spot.position[1], z - spot.position[2])).toBeLessThan(0.6)
      }
    }
  })
  it('lights a screen and a terminal, and does not light a frame or a shelf', () => {
    const at = (slotKind: string) => ({ ...spots[0]!, slotKind: slotKind as never })
    expect(exhibitInstances(at('screen'), palette.colors).some((i) => i.color === palette.colors.glow)).toBe(true)
    expect(exhibitInstances(at('terminal'), palette.colors).some((i) => i.color === palette.colors.glow)).toBe(true)
    expect(exhibitInstances(at('frame'), palette.colors).some((i) => i.color === palette.colors.glow)).toBe(false)
    expect(exhibitInstances(at('shelf'), palette.colors).some((i) => i.color === palette.colors.glow)).toBe(false)
  })
})

describe('how neglect shows (spec 4.4)', () => {
  it('turns the lamps off at level 1, adds dust and cobwebs at 2, and vines and grass at 3', () => {
    expect(neglectLook(0, true)).toEqual({ lampsOn: true, dust: 0, cobwebs: 0, vines: 0, grass: 0 })
    expect(neglectLook(0, false).lampsOn).toBe(false)
    expect(neglectLook(1, true)).toEqual({ lampsOn: false, dust: 0, cobwebs: 0, vines: 0, grass: 0 })
    const two = neglectLook(2, true)
    expect(two.lampsOn).toBe(false)
    expect(two.dust).toBeGreaterThan(0)
    expect(two.cobwebs).toBeGreaterThan(0)
    expect(two.vines + two.grass).toBe(0)
    const three = neglectLook(3, true)
    expect(three.vines).toBeGreaterThan(0)
    expect(three.grass).toBeGreaterThan(0)
    expect(three.dust).toBeGreaterThanOrEqual(two.dust)
  })

  it('draws the dust, webs and grass inside only, and the vines outside for everyone to see', () => {
    const inside = (level: 0 | 1 | 2 | 3) => neglectInstances(stocked, kit, 0, level, 'interior').length
    const outside = (level: 0 | 1 | 2 | 3) => neglectInstances(stocked, kit, 0, level, 'exterior').length
    expect([inside(0), inside(1), outside(0), outside(1), outside(2)]).toEqual([0, 0, 0, 0, 0])
    expect(inside(2)).toBeGreaterThan(0)
    expect(inside(3)).toBeGreaterThan(inside(2))
    expect(outside(3)).toBeGreaterThan(0)
  })

  it('is the same every time for one place, and different for another', () => {
    const a = neglectInstances(stocked, kit, 0, 3, 'interior').map((i) => pos(i.matrix))
    expect(neglectInstances(stocked, kit, 0, 3, 'interior').map((i) => pos(i.matrix))).toEqual(a)
    const other = fixture.places.find((p) => p.id !== stocked.id && p.id !== 'home' && p.id !== 'workshop')!
    expect(neglectInstances(other, kit, 0, 3, 'interior').map((i) => pos(i.matrix))).not.toEqual(a)
  })

  it('stays inside the building, and the vines on its outside walls', () => {
    const [px, pz] = placeCentre(toLandPlace(stocked))
    const [fw, fd] = stocked.exterior.footprint
    for (const i of neglectInstances(stocked, kit, 0, 3, 'interior')) {
      const [x, , z] = pos(i.matrix)
      expect(Math.abs(x - px)).toBeLessThanOrEqual(fw / 2)
      expect(Math.abs(z - pz)).toBeLessThanOrEqual(fd / 2)
    }
    for (const i of neglectInstances(stocked, kit, 0, 3, 'exterior')) {
      const [x, , z] = pos(i.matrix)
      expect(Math.abs(x - px)).toBeLessThanOrEqual(fw / 2 + 0.6)
      expect(Math.abs(z - pz)).toBeLessThanOrEqual(fd / 2 + 0.6)
    }
  })
})

describe('the lamps', () => {
  const lamp = (lampsOn: boolean) => {
    const home = place('home')
    const inside = interiorParts(home, kit, 0, new Set(), { lampsOn }).instances
    const glow = kit.palettes.find((p) => p.id === home.exterior.palette)!.colors.glow
    return { glowing: inside.filter((i) => i.color === glow).length, all: inside.length }
  }
  it('glow when they are on and are dark when they are off, and nothing else changes', () => {
    const on = lamp(true)
    const off = lamp(false)
    expect(on.glowing).toBeGreaterThan(0)
    expect(off.glowing).toBe(0)
    expect(on.all).toBe(off.all)
  })
})

describe('the sign by the door (spec 4.6: clicking a place\'s sign opens its history)', () => {
  it('stands a little way from the door, on the front side, on the ground', () => {
    const home = place('home')
    const [px, pz] = placeCentre(toLandPlace(home))
    const [, fd] = home.exterior.footprint
    const sign = signSpot(home, 3)
    expect(sign.position[1]).toBeCloseTo(3, 6)
    expect(sign.position[2]).toBeGreaterThan(pz + fd / 2)
    expect(Math.abs(sign.position[0] - px)).toBeLessThan(6)
    expect(exteriorInstances(home, kit, 3).some((i) => Math.hypot(pos(i.matrix)[0] - sign.position[0], pos(i.matrix)[2] - sign.position[2]) < 0.4)).toBe(true)
  })
})

describe('the whole scene with neglect and exhibits', () => {
  const land = createLand(1, fixture.places.map(toLandPlace))
  const heightAt = (x: number, z: number) => land.heightAt(x, z)
  const all = new Set(fixture.places.map((p) => p.id))
  const count = (nowMs?: number, interiors: ReadonlySet<string> = all) => {
    const s = sceneInstances(fixture.places, kit, { heightAt, interiors, ...(nowMs !== undefined ? { nowMs } : {}) })
    return s.box.count + s.sphere.count + s.cylinder.count + s.cone.count
  }

  it('draws more for a world that has been left alone than for a freshly cared-for one', () => {
    expect(count(NOW)).toBeGreaterThan(count(undefined))
  })

  it('never makes Home or the Workshop more than quiet: no dust, webs or vines on them however long it has been', () => {
    const later = NOW + 400 * 86_400_000
    for (const id of ['home', 'workshop']) {
      const p = place(id)
      expect(neglectFor({ id, lastCareAt: p.state.lastCareAt, founded: p.founded }, later)).toBeLessThanOrEqual(1)
      const quiet = sceneInstances([p], kit, { heightAt, interiors: new Set([id]), nowMs: later })
      const fresh = sceneInstances([p], kit, { heightAt, interiors: new Set([id]), nowMs: Date.parse(p.founded) })
      expect(quiet.box.count + quiet.cone.count + quiet.cylinder.count).toBe(fresh.box.count + fresh.cone.count + fresh.cylinder.count)
    }
  })

  it('stays within the render budget with exhibits and neglect: 10 places, at most 4 draw calls and 80,000 triangles', () => {
    const near = interiorsToLoad(fixture.places, { x: 8, z: 16 })
    const budget = renderBudget(sceneInstances(fixture.places, kit, { heightAt, interiors: near, nowMs: NOW }))
    expect(budget.drawCalls).toBeLessThanOrEqual(4)
    expect(budget.triangles).toBeLessThanOrEqual(80_000)
  })

  it('stays within the budget for 64 places', () => {
    const big = makeFixtureWorld(3, 64)
    const bigLand = createLand(3, big.places.map(toLandPlace))
    const budget = renderBudget(sceneInstances(big.places, kit, { heightAt: (x, z) => bigLand.heightAt(x, z), interiors: interiorsToLoad(big.places, { x: 8, z: 16 }), nowMs: NOW }))
    expect(budget.drawCalls).toBeLessThanOrEqual(4)
    expect(budget.triangles).toBeLessThanOrEqual(300_000)
  })
})
