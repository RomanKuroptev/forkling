import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { WALL, starterPlaces } from '@forkling/sim'
import { INNER_FACE } from '../src/world/building.ts'
import { OFF_WALL, hungParts, partsInAir, settledPlace } from '../src/world/insideWalls.ts'
import { interiorParts } from '../src/world/kitGeometry.ts'
import { furnitureBoxes } from '../src/world/solidFurniture.ts'
import { instancesBox } from '../src/qa/sceneList.ts'
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
    // Home fits as it is. The Workshop does too, but for its four floor-standing screens, which are hung at eye height (issue 431).
    for (const p of starterPlaces()) {
      const settled = settledPlace(p, kit)
      if (p.id !== 'workshop') expect(settled).toEqual(p)
      else p.rooms.forEach((room, r) => room.parts.forEach((part, i) => (part.part === 'screen-small' ? expect(settled.rooms[r]!.parts[i]).not.toEqual(part) : expect(settled.rooms[r]!.parts[i]).toEqual(part))))
      expect(settledPlace(settled, kit)).toEqual(settled)
    }
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

describe('a stack moves as one, and a screen on nothing against a wall is hung (issue 339, the look review of #412)', () => {
  /** Home with a desk poking into its east wall, a desk lamp standing on the desk and a screen on the lamp's side of it. */
  const withDesk = (): Place => {
    const home = day7('home')
    const main = home.rooms[0]!
    const desk = { part: 'desk', at: [5.4, 0, -1], rot: 0 }
    const lamp = { part: 'lamp-desk', at: [5.9, 0.8, -1.2], rot: 0 }
    const screen = { part: 'screen-small', at: [5.2, 0.8, -0.8], rot: 0 }
    return { ...home, rooms: [{ ...main, at: [0, 0], size: [11.6, 8, 3.2], parts: [...main.parts, desk, lamp, screen] } as never, ...home.rooms.slice(1)] }
  }

  it('moves what stands on a part by the same amount as the part, so a lamp and a screen stay on their desk', () => {
    const place = withDesk()
    const before = place.rooms[0]!.parts
    const after = settledPlace(place, kit).rooms[0]!.parts
    const n = before.length
    const move = (i: number) => [after[i]!.at[0] - before[i]!.at[0], after[i]!.at[2] - before[i]!.at[2]]
    // The lamp pokes furthest (it stands at the desk's east edge), so the whole stack moves by what the lamp needs.
    expect(move(n - 3)[0]).toBeLessThan(0)
    expect(move(n - 2)).toEqual(move(n - 3))
    expect(move(n - 1)).toEqual(move(n - 3))
    for (const i of [n - 2, n - 1]) expect(after[i]!.at[1]).toBe(before[i]!.at[1])
  })

  it("hangs Tiny Patch's screen on Home's back wall: Merge set it 1.2 m up on nothing, so it is drawn without its stand", () => {
    const home = day7('home')
    expect([...hungParts(home, kit)]).toEqual(['counter-room/1'])
    const screen = interiorParts(home, kit, 0).instances.filter((i) => i.group === 'counter-room/1')
    const box = instancesBox(screen)!
    // Nothing of it is lower than its panel: no foot in mid-air.
    expect(box.min[1]).toBeGreaterThan(1.2 + 0.19)
    // The screen is where Merge set it, as high, and its back is at the wall's inside face.
    const settled = settledPlace(home, kit).rooms[1]!
    expect(settled.parts[1]!.at[1]).toBe(1.2)
    expect(settled.at[1] + settled.parts[1]!.at[2] - 0.1).toBeCloseTo(-(home.exterior.footprint[1] / 2 - INNER_FACE - OFF_WALL))
  })

  it('does not hang a screen standing on a desk; a screen on the floor by a wall is hung at eye height (issue 431)', () => {
    const place = withDesk()
    const n = place.rooms[0]!.parts.length
    expect(hungParts(place, kit).has(`main/${n - 1}`)).toBe(false)
    for (const p of starterPlaces()) {
      const screens = p.rooms.flatMap((room) => room.parts.flatMap((part, i) => (part.part === 'screen-small' ? [`${room.id}/${i}`] : [])))
      expect([...hungParts(p, kit)].sort(), p.id).toEqual(screens.sort())
    }
  })
})

describe('nothing drawn with a foot stands in mid-air (the look review of #412)', () => {
  const fixture = (name: string): Place[] => {
    const dir = fileURLToPath(new URL(`../../../test/fixtures/worlds/${name}/places/`, import.meta.url))
    return readdirSync(dir).map((f) => Place.parse(JSON.parse(readFileSync(dir + f, 'utf8'))))
  }

  it('finds no part in mid-air in any fixture world, and lists none in the scene', () => {
    for (const name of ['day-0', 'day-7', 'day-30', 'building']) {
      const ps = fixture(name)
      for (const p of ps) expect([...partsInAir(p, kit)], `${name} ${p.id}`).toEqual([])
      expect(scene(ps).filter((o) => o.inAir)).toEqual([])
    }
  })

  it("finds Tiny Patch's screen in mid-air when it stands 1.2 m up in the middle of the room, away from any wall, and lists it so", () => {
    const home = day7('home')
    const counter = home.rooms[1]!
    const moved: Place = { ...home, rooms: [home.rooms[0]!, { ...counter, at: [0, 0], parts: counter.parts.map((p, i) => (i === 1 ? { ...p, at: [0, 1.2, 0] as [number, number, number] } : p)) }] }
    expect([...partsInAir(moved, kit)]).toEqual(['counter-room/1'])
    expect(scene([moved]).find((o) => o.id === 'home/counter-room/1')!.inAir).toBe(true)
    // A lantern on its chain is made to hang, and is never in mid-air.
    expect([...partsInAir(home, kit)]).toEqual([])
  })
})

describe('the visitor bumps into furniture where it is drawn (issue 357 with 339)', () => {
  it("gives the Counter Room's plinth its collider where it is drawn, pulled in from the wall, not where the file puts it", () => {
    const home = day7('home')
    const list = scene([home])
    const f = list.find((o) => o.id === 'home')!.footprint!
    const drawn = list.find((o) => o.id === 'home/counter-room/0')!.box!
    const solid = furnitureBoxes(home, kit, 0).filter((b) => b.part === 'plinth')
    expect(solid).toHaveLength(1)
    solid[0]!.min.forEach((n, k) => expect(n).toBeCloseTo(drawn.min[k]!, 2))
    solid[0]!.max.forEach((n, k) => expect(n).toBeCloseTo(drawn.max[k]!, 2))
    expect(solid[0]!.max[0]).toBeLessThanOrEqual(f.x1 - INNER_FACE)
  })
})
