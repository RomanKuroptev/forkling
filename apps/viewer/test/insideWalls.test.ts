import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { WALL, starterPlaces } from '@forkling/sim'
import { INNER_FACE } from '../src/world/building.ts'
import { settledPlace } from '../src/world/insideWalls.ts'
import { placeObjects } from '../src/qa/sceneList.ts'

const day7 = (id: string): Place => Place.parse(JSON.parse(readFileSync(fileURLToPath(new URL(`../../../test/fixtures/worlds/day-7/places/${id}.json`, import.meta.url)), 'utf8')))
const places = () => [day7('home'), day7('hillside-room-five-lamps'), day7('workshop')]
const scene = (ps: Place[]) => placeObjects({ places: ps, kit, heightAt: () => 0, interiors: new Set(ps.map((p) => p.id)), nowMs: Date.parse('2026-11-26T13:00:00Z'), plots: [] })
const structure = new Set(kit.parts.filter((p) => p.category === 'structure').map((p) => p.id))

describe('nothing of the inside stands in or through the walls (issues 339, 373)', () => {
  it("draws every piece of furniture and every exhibit of day-7 inside the walls' inner face: Tiny Patch's screen and the Counter Room no longer poke out", () => {
    const list = scene(places())
    const footprints = new Map(list.filter((o) => o.kind === 'place').map((o) => [o.id, o.footprint!]))
    const things = list.filter((o) => (o.kind === 'part' && !structure.has(o.name!) && !o.inDoorway) || o.kind === 'exhibit' || (o.kind === 'work' && o.slot !== 'gallery-wall'))
    expect(things.some((o) => o.id === 'home/screen-tiny-patch-mostly-empty')).toBe(true)
    for (const o of things) {
      const f = footprints.get(o.place!)!
      const inside = o.box!.min[0] >= f.x0 + INNER_FACE - 1e-3 && o.box!.max[0] <= f.x1 - INNER_FACE + 1e-3 && o.box!.min[2] >= f.z0 + INNER_FACE - 1e-3 && o.box!.max[2] <= f.z1 - INNER_FACE + 1e-3
      expect(inside, `${o.id} ${JSON.stringify(o.box)} in ${JSON.stringify(f)}`).toBe(true)
    }
  })

  it('draws every room where a visitor can walk: inside the wall ring, so the Counter Room has a way in', () => {
    const list = scene(places())
    const footprints = new Map(list.filter((o) => o.kind === 'place').map((o) => [o.id, o.footprint!]))
    for (const room of list.filter((o) => o.kind === 'room')) {
      const f = footprints.get(room.place!)!
      const b = room.box!
      expect(b.min[0] >= f.x0 + WALL - 1e-3 && b.max[0] <= f.x1 - WALL + 1e-3 && b.min[2] >= f.z0 + WALL - 1e-3 && b.max[2] <= f.z1 - WALL + 1e-3, `${room.id} ${JSON.stringify(b)}`).toBe(true)
    }
  })

  it('keeps the parts of a moved room where they stood when they already fit, and windows and doors where Merge put them', () => {
    const home = day7('home')
    const settled = settledPlace(home, kit)
    const counter = settled.rooms.find((r: Place['rooms'][number]) => r.id === 'counter-room')!
    expect(counter.at[0]).toBeCloseTo(home.exterior.footprint[0] / 2 - WALL - 0.5)
    // The room is as deep as the footprint, so it is drawn as deep as the inside; it keeps its height.
    expect(counter.size).toEqual([1, home.exterior.footprint[1] - 2 * WALL, 3.2])
    // The plinth (0.7 m wide) is pulled in until it clears the wall's inner face, and the notice board (1.2 m wide, turned to face
    // along x) only until it clears the front wall's: each moves no further than it must.
    const plinth = counter.at[0] + counter.parts[0]!.at[0]
    expect(plinth).toBeCloseTo(home.exterior.footprint[0] / 2 - INNER_FACE - 0.35)
    expect(counter.at[1] + counter.parts[5]!.at[2]).toBeCloseTo(home.exterior.footprint[1] / 2 - INNER_FACE - 0.6, 2)
    // The main room fits, so nothing in it moves.
    expect(settled.rooms[0]).toEqual(home.rooms[0])
  })

  it('leaves a place that already fits as it is, and is the same when done twice', () => {
    for (const p of starterPlaces()) expect(settledPlace(p, kit)).toEqual(p)
    const once = settledPlace(day7('home'), kit)
    expect(settledPlace(once, kit)).toEqual(once)
  })

  it('never changes the place it is given (the body walks the place file as it is)', () => {
    const home = day7('home')
    const before = JSON.stringify(home)
    settledPlace(home, kit)
    expect(JSON.stringify(home)).toBe(before)
  })
})
