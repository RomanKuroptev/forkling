import type { Kit, KitPalette, Place, SlotKind } from '@forkling/schema'
import { createPrng, placeCentre, toLandPlace, type NeglectLevel } from '@forkling/sim'
import { floorHeight, type Instance } from './kitBase.ts'
import { compose } from './matrix.ts'

/**
 * What stands in a place's slots, and how neglect shows (spec 4.4, 5.1, 4.6), as plain arrays like the rest of the kit's geometry.
 */
export interface ExhibitSpot {
  exhibit: Place['exhibits'][number]
  placeId: string
  slotKind: SlotKind
  /** Where its slot is in the world. */
  position: [number, number, number]
  /** The turn of the part it stands on, about y. */
  rotY: number
}

/** Each exhibit at its slot (`room / part index / slot index`) on its part, in the world. An exhibit whose slot is not there is left out. */
export function exhibitSpots(place: Place, kit: Kit, baseY: number): ExhibitSpot[] {
  const [px, pz] = placeCentre(toLandPlace(place))
  const height = floorHeight(place)
  const spots: ExhibitSpot[] = []
  for (const exhibit of place.exhibits) {
    const m = /^([a-z0-9][a-z0-9-]*)\/(\d+)\/(\d+)$/.exec(exhibit.slot)
    const room = m ? place.rooms.find((r) => r.id === m[1]) : undefined
    const placed = room?.parts[Number(m?.[2])]
    const slot = placed ? kit.parts.find((p) => p.id === placed.part)?.slots[Number(m?.[3])] : undefined
    if (!room || !placed || !slot) continue
    const c = Math.cos(placed.rot)
    const s = Math.sin(placed.rot)
    spots.push({
      exhibit,
      placeId: place.id,
      slotKind: slot.kind,
      position: [px + room.at[0] + placed.at[0] + slot.at[0] * c + slot.at[2] * s, baseY + room.floor * height + placed.at[1] + slot.at[1], pz + room.at[1] + placed.at[2] - slot.at[0] * s + slot.at[2] * c],
      rotY: placed.rot,
    })
  }
  return spots
}

const BRASS = '#c8a24a'
const PAPER = '#e9dfc4'

/** What an exhibit looks like at its spot: a lit screen, a canvas in a frame, a brass plaque, a keepsake on a shelf or in a case. */
export function exhibitInstances(spot: ExhibitSpot, colors: KitPalette['colors']): Instance[] {
  const at = (size: [number, number, number], color: string, dy = 0): Instance => ({ shape: 'box', matrix: compose([spot.position[0], spot.position[1] + dy, spot.position[2]], [0, spot.rotY, 0], size), color })
  switch (spot.slotKind) {
    case 'frame':
      return [at([0.46, 0.36, 0.03], colors.accent)]
    case 'screen':
      return [at([0.8, 0.5, 0.03], colors.glow)]
    case 'terminal':
      return [at([0.45, 0.3, 0.03], colors.glow)]
    case 'plaque':
      return [at([0.38, 0.2, 0.02], BRASS)]
    case 'shelf':
      return [at([0.22, 0.16, 0.12], PAPER, 0.08)]
    case 'case':
      return [at([0.22, 0.18, 0.22], PAPER, 0.09), { shape: 'sphere', matrix: compose([spot.position[0], spot.position[1] + 0.26, spot.position[2]], [0, 0, 0], [0.12, 0.12, 0.12]), color: colors.accent }]
  }
}

export interface NeglectLook {
  lampsOn: boolean
  /** How many pieces of each, in a place that looks like this. */
  dust: number
  cobwebs: number
  vines: number
  grass: number
}

/** The look of each level (spec 4.4): 0 fresh, 1 lamps off, 2 dust and cobwebs, 3 vines on the walls and grass in the rooms. `lamps` is the place's own switch. */
export function neglectLook(level: NeglectLevel, lamps: boolean): NeglectLook {
  if (level === 0) return { lampsOn: lamps, dust: 0, cobwebs: 0, vines: 0, grass: 0 }
  if (level === 1) return { lampsOn: false, dust: 0, cobwebs: 0, vines: 0, grass: 0 }
  if (level === 2) return { lampsOn: false, dust: 16, cobwebs: 4, vines: 0, grass: 0 }
  return { lampsOn: false, dust: 24, cobwebs: 4, vines: 12, grass: 24 }
}

const DUST = '#b9ad94'
const WEB = '#ececec'
const VINE = '#3f7d3a'
const LEAF = '#5a9a46'

/** A number from a place's id, so the same place always gets the same dust. */
function seedOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * The marks of neglect on a place: inside, the dust on the floor, cobwebs in the corners and grass in the rooms; outside, vines on
 * the walls. Placed by the place's own seed, so it never moves. Levels 0 and 1 have none (the lamps are in the parts' colours).
 */
export function neglectInstances(place: Place, _kit: Kit, baseY: number, level: NeglectLevel, part: 'interior' | 'exterior'): Instance[] {
  const look = neglectLook(level, true)
  const prng = createPrng(seedOf(place.id) ^ (part === 'interior' ? 0x1111 : 0x2222))
  const [px, pz] = placeCentre(toLandPlace(place))
  const [fw, fd] = place.exterior.footprint
  const height = floorHeight(place)
  const out: Instance[] = []
  const piece = (shape: Instance['shape'], at: [number, number, number], size: [number, number, number], color: string, rotY = 0): void => {
    out.push({ shape, matrix: compose(at, [0, rotY, 0], size), color })
  }
  const hx = Math.max(0.5, fw / 2 - 1.2)
  const hz = Math.max(0.5, fd / 2 - 1.2)
  if (part === 'interior') {
    for (let i = 0; i < look.dust; i++) piece('box', [px + prng.range(-hx, hx), baseY + 0.13, pz + prng.range(-hz, hz)], [0.35, 0.015, 0.3], DUST, prng.range(0, Math.PI))
    for (let i = 0; i < look.cobwebs; i++) {
      const sx = i % 2 === 0 ? -1 : 1
      const sz = i < 2 ? -1 : 1
      piece('box', [px + sx * (fw / 2 - 1), baseY + height - 0.35, pz + sz * (fd / 2 - 1)], [0.9, 0.02, 0.6], WEB, Math.PI / 4)
    }
    for (let i = 0; i < look.grass; i++) piece('cone', [px + prng.range(-hx, hx), baseY + 0.32, pz + prng.range(-hz, hz)], [0.18, 0.4, 0.18], LEAF)
    return out
  }
  for (let i = 0; i < look.vines; i++) {
    const side = Math.floor(prng.range(0, 4))
    const along = prng.range(-0.5, 0.5)
    const [x, z] = side === 0 ? [px + along * fw, pz - fd / 2 - 0.2] : side === 1 ? [px + along * fw, pz + fd / 2 + 0.2] : side === 2 ? [px - fw / 2 - 0.2, pz + along * fd] : [px + fw / 2 + 0.2, pz + along * fd]
    const length = prng.range(1.4, Math.min(3.2, height * place.exterior.floors))
    piece('cylinder', [x, baseY + length / 2, z], [0.12, length, 0.12], VINE)
    piece('sphere', [x, baseY + length, z], [0.34, 0.34, 0.34], LEAF)
  }
  return out
}

/** Where a place's sign stands: by the door, on the front (+z) side. The text on it is the place's `exterior.sign`. */
export function signSpot(place: Place, baseY: number): { position: [number, number, number] } {
  const [px, pz] = placeCentre(toLandPlace(place))
  return { position: [px + 3.2, baseY, pz + place.exterior.footprint[1] / 2 + 1.2] }
}
