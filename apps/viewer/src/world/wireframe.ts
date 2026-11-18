import type { Kit, Place } from '@forkling/schema'
import { DOOR_HALF, isBuilding, placeCentre, toLandPlace } from '@forkling/sim'
import { buildingModel } from './building.ts'
import type { Instance, Shape } from './kitBase.ts'
import { WIREFRAME } from './theme.ts'

/** How thick the glowing lines are, in meters. They are neon, so the thin-part rule does not apply. */
export const WIRE_THICKNESS = 0.14
/** Pieces thinner than this (bands, the roof slab, small buttons) are left out: they are detail, not the shape. */
const MIN_PIECE = 0.35

type V3 = [number, number, number]

/** The corners of a unit shape and the edges between them (pairs of corner numbers), in the shape's own space. */
const BOX_CORNERS: V3[] = [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]
const BOX_EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
/** A cone is a pyramid: four base corners and the point. */
const CONE_CORNERS: V3[] = [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [0, 0.5, 0]]
const CONE_EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]]
/** A sphere (a dome) is a diamond: six points and the twelve edges between them. */
const SPHERE_CORNERS: V3[] = [[0.5, 0, 0], [-0.5, 0, 0], [0, 0.5, 0], [0, -0.5, 0], [0, 0, 0.5], [0, 0, -0.5]]
const SPHERE_EDGES: [number, number][] = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]]

const SHAPES: Record<Shape, { corners: V3[]; edges: [number, number][] }> = {
  box: { corners: BOX_CORNERS, edges: BOX_EDGES },
  cylinder: { corners: BOX_CORNERS, edges: BOX_EDGES },
  cone: { corners: CONE_CORNERS, edges: CONE_EDGES },
  sphere: { corners: SPHERE_CORNERS, edges: SPHERE_EDGES },
}

const apply = (m: readonly number[], [x, y, z]: V3): V3 => [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!]

/** A thin glowing box from `a` to `b`: its long axis along the line, its other two axes any perpendicular pair. */
function line(a: V3, b: V3): Instance | null {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const len = Math.hypot(...d)
  if (len < 1e-6) return null
  const dir: V3 = [d[0] / len, d[1] / len, d[2] / len]
  // Any direction not parallel to the line gives a perpendicular.
  const ref: V3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const u: V3 = [dir[1] * ref[2] - dir[2] * ref[1], dir[2] * ref[0] - dir[0] * ref[2], dir[0] * ref[1] - dir[1] * ref[0]]
  const ul = Math.hypot(...u)
  u[0] /= ul
  u[1] /= ul
  u[2] /= ul
  const v: V3 = [dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0]]
  const t = WIRE_THICKNESS
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  const matrix = [dir[0] * len, dir[1] * len, dir[2] * len, 0, u[0] * t, u[1] * t, u[2] * t, 0, v[0] * t, v[1] * t, v[2] * t, 0, mid[0], mid[1], mid[2], 1]
  return { shape: 'box', matrix, color: WIREFRAME.pole, glow: true }
}

/** How big a piece is across its thinnest axis, from its matrix. */
const thinnest = (m: readonly number[]) => Math.min(Math.hypot(m[0]!, m[1]!, m[2]!), Math.hypot(m[4]!, m[5]!, m[6]!), Math.hypot(m[8]!, m[9]!, m[10]!))

/**
 * A place that is being built (spec 4.5) is its finished model drawn as glowing cyan lines: the edges of the very same pieces the
 * finished building is made of (body with its lean, front, crown and hero), so the base shape, taper, pyramid, dome, columns, arch and
 * sign all carry over. It becomes solid when it is done. Nothing is drawn for a place that is not being built (`nowMs` is the world
 * clock; without one a construction written in the file counts as going on). The way in stays clear: edges in the doorway are cut.
 */
export function wireframeInstances(place: Place, kit: Kit, baseY: number, nowMs?: number, force = false): Instance[] | null {
  if (!force && !isBuilding(place.state, nowMs)) return []
  const model = buildingModel(place, kit, baseY)
  if (!model) return null
  const [px, pz] = placeCentre(toLandPlace(place))
  const frontZ = pz + place.exterior.footprint[1] / 2
  const out: Instance[] = []
  const pieces = [...model.slots.body, ...model.slots.front, ...model.slots.crown, ...model.slots.hero]
  for (const piece of pieces) {
    if (thinnest(piece.matrix) < MIN_PIECE) continue
    const shape = SHAPES[piece.shape]
    const world = shape.corners.map((c) => apply(piece.matrix, c))
    for (const [i, j] of shape.edges) {
      const a = world[i]!
      const b = world[j]!
      const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
      // Cut every edge in the doorway: beside the door gap, near the front wall, below the lintel.
      if (Math.abs(mid[0] - px) <= DOOR_HALF + 0.3 && Math.abs(mid[2] - frontZ) < 1.2 && Math.min(a[1], b[1]) < baseY + 2.3) continue
      const l = line(a, b)
      if (l) out.push(l)
    }
  }
  return out
}
