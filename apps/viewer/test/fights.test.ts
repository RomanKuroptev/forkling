import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { starterPlaces } from '@forkling/sim'
import { placeFights } from '../src/qa/fights.ts'
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
})
