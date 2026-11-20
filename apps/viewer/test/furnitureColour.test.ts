import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { describe, expect, it } from 'vitest'
import { buildingModel } from '../src/world/building.ts'
import { exhibitInstances, exhibitSpots } from '../src/world/exhibitGeometry.ts'
import { interiorParts, unlit } from '../src/world/kitGeometry.ts'
import { FURNITURE, furnitureColour, furniturePalette, hsvOf } from '../src/world/theme.ts'

const fixture = (world: string, id: string) => Place.parse(JSON.parse(readFileSync(fileURLToPath(new URL(`../../../test/fixtures/worlds/${world}/places/${id}.json`, import.meta.url)), 'utf8')))
const home = fixture('day-7', 'home')
const workshop = fixture('day-7', 'workshop')
const lamps = fixture('day-7', 'hillside-room-five-lamps')
const grown6 = fixture('day-30', 'grown-place-6')

/** A colour that reads brown, khaki, olive or beige in shade (the hues of `world.night-muddy`), or grey (too little colour). */
const muddy = (hex: string) => {
  const [h, s] = hsvOf(hex)
  return h >= 15 && h <= 130 && s >= 0.08
}
const grey = (hex: string) => hsvOf(hex)[1] < FURNITURE.colour

describe('furniture in palette colours, never grey, beige or brown (issues 409, 430)', () => {
  for (const p of kit.palettes) {
    it(`gives every furniture slot of ${p.id} a pastel colour off the warm, dull hues and off grey`, () => {
      const f = furniturePalette(p)
      for (const slot of ['wall', 'trim', 'roof', 'floor', 'accent', 'wood', 'metal'] as const) {
        expect(muddy(f.colors[slot]), `${p.id} ${slot} ${f.colors[slot]}`).toBe(false)
        expect(grey(f.colors[slot]), `${p.id} ${slot} ${f.colors[slot]}`).toBe(false)
        // A colour mixed to get there is a pastel: light, not a dark blot (slate's deep indigo trim is its own and stays).
        if (f.colors[slot] !== p.colors[slot]) expect(hsvOf(f.colors[slot])[2], `${p.id} ${slot}`).toBeGreaterThanOrEqual(FURNITURE.light)
      }
      // The glow of a lamp is its own colour.
      expect(f.colors.glow).toBe(p.colors.glow)
    })
  }

  it('keeps a colour that is already a pastel off the warm hues as it is', () => {
    expect(furnitureColour('#c79bff', kit.palettes[0]!.colors)).toBe('#c79bff')
  })

  for (const place of [home, workshop, lamps, grown6]) {
    it(`draws no furniture of ${place.id} grey, beige, khaki or brown (the plinth, the cat bed, the desk cube, the stools)`, () => {
      const parts = interiorParts(place, kit, 0).instances.filter((i) => i.group && !i.glow)
      expect(parts.length).toBeGreaterThan(0)
      for (const i of parts) {
        const part = place.rooms.find((r) => r.id === i.group!.split('/')[0])!.parts[Number(i.group!.split('/')[1])]!.part
        const category = kit.parts.find((k) => k.id === part)!.category
        if (category === 'structure' || category === 'nature') continue
        expect(muddy(i.color), `${place.id} ${i.group} ${part} ${i.color}`).toBe(false)
        expect(grey(i.color), `${place.id} ${i.group} ${part} ${i.color}`).toBe(false)
      }
    })

    it(`draws the exhibits of ${place.id} off the warm, dull hues`, () => {
      const palette = kit.palettes.find((p) => p.id === place.exterior.palette)!
      for (const spot of exhibitSpots(place, kit, 0)) for (const i of exhibitInstances(spot, palette.colors)) if (!i.glow) expect(muddy(i.color), `${spot.exhibit.id} ${i.color}`).toBe(false)
    })
  }

  it('draws a glowing surface whose lamps are off in a pastel, not the tan of a lemon screen in shade (Grown Place 6)', () => {
    const glow = buildingModel(grown6, kit, 0)!.instances.filter((i) => i.glow)
    expect(glow.length).toBeGreaterThan(0)
    for (const i of glow) {
      const off = unlit(i, kit.palettes.find((p) => p.id === grown6.exterior.palette)!.colors)
      expect(off.glow ?? false).toBe(false)
      expect(muddy(off.color), off.color).toBe(false)
    }
  })

  it('lights the doorstep as trim, so a yellow step is not khaki at night', () => {
    const model = buildingModel(workshop, kit, 0)!
    const accent = kit.palettes.find((p) => p.id === workshop.exterior.palette)!.colors.accent
    const steps = model.slots.base.filter((i) => i.color === accent)
    expect(steps.length).toBeGreaterThan(0)
    for (const s of steps) expect(s.trim).toBe(true)
  })
})
