import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { starterPlaces, surfaceFights } from '@forkling/sim'
import { coveredDoors, placeFights, signFightBoxes } from '../src/qa/fights.ts'
import { buildingModel } from '../src/world/building.ts'
import { interiorInstances } from '../src/world/kitGeometry.ts'

/** Every place of the audit's fixture worlds (test/fixtures/worlds), and Home and the Workshop. */
function fixturePlaces(): Place[] {
  const root = join(__dirname, '../../../test/fixtures/worlds')
  const out: Place[] = [...starterPlaces()]
  for (const world of readdirSync(root)) {
    const dir = join(root, world, 'places')
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      const p = Place.safeParse(JSON.parse(readFileSync(join(dir, f), 'utf8')))
      if (p.success) out.push({ ...p.data, id: `${world}/${p.data.id}` })
    }
  }
  return out
}

const fights = (places: Place[]) => placeFights({ places, kit, heightAt: () => 0, nowMs: 0 })
const describeFight = (f: ReturnType<typeof fights>[number]) => `${f.place}: ${f.a} / ${f.b} at ${f.at.map((n) => n.toFixed(2)).join(', ')}`

describe('surfaces that fight (z-fighting) in the drawn places', () => {
  it('none in the fixture worlds, outside or in (issues 350, 353, 335, 337, 364, 370, 371)', () => {
    expect(fights(fixturePlaces()).map(describeFight)).toEqual([])
  })

  it("the sign board's painted face is in the list, and fights neither its board nor its posts (issue 406)", () => {
    const home = starterPlaces()[0]!
    const boxes = signFightBoxes(home, kit, 0)
    expect(boxes.map((b) => b.what)).toContain('the sign board')
    expect(boxes.filter((b) => b.what === 'the sign post').length).toBeGreaterThan(0)
    expect(surfaceFights(boxes)).toEqual([])
  })

  it('none in any style of the building model, one to three floors high (the outside and its floors)', () => {
    const base = fixturePlaces().find((p) => p.id === 'day-30/grown-place-4')!
    const places = Object.keys({ timber: 1, stone: 1, glass: 1, 'tin-shack': 1, tower: 1 }).flatMap((style) =>
      [1, 2, 3].map((floors) => ({ ...base, id: `${style}-${floors}`, exterior: { ...base.exterior, style, floors }, rooms: base.rooms.filter((r) => r.floor === 0), exhibits: [] })),
    )
    expect(fights(places).map(describeFight)).toEqual([])
  })

  it("the ground floor's top stands over the slab's top, and its underside under the storey's line", () => {
    const home = starterPlaces()[0]!
    const floor = interiorInstances(home, kit, 0)[0]!
    const slab = buildingModel(home, kit, 0)!.slots.base[0]!
    const top = (m: number[]) => m[13]! + m[5]! / 2
    expect(top(floor.matrix)).toBeGreaterThan(top(slab.matrix) + 0.005)
    expect(floor.matrix[13]! - floor.matrix[5]! / 2).toBeLessThan(-0.005)
  })

  it("the crown does not float over the roof: something stands under it from the roof up (issue 364)", () => {
    const home = starterPlaces()[0]!
    const model = buildingModel(home, kit, 0)!
    const roofTop = Math.max(...model.slots.body.map((i) => i.matrix[13]! + Math.abs(i.matrix[5]!) / 2))
    const crownFoot = Math.min(...model.slots.crown.filter((i) => i.shape === 'cone').map((i) => i.matrix[13]! - i.matrix[5]! / 2))
    expect(crownFoot - roofTop).toBeGreaterThan(1)
    const drums = model.slots.crown.filter((i) => i.shape === 'box' && i.matrix[13]! - i.matrix[5]! / 2 <= roofTop && i.matrix[13]! + i.matrix[5]! / 2 >= crownFoot - 0.001)
    expect(drums).toHaveLength(1)
  })

  it('the drum is under the front top: the crown over the front is still a third to two thirds of the body, in every style (look.md)', () => {
    const home = starterPlaces()[0]!
    for (const style of ['timber', 'stone', 'tin-shack', 'tower']) {
      const place = { ...home, exterior: { ...home.exterior, style } }
      const model = buildingModel(place, kit, 0)!
      const body = Math.max(...model.slots.body.map((i) => i.matrix[13]! + Math.abs(i.matrix[5]!) / 2)) - 0.02
      const crownOverFront = model.outlineHeight - model.front.height
      expect(crownOverFront, style).toBeGreaterThanOrEqual(body / 3 - 0.01)
      expect(crownOverFront, style).toBeLessThanOrEqual((2 * body) / 3 + 0.01)
      // Every drum ends at the front's top, where the crown starts.
      const top = model.front.height
      for (const d of model.slots.crown.filter((i) => i.matrix[13]! + Math.abs(i.matrix[5]!) / 2 <= top + 0.001)) expect(d.matrix[13]! + Math.abs(d.matrix[5]!) / 2, style).toBeCloseTo(top, 5)
    }
  })
})

describe('doors the building covers', () => {
  const snapshot = (places: Place[]) => ({ places, kit, heightAt: () => 0, nowMs: 0 })

  /**
   * A two-floor place whose upper room has a door part set flush with the front wall: what the old day-30 generator made of the
   * hillside room (grown place 5), kept here since day-30 now grows the engine's way and no longer copies the ground room's door upstairs.
   */
  const upperDoor = (): Place => {
    const hillside = fixturePlaces().find((p) => p.id === 'day-7/hillside-room-five-lamps')!
    const first = hillside.rooms[0]!
    return { ...hillside, id: 'upper-door', exterior: { ...hillside.exterior, floors: 2, palette: 'ember' }, rooms: [{ ...first, id: 'main-room' }, { ...first, id: 'room-2', floor: 1 }] }
  }

  it('none in the fixture worlds, nor on an upper floor door set flush with its wall: it stands in front of it (issue 370, second try)', () => {
    expect(coveredDoors(snapshot([...fixturePlaces(), upperDoor()]))).toEqual([])
  })

  it('planted: a door pushed 1.5 cm into the wall it was flush with is found, with the wall in front of it', () => {
    const base = upperDoor()
    const room = base.rooms.find((r) => r.floor === 1)!
    const index = room.parts.findIndex((p) => p.part.startsWith('door'))
    expect(index).toBeGreaterThanOrEqual(0)
    const pushed: Place = {
      ...base,
      rooms: base.rooms.map((r) => (r !== room ? r : { ...r, parts: r.parts.map((p, k) => (k !== index ? p : { ...p, at: [p.at[0], p.at[1], p.at[2] - 0.015] as [number, number, number] })) })),
    }
    const found = coveredDoors(snapshot([pushed]))
    expect(found.length).toBeGreaterThan(0)
    expect(found[0]!.door).toContain(`${room.id}/${index}`)
    expect(found[0]!.by).toContain('the body of the building')
    expect(found[0]!.gap).toBeCloseTo(0.005, 3)
  })
})
