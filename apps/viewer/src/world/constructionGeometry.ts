import type { Place } from '@forkling/schema'
import { DOOR_HALF, isBuilding, placeCentre, toLandPlace } from '@forkling/sim'
import { signSpot } from './exhibitGeometry.ts'
import { floorHeight, type Instance } from './kitBase.ts'
import { compose } from './matrix.ts'

/** How far outside the walls the scaffolding stands, in meters. Everything of it is within this of the footprint. */
export const SCAFFOLD_REACH = 0.9
const POLE_GAP = 3
/** The lowest a rail or board hangs, in meters: above a visitor's head (the capsule and its float stand about 1.8 m tall). */
export const SCAFFOLD_HEAD = 2
const LEVEL = 1.4
/** Clear room beside the door and the sign, on each side of the way in, in meters. */
const FRONT_MARGIN = 0.4
const POLE = '#a98a5a'
const RAIL = '#cdb888'
const PLANK = '#7c633f'

/**
 * The scaffolding round a place that is being built (spec 4.5): poles at the corners and along each side, rails at every level up
 * to the roof, a platform on the front, and a small pile of boards on the ground. Rails and boards hang above head height
 * (`SCAFFOLD_HEAD`), and the front has a gap from the door to past the sign (nothing crosses the way in): the visitor walks
 * through the gap and never through a pole or a rail. Plain boxes and cylinders like the rest of the
 * kit's geometry, a few dozen pieces for the largest place. Nothing is drawn for a place that is not being built: `nowMs` is the
 * world clock, and without one a construction written in the file counts as going on. Each piece stands on `baseY`.
 */
export function constructionInstances(place: Place, baseY: number, nowMs?: number): Instance[] {
  if (!isBuilding(place.state, nowMs)) return []
  const [px, pz] = placeCentre(toLandPlace(place))
  const [fw, fd] = place.exterior.footprint
  const top = floorHeight(place) * place.exterior.floors
  const hx = fw / 2 + SCAFFOLD_REACH
  const hz = fd / 2 + SCAFFOLD_REACH
  const out: Instance[] = []
  const piece = (shape: Instance['shape'], at: [number, number, number], size: [number, number, number], color: string): void => {
    out.push({ shape, matrix: compose(at, [0, 0, 0], size), color })
  }

  // Poles: both corners of each side and a pole every few meters between, each corner once.
  const along = (length: number) => {
    const n = Math.max(1, Math.ceil(length / POLE_GAP))
    return Array.from({ length: n + 1 }, (_, k) => -length / 2 + (k * length) / n)
  }
  const poleHeight = top + 1.2
  const pole = (x: number, z: number) => piece('cylinder', [x, baseY + poleHeight / 2, z], [0.14, poleHeight, 0.14], POLE)
  // The gap in the front side, from the left of the door or sign to the right of it, relative to the middle of the building.
  const signX = signSpot(place, baseY).position[0] - px
  const gapL = Math.min(-DOOR_HALF, signX) - FRONT_MARGIN
  const gapR = Math.max(DOOR_HALF, signX) + FRONT_MARGIN
  /** What is left of a stretch along the front once the gap is cut out of it. */
  const frontParts = (a: number, b: number): [number, number][] =>
    ([[a, Math.min(b, gapL)], [Math.max(a, gapR), b]] as [number, number][]).filter(([from, to]) => to - from > 0.3)
  for (const x of along(2 * hx)) {
    pole(px + x, pz - hz)
    if (x < gapL - 0.07 || x > gapR + 0.07) pole(px + x, pz + hz)
  }
  for (const z of along(2 * hz).slice(1, -1)) for (const sx of [-1, 1]) pole(px + sx * hx, pz + z)

  // Rails: one long board along each side at every level up to the roof.
  const levels = Math.max(1, Math.floor((top + 0.2 - SCAFFOLD_HEAD) / LEVEL) + 1)
  for (let level = 0; level < levels; level++) {
    const y = baseY + SCAFFOLD_HEAD + level * LEVEL
    piece('box', [px, y, pz - hz], [2 * hx, 0.08, 0.08], RAIL)
    for (const [a, b] of frontParts(-hx, hx)) piece('box', [px + (a + b) / 2, y, pz + hz], [b - a, 0.08, 0.08], RAIL)
    for (const sx of [-1, 1]) piece('box', [px + sx * hx, y, pz], [0.08, 0.08, 2 * hz], RAIL)
  }

  // Boards along the front (the door's side, +z) on each side of the way in, at the second level when the building is tall enough.
  const deck = SCAFFOLD_HEAD + Math.min(1, levels - 1) * LEVEL
  for (const [a, b] of frontParts(-hx, hx)) piece('box', [px + (a + b) / 2, baseY + deck, pz + hz], [b - a, 0.06, 1], PLANK)

  // A pile of boards on the ground at the side.
  for (let k = 0; k < 3; k++) piece('box', [px - hx, baseY + 0.06 + k * 0.12, pz], [2.4, 0.12, 0.5], PLANK)
  return out
}
