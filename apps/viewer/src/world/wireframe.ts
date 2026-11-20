import type { Kit, Place } from '@forkling/schema'
import { DOOR_HALF, isBuilding, placeCentre, toLandPlace } from '@forkling/sim'
import { buildingModel } from './building.ts'
import type { Instance, Shape } from './kitBase.ts'
import { WIREFRAME } from './theme.ts'

/**
 * How thick the glowing lines are, in meters: a hairline with a soft glow, as in the mockups (issue 330: 14 cm bars read as
 * scaffolding from a block game and blew out to flat cyan). They are neon, so the thin-part rule does not apply.
 */
export const WIRE_THICKNESS = 0.03
/**
 * Two edges whose ends both lie this close to one line are that one line, drawn once (a wall's inner and outer face, a thin post).
 * A wall is 25 cm thick, and its faces came out a few millimetres over that, so they were drawn as two outlines (issue 330).
 */
const SAME_LINE = 0.3
/** Edges of boxes side by side that run along one line within this, overlapping or touching, are joined into one line (issue 330). */
const JOIN = 0.04
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

/** How far a point is from the segment `a`-`b`. */
function toSegment(p: V3, a: V3, b: V3): number {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / len2))
  return Math.hypot(p[0] - a[0] - t * d[0], p[1] - a[1] - t * d[1], p[2] - a[2] - t * d[2])
}

/**
 * Edges of pieces side by side that lie along one line (within `JOIN`, the same way, overlapping or meeting end to end) joined into
 * one: two floor boards' shared edge, the front and back of a thin frame, a shelf's board on its sides. Repeated until none join.
 */
function joined(edges: [V3, V3][]): [V3, V3][] {
  let list = edges
  for (;;) {
    const out: [V3, V3][] = []
    let changed = false
    for (const e of list) {
      let k = 0
      for (; k < out.length; k++) {
        const u = union(out[k]!, e)
        if (u) {
          out[k] = u
          changed = true
          break
        }
      }
      if (k === out.length) out.push(e)
    }
    list = out
    if (!changed) return list
  }
}

/** The one line two edges make when they lie along each other (see `joined`), else null. */
function union([a, b]: [V3, V3], [c, d]: [V3, V3]): [V3, V3] | null {
  const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const len = Math.hypot(...u)
  const v: V3 = [d[0] - c[0], d[1] - c[1], d[2] - c[2]]
  const lv = Math.hypot(...v)
  if (len < 1e-6 || lv < 1e-6) return null
  const dir: V3 = [u[0] / len, u[1] / len, u[2] / len]
  if (Math.abs((dir[0] * v[0] + dir[1] * v[1] + dir[2] * v[2]) / lv) < 0.9995) return null
  const t = (p: V3) => (p[0] - a[0]) * dir[0] + (p[1] - a[1]) * dir[1] + (p[2] - a[2]) * dir[2]
  const off = (p: V3) => Math.hypot(p[0] - a[0] - t(p) * dir[0], p[1] - a[1] - t(p) * dir[1], p[2] - a[2] - t(p) * dir[2])
  if (off(c) > JOIN || off(d) > JOIN) return null
  const [tc, td] = [t(c), t(d)]
  if (Math.min(tc, td) > len + JOIN || Math.max(tc, td) < -JOIN) return null
  const t0 = Math.min(0, tc, td)
  const t1 = Math.max(len, tc, td)
  return [
    [a[0] + t0 * dir[0], a[1] + t0 * dir[1], a[2] + t0 * dir[2]],
    [a[0] + t1 * dir[0], a[1] + t1 * dir[1], a[2] + t1 * dir[2]],
  ]
}

/** The edges once each: longest first, an edge that lies along one already kept (both ends within `SAME_LINE`) is left out. */
function single(edges: [V3, V3][]): [V3, V3][] {
  const sorted = [...edges].sort((x, y) => Math.hypot(y[1][0] - y[0][0], y[1][1] - y[0][1], y[1][2] - y[0][2]) - Math.hypot(x[1][0] - x[0][0], x[1][1] - x[0][1], x[1][2] - x[0][2]))
  const kept: [V3, V3][] = []
  for (const [a, b] of sorted) {
    if (kept.some(([c, d]) => toSegment(a, c, d) < SAME_LINE && toSegment(b, c, d) < SAME_LINE)) continue
    kept.push([a, b])
  }
  return kept
}

/** Whether a place is drawn as wire now: being built (or forced, `?wire`), in a style the building model draws (else it gets scaffolding). */
export const drawnAsWire = (place: Place, kit: Kit, nowMs?: number, force = false): boolean => (force || isBuilding(place.state, nowMs)) && buildingModel(place, kit, 0) !== null

/**
 * A place that is being built (spec 4.5) is its finished model drawn as glowing cyan lines: the edges of the very same pieces the
 * finished building is made of (body with its lean, front, crown and hero), so the base shape, taper, pyramid, dome, columns, arch and
 * sign all carry over. It becomes solid when it is done. Nothing is drawn for a place that is not being built (`nowMs` is the world
 * clock; without one a construction written in the file counts as going on). The way in stays clear: edges in the doorway are cut.
 * `inside` are the pieces of its inside when that is drawn (the floor, the furniture, the lamps): they are lines too, every small
 * one of them, so no finished room stands in the wire shell (issue 329), and so are the exhibits Merge keeps there (issue 426). Every
 * line is drawn once: edges along one line are joined, and one along a longer line is left out (issue 330).
 */
export function wireframeInstances(place: Place, kit: Kit, baseY: number, nowMs?: number, force = false, inside: readonly Pick<Instance, 'shape' | 'matrix'>[] = []): Instance[] | null {
  if (!force && !isBuilding(place.state, nowMs)) return []
  const model = buildingModel(place, kit, baseY)
  if (!model) return null
  const [px, pz] = placeCentre(toLandPlace(place))
  const frontZ = pz + place.exterior.footprint[1] / 2
  const edges: [V3, V3][] = []
  const outside = [...model.slots.body, ...model.slots.front, ...model.slots.crown, ...model.slots.hero].filter((piece) => thinnest(piece.matrix) >= MIN_PIECE)
  for (const piece of [...outside, ...inside]) {
    const shape = SHAPES[piece.shape]
    const world = shape.corners.map((c) => apply(piece.matrix, c))
    for (const [i, j] of shape.edges) {
      const a = world[i]!
      const b = world[j]!
      const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
      // Cut every edge in the doorway: beside the door gap, near the front wall, below the lintel.
      if (Math.abs(mid[0] - px) <= DOOR_HALF + 0.3 && Math.abs(mid[2] - frontZ) < 1.2 && Math.min(a[1], b[1]) < baseY + 2.3) continue
      edges.push([a, b])
    }
  }
  const out: Instance[] = []
  for (const [a, b] of single(joined(edges))) {
    const l = line(a, b)
    if (l) out.push(l)
  }
  return out
}
