import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { placeCentre, toLandPlace } from '@forkling/sim'
import { describe, expect, it } from 'vitest'
import { FRAME, WINDOW_SIZE, buildingModel, partKey, windowLayout } from '../src/world/building.ts'
import { interiorInstances, lampSpots, sceneInstances, SHAPES } from '../src/world/kitGeometry.ts'
import type { Instance } from '../src/world/kitBase.ts'
import { INTERIOR, NIGHT_LIGHT, dayLift, interiorWall, repaint } from '../src/world/theme.ts'

const fixture = (world: string, id: string) => Place.parse(JSON.parse(readFileSync(fileURLToPath(new URL(`../../../test/fixtures/worlds/${world}/places/${id}.json`, import.meta.url)), 'utf8')))
const lamps = fixture('day-7', 'hillside-room-five-lamps')
const home = fixture('day-7', 'home')
const workshop = fixture('day-7', 'workshop')

const half = (i: Instance): [number, number, number] => [0.5 * Math.hypot(i.matrix[0]!, i.matrix[1]!, i.matrix[2]!), 0.5 * Math.hypot(i.matrix[4]!, i.matrix[5]!, i.matrix[6]!), 0.5 * Math.hypot(i.matrix[8]!, i.matrix[9]!, i.matrix[10]!)]
const at = (i: Instance): [number, number, number] => [i.matrix[12]!, i.matrix[13]!, i.matrix[14]!]
const panes = (p: Place) => buildingModel(p, kit, 0)!.slots.glow.filter((i) => Math.abs(half(i)[1] * 2 - WINDOW_SIZE[1]) < 1e-6)

/** Hue (degrees), saturation and value of a hex colour. */
const hsv = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  const mx = Math.max(r, g, b)
  const d = mx - Math.min(r, g, b)
  let h = 0
  if (d > 0) h = (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
  return [(h + 360) % 360, mx ? d / mx : 0, mx]
}

describe('a window part Merge put against a wall is the wall window (issue 346)', () => {
  it('puts the back window of the Five Lamps Room where its large window part is, and draws the part no more', () => {
    const [px, pz] = placeCentre(toLandPlace(lamps))
    const room = lamps.rooms[0]!
    const k = room.parts.findIndex((p) => p.part === 'window-large')
    const { consumed } = windowLayout(lamps)
    expect(consumed.has(partKey(0, k))).toBe(true)
    const partX = px + room.at[0] + room.parts[k]!.at[0]
    const back = panes(lamps).filter((i) => at(i)[2] < pz - 2)
    expect(back).toHaveLength(1)
    expect(at(back[0]!)[0]).toBeCloseTo(partX, 5)
    // No glass of a window part is left floating inside the room.
    const glass = repaint('#bfe3f0')
    expect(interiorInstances(lamps, kit, 0).filter((i) => i.color === glass)).toHaveLength(0)
  })

  it('keeps the even windows of a wall with no window part', () => {
    expect(windowLayout(home).consumed.size).toBe(0)
    expect(panes(home).length).toBeGreaterThan(0)
  })
})

describe('each window pane is framed and is not a slab (issue 358)', () => {
  for (const p of [home, workshop, lamps]) {
    it(`frames every pane of ${p.id} in the accent colour`, () => {
      const m = buildingModel(p, kit, 0)!
      const accent = kit.palettes.find((q) => q.id === p.exterior.palette)!.colors.accent
      for (const pane of panes(p)) {
        const frame = m.slots.glow.find((i) => i.color === accent && Math.hypot(...at(i).map((v, k) => v - at(pane)[k]!)) < 1e-6)
        expect(frame, `frame at ${at(pane).join(',')}`).toBeDefined()
        expect(half(frame!)[1] * 2).toBeCloseTo(WINDOW_SIZE[1] + 2 * FRAME, 5)
        expect(frame!.trim).toBe(true)
        // The pane stands only a little out of the wall (0.4 m thick): never the 0.9 m slab it was.
        expect(Math.min(half(pane)[0], half(pane)[2]) * 2).toBeLessThan(0.7)
      }
    })
  }
})

describe('the walls inside have a colour of their own (issue 358)', () => {
  it('lines the walls inside in the palette trim mixed towards the face colour, never brown, olive or near white', () => {
    for (const palette of kit.palettes) {
      const c = interiorWall(palette.colors.trim)
      const [h, s, v] = hsv(c)
      expect(s, `${palette.id} ${c} has colour`).toBeGreaterThan(0.2)
      expect(h >= 15 && h <= 130 && v < 0.7, `${palette.id} ${c} is not muddy`).toBe(false)
      const p = { ...home, exterior: { ...home.exterior, palette: palette.id } }
      const inside = buildingModel(p, kit, 0)!.inside
      expect(inside.length).toBeGreaterThan(0)
      for (const i of inside) {
        expect(i.color).toBe(c)
        expect(i.inside).toBe(true)
      }
    }
  })

  it('leaves the windows open: no lining covers a pane', () => {
    for (const p of [home, workshop, lamps]) {
      const m = buildingModel(p, kit, 0)!
      for (const pane of panes(p)) {
        const [x, y, z] = at(pane)
        const [hx, hy, hz] = half(pane)
        for (const l of m.inside) {
          const [lx, ly, lz] = at(l)
          const [ax, ay, az] = half(l)
          const overlap = Math.abs(lx - x) < ax + hx - 0.01 && Math.abs(ly - y) < ay + hy - 0.01 && Math.abs(lz - z) < az + hz - 0.01
          expect(overlap, `${p.id} lining over the pane at ${x},${y},${z}`).toBe(false)
        }
      }
    }
  })

  it('does not line a glass house, whose walls are see-through', () => {
    expect(buildingModel({ ...home, exterior: { ...home.exterior, style: 'glass' } }, kit, 0)!.inside).toHaveLength(0)
  })

  it('marks everything drawn inside as inside, and nothing outside', () => {
    const outside = sceneInstances([home], kit, { heightAt: () => 0, interiors: new Set() })
    const both = sceneInstances([home], kit, { heightAt: () => 0, interiors: new Set([home.id]) })
    for (const shape of SHAPES) {
      expect([...outside[shape].inside].every((v) => v === 0)).toBe(true)
      expect([...both[shape].inside].filter((v) => v === 1).length).toBe(both[shape].count - outside[shape].count)
    }
  })
})

describe('warm lamp light at night (issue 361)', () => {
  it('has a lamp spot for each lamp that is on, at the height of its shade, and none with the lamps off', () => {
    const spots = lampSpots(lamps, kit, 0, true)
    expect(spots).toHaveLength(5)
    for (const s of spots) expect(s.position[1]).toBeGreaterThan(1.2)
    expect(lampSpots(lamps, kit, 0, false)).toHaveLength(0)
  })

  it('gives the scene the lamps of the insides drawn only', () => {
    expect(sceneInstances([lamps], kit, { heightAt: () => 0, interiors: new Set() }).lamps).toHaveLength(0)
    expect(sceneInstances([lamps], kit, { heightAt: () => 0, interiors: new Set([lamps.id]) }).lamps).toHaveLength(5)
  })

  it('makes lamps stronger and glow stronger at night, and the flat self-light weaker (look.md rule 8, rule 3)', () => {
    expect(INTERIOR.lampNight).toBeGreaterThan(INTERIOR.lampDay)
    expect(NIGHT_LIGHT.glowNight).toBeGreaterThan(NIGHT_LIGHT.glowDay)
    expect(NIGHT_LIGHT.selfNight).toBeLessThan(NIGHT_LIGHT.selfDay)
    expect(INTERIOR.skyInside).toBeLessThan(1)
  })
})

describe('no room is dim by day (#405 look review)', () => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const light = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16)
    return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255)
  }

  it('mixes the lining of a dark-trim palette (slate, dusk) towards white by day to the day wall light, and leaves light ones alone', () => {
    for (const palette of kit.palettes) {
      const c = interiorWall(palette.colors.trim)
      const t = dayLift(c)
      expect(t, palette.id).toBeGreaterThanOrEqual(0)
      expect(t, palette.id).toBeLessThan(1)
      // Mixed that far towards white, its light is the day wall light (linear light mixes linearly).
      if (t > 0) expect(light(c) + t * (1 - light(c)), palette.id).toBeCloseTo(INTERIOR.dayWallLight, 6)
      else expect(light(c), palette.id).toBeGreaterThanOrEqual(INTERIOR.dayWallLight)
    }
    expect(dayLift(interiorWall(kit.palettes.find((p) => p.id === 'slate')!.colors.trim))).toBeGreaterThan(0.3)
    expect(dayLift(interiorWall(kit.palettes.find((p) => p.id === 'dusk')!.colors.trim))).toBeGreaterThan(0.2)
  })

  it('gives the lift to the lining of the Workshop and packs it for the shader, and gives none to the outside', () => {
    const lining = buildingModel(workshop, kit, 0)!.inside
    for (const i of lining) expect(i.dayLift).toBeGreaterThan(0.3)
    expect(buildingModel(workshop, kit, 0)!.instances.every((i) => !i.dayLift)).toBe(true)
    const scene = sceneInstances([workshop], kit, { heightAt: () => 0, interiors: new Set([workshop.id]) })
    expect([...scene.box.dayLift].filter((v) => v > 0).length).toBe(lining.length)
  })
})
