import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { WALL, starterPlaces } from '@forkling/sim'
import { INNER_FACE } from '../src/world/building.ts'
import { OFF_WALL, settledPlace } from '../src/world/insideWalls.ts'
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

  it("brings the Counter Room's things out of the wall to where a visitor walks: each within reach of the floor inside the wall ring", () => {
    const list = scene(places())
    const f = list.find((o) => o.id === 'home')!.footprint!
    const held = list.filter((o) => (o.kind === 'exhibit' || o.kind === 'work') && o.at?.startsWith('home/counter-room/'))
    expect(held.map((o) => o.id).sort()).toEqual(['home/brainfuck-extensions-skateboard', 'home/screen-tiny-patch-mostly-empty'])
    for (const o of held) {
      const cx = (o.box!.min[0] + o.box!.max[0]) / 2
      const cz = (o.box!.min[2] + o.box!.max[2]) / 2
      // Its middle is in front of the inside face of the walls, so it shows and can be pointed at from the walkable floor.
      expect(cx <= f.x1 - INNER_FACE && cz >= f.z0 + INNER_FACE, `${o.id} ${JSON.stringify(o.box)}`).toBe(true)
      expect(Math.max(0, cx - (f.x1 - WALL)) + Math.max(0, f.z0 + WALL - cz)).toBeLessThan(0.5)
    }
  })

  it('moves a part no further than it must, keeps the rooms as Merge made them, and leaves windows and doors where Merge put them', () => {
    const home = day7('home')
    const settled = settledPlace(home, kit)
    const before = home.rooms.find((r: Place['rooms'][number]) => r.id === 'counter-room')!
    const counter = settled.rooms.find((r: Place['rooms'][number]) => r.id === 'counter-room')!
    // The room itself is not drawn, and moving it would put it through the main room: it keeps its place and size.
    expect(counter.at).toEqual(before.at)
    expect(counter.size).toEqual(before.size)
    // The plinth (0.7 m wide) is pulled in until it clears the wall's inner face, and the notice board (1.2 m wide, turned to face
    // along x) only until it clears the front wall's, each a little in front of the face so the two do not fight.
    expect(counter.at[0] + counter.parts[0]!.at[0]).toBeCloseTo(home.exterior.footprint[0] / 2 - INNER_FACE - OFF_WALL - 0.35)
    expect(counter.at[1] + counter.parts[5]!.at[2]).toBeCloseTo(home.exterior.footprint[1] / 2 - INNER_FACE - OFF_WALL - 0.6, 2)
    // Heights and turns never change; the main room fits, so nothing in it moves.
    counter.parts.forEach((p, i) => expect([p.at[1], p.rot]).toEqual([before.parts[i]!.at[1], before.parts[i]!.rot]))
    expect(settled.rooms[0]).toBe(home.rooms[0])
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
