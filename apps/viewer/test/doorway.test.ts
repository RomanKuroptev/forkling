import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { DOOR_HALF, WALL, placeCentre, toLandPlace } from '@forkling/sim'
import { DOOR_STEP, doorwayBox, partInDoorway } from '../src/world/doorway.ts'
import { exhibitSpots } from '../src/world/exhibitGeometry.ts'
import { interiorParts } from '../src/world/kitGeometry.ts'
import { instancesBox, placeObjects, type QaBox } from '../src/qa/sceneList.ts'

const day7 = (id: string): Place => Place.parse(JSON.parse(readFileSync(fileURLToPath(new URL(`../../../test/fixtures/worlds/day-7/places/${id}.json`, import.meta.url)), 'utf8')))
const overlaps = (a: QaBox, b: QaBox) => [0, 1, 2].every((k) => Math.min(a.max[k]!, b.max[k]!) - Math.max(a.min[k]!, b.min[k]!) > 0.01)

describe('doorways are clear (issues 342, 345, 354)', () => {
  it('the doorway is the door gap, from just above the floor to the lintel, through the front wall and a step inside', () => {
    const home = day7('home')
    const [px, pz] = placeCentre(toLandPlace(home))
    const box = doorwayBox(home, 0)
    expect(box.min[0]).toBeCloseTo(px - DOOR_HALF)
    expect(box.max[0]).toBeCloseTo(px + DOOR_HALF)
    expect(box.max[2]).toBeCloseTo(pz + home.exterior.footprint[1] / 2)
    expect(box.min[2]).toBeCloseTo(pz + home.exterior.footprint[1] / 2 - WALL - DOOR_STEP)
    expect(box.min[1]).toBeGreaterThan(0.1)
    expect(box.max[1]).toBeCloseTo(2.2)
  })

  it("finds Home's frame and the Hillside Room's door leaf in their doorways, and nothing else of day-7", () => {
    const found: string[] = []
    for (const place of [day7('home'), day7('hillside-room-five-lamps'), day7('workshop')]) {
      for (const room of place.rooms) {
        room.parts.forEach((placed, k) => {
          if (partInDoorway(place, kit, room, placed, 0)) found.push(`${place.id}/${room.id}/${k}:${placed.part}`)
        })
      }
    }
    expect(found.sort()).toEqual(['hillside-room-five-lamps/lamp-room/4:door-wood', 'home/main/8:frame-large'])
  })

  it('draws nothing of the inside in a doorway: no frame hanging in it, no door leaf standing in it', () => {
    for (const place of [day7('home'), day7('hillside-room-five-lamps'), day7('workshop')]) {
      const door = doorwayBox(place, 0)
      const inside = interiorParts(place, kit, 0).instances
      const inTheWay = inside.filter((i) => overlaps(instancesBox([i])!, door))
      expect(inTheWay, place.id).toEqual([])
    }
  })

  it('a rug or floor boards on the floor of the doorway stay: they are walked over', () => {
    const hillside = day7('hillside-room-five-lamps')
    const boards = hillside.rooms[0]!.parts.findIndex((p) => p.part === 'floor-boards' && p.at[2] > 0 && p.at[0] < 0)
    expect(partInDoorway(hillside, kit, hillside.rooms[0]!, hillside.rooms[0]!.parts[boards]!, 0)).toBe(false)
  })

  it('an exhibit in a part that is not drawn is not drawn either', () => {
    const home = day7('home')
    const withFrame: Place = { ...home, exhibits: [...home.exhibits, { ...home.exhibits[0]!, id: 'in-the-door', slot: 'main/8/0' }] }
    expect(exhibitSpots(withFrame, kit, 0).map((s) => s.exhibit.id)).not.toContain('in-the-door')
  })

  it("the scene list has each place's doorway and every drawn part, and no drawn part stands in a doorway", () => {
    const places = [day7('home'), day7('hillside-room-five-lamps'), day7('workshop')]
    const scene = placeObjects({ places, kit, heightAt: () => 0, interiors: new Set(places.map((p) => p.id)), nowMs: Date.parse('2026-11-26T13:00:00Z'), plots: [] })
    const doors = scene.filter((o) => o.kind === 'door')
    expect(doors.map((d) => d.id).sort()).toEqual(['hillside-room-five-lamps/door', 'home/door', 'workshop/door'])
    const parts = scene.filter((o) => o.kind === 'part' && !o.inDoorway)
    expect(parts.some((p) => p.id === 'home/main/0' && p.name === 'desk' && p.visible)).toBe(true)
    for (const door of doors) for (const p of parts) expect(overlaps(p.box!, door.box!), `${p.id} in ${door.id}`).toBe(false)
  })

  it('lists a part left out of a doorway as not drawn, with the exhibits it holds, so nothing is hidden silently', () => {
    const home = day7('home')
    const withFrame: Place = { ...home, exhibits: [...home.exhibits, { ...home.exhibits[0]!, id: 'in-the-door', slot: 'main/8/0' }] }
    const list = (p: Place) => placeObjects({ places: [p], kit, heightAt: () => 0, interiors: new Set([p.id]), nowMs: Date.parse('2026-11-26T13:00:00Z'), plots: [] })
    const empty = list(home).find((o) => o.id === 'home/main/8')!
    expect(empty).toMatchObject({ kind: 'part', name: 'frame-large', visible: false, inDoorway: { holds: [] } })
    expect(list(withFrame).find((o) => o.id === 'home/main/8')!.inDoorway).toEqual({ holds: ['in-the-door'] })
    // Every other fixture place: a part in a doorway holds nothing today (the reviewer's guard on day-7, issue 354).
    for (const place of [home, day7('hillside-room-five-lamps'), day7('workshop')]) for (const o of list(place)) if (o.inDoorway) expect(o.inDoorway.holds, o.id).toEqual([])
  })
})
