import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { DOOR_HALF } from '@forkling/sim'
import { FRAME, INNER_FACE, WINDOW_SIZE, windowLayout } from '../src/world/building.ts'
import { OFF_WALL, SCREEN_EYE, hungParts, partsInAir, screenStands, settledPlace } from '../src/world/insideWalls.ts'
import { interiorParts } from '../src/world/kitGeometry.ts'
import { exhibitSpots } from '../src/world/exhibitGeometry.ts'
import { furnitureBoxes } from '../src/world/solidFurniture.ts'
import { partInDoorway } from '../src/world/doorway.ts'
import { instancesBox, placeObjects } from '../src/qa/sceneList.ts'

const day7 = (id: string): Place => Place.parse(JSON.parse(readFileSync(fileURLToPath(new URL(`../../../test/fixtures/worlds/day-7/places/${id}.json`, import.meta.url)), 'utf8')))
const scene = (ps: Place[]) => placeObjects({ places: ps, kit, heightAt: () => 0, interiors: new Set(ps.map((p) => p.id)), nowMs: Date.parse('2026-11-26T13:00:00Z'), plots: [] })
/** The Workshop's four screens: parts 4 to 7 of its bench room, each on the floor 0.8 m in front of the front wall. */
const SCREENS = [4, 5, 6, 7]
/** The Workshop's middle in the world (its windows are given in world meters). */
const centreX = (p: Place) => {
  const list = scene([p])
  const f = list.find((o) => o.id === p.id)!.footprint!
  return (f.x0 + f.x1) / 2
}

describe("the Workshop's work screens hang on the wall at eye height (issue 431)", () => {
  it('draws each screen panel with its middle at eye height, 1.5 m above the floor', () => {
    const workshop = day7('workshop')
    const spots = exhibitSpots(workshop, kit, 0).filter((s) => s.slotKind === 'screen')
    expect(spots).toHaveLength(4)
    for (const s of spots) expect(s.position[1]).toBeCloseTo(SCREEN_EYE)
    const list = scene([workshop]).filter((o) => o.kind === 'work' && o.slot === 'screen')
    expect(list).toHaveLength(4)
    for (const o of list) expect((o.box!.min[1] + o.box!.max[1]) / 2).toBeGreaterThanOrEqual(1.1)
  })

  it('hangs them flat on the front wall, clear of the door gap and of the windows, none over another', () => {
    const workshop = day7('workshop')
    const [fw, fd] = workshop.exterior.footprint
    const room = settledPlace(workshop, kit).rooms[0]!
    const hung = hungParts(workshop, kit)
    const px = centreX(workshop)
    const layout = windowLayout(workshop)
    const windows = [...layout.along(0, 'front-left'), ...layout.along(0, 'front-right')].map((w) => w - px)
    expect(windows.length).toBeGreaterThan(0)
    const xs: number[] = []
    for (const i of SCREENS) {
      expect(hung.has(`bench-room/${i}`)).toBe(true)
      const at = room.parts[i]!.at
      // Its back is at the front wall's inside face.
      expect(at[2] + 0.1).toBeCloseTo(fd / 2 - INNER_FACE - OFF_WALL)
      const x = at[0]
      xs.push(x)
      // Clear of the door gap, and of each window and its frame.
      expect(Math.abs(x) - 0.45).toBeGreaterThanOrEqual(DOOR_HALF)
      for (const w of windows) expect(Math.abs(x - w)).toBeGreaterThanOrEqual(0.45 + WINDOW_SIZE[0] / 2 + FRAME)
      // Inside the side walls.
      expect(Math.abs(x) + 0.45).toBeLessThanOrEqual(fw / 2 - INNER_FACE)
    }
    const sorted = [...xs].sort((a, b) => a - b)
    for (let k = 1; k < sorted.length; k++) expect(sorted[k]! - sorted[k - 1]!).toBeGreaterThanOrEqual(0.9)
    // Each keeps its side of the door and its order, as Merge set them.
    expect(xs.map(Math.sign)).toEqual([-1, -1, 1, 1])
    expect(xs).toEqual(sorted)
  })

  it('draws a hung screen without its floor stand: nothing of it lower than its panel', () => {
    const workshop = day7('workshop')
    for (const i of SCREENS) {
      const box = instancesBox(interiorParts(workshop, kit, 0).instances.filter((p) => p.group === `bench-room/${i}`))!
      expect(box.min[1]).toBeGreaterThan(SCREEN_EYE - 0.35)
    }
    expect([...partsInAir(workshop, kit)]).toEqual([])
  })

  it('leaves the doorway clear: no screen in it and no screen collider within reach of a visitor walking through it', () => {
    const workshop = day7('workshop')
    const settled = settledPlace(workshop, kit)
    const px = centreX(workshop)
    for (const i of SCREENS) expect(partInDoorway(settled, kit, settled.rooms[0]!, settled.rooms[0]!.parts[i]!, 0)).toBe(false)
    const screens = furnitureBoxes(workshop, kit, 0).filter((b) => b.part === 'screen-small')
    expect(screens).toHaveLength(4)
    for (const b of screens) {
      expect(Math.min(Math.abs(b.min[0] - px), Math.abs(b.max[0] - px))).toBeGreaterThan(DOOR_HALF)
      // The collider is the screen as drawn, on the wall at eye height.
      expect(b.min[1]).toBeCloseTo(SCREEN_EYE - 0.5)
    }
  })

  it('moves nothing else in the Workshop, and never changes the place file', () => {
    const workshop = day7('workshop')
    const before = JSON.stringify(workshop)
    const room = settledPlace(workshop, kit).rooms[0]!
    workshop.rooms[0]!.parts.forEach((p, i) => {
      if (!SCREENS.includes(i)) expect(room.parts[i]).toEqual(p)
    })
    expect(JSON.stringify(workshop)).toBe(before)
    expect(screenStands(workshop, kit).size).toBe(0)
  })

  it('raises a screen standing in the middle of a room, away from any wall, on a tall slim stand down to the floor', () => {
    const workshop = day7('workshop')
    const main = workshop.rooms[0]!
    const moved: Place = { ...workshop, rooms: [{ ...main, parts: main.parts.map((p, i) => (i === 4 ? { ...p, at: [-1, 0, 1.5] as [number, number, number] } : p)) }] }
    const stands = screenStands(moved, kit)
    expect([...stands.keys()]).toEqual(['bench-room/4'])
    const placed = settledPlace(moved, kit).rooms[0]!.parts[4]!
    expect([placed.at[0], placed.at[2]]).toEqual([-1, 1.5])
    const box = instancesBox(interiorParts(moved, kit, 0).instances.filter((p) => p.group === 'bench-room/4'))!
    // The stand reaches the floor, and the panel is at eye height.
    expect(box.min[1]).toBeCloseTo(0, 2)
    expect(box.max[1]).toBeGreaterThan(SCREEN_EYE + 0.25)
    expect([...partsInAir(moved, kit)]).toEqual([])
    expect(hungParts(moved, kit).has('bench-room/4')).toBe(false)
    // Its collider and its box in the scene stand on the floor too.
    const solid = furnitureBoxes(moved, kit, 0).filter((b) => b.part === 'screen-small')
    expect(solid.some((b) => Math.abs(b.min[1]) < 1e-6 && b.max[1] > SCREEN_EYE)).toBe(true)
    expect(scene([moved]).find((o) => o.id === 'workshop/bench-room/4')!.box!.min[1]).toBeCloseTo(0, 2)
  })

  it('leaves a screen standing on a desk where Merge put it', () => {
    const home = day7('home')
    const main = home.rooms[0]!
    const place: Place = { ...home, rooms: [{ ...main, parts: [...main.parts, { part: 'desk', at: [0, 0, 0], rot: 0 }, { part: 'screen-small', at: [0, 0.8, 0], rot: 0 }] } as never, ...home.rooms.slice(1)] }
    const n = place.rooms[0]!.parts.length
    expect(settledPlace(place, kit).rooms[0]!.parts[n - 1]!.at).toEqual([0, 0.8, 0])
  })
})
