import type { Place } from '@forkling/schema'
import { allPaths, CHUNK_SIZE, placeCentre, routePath, toLandPlace, yardPaths, type Land, type WorldPath } from '@forkling/sim'
import { LAND_SEGMENTS, type IndexedMesh } from './landGeometry.ts'

/**
 * The paths between places (spec 4.3) as they are drawn: laid on the ground as it is drawn, so the ground never shows through a
 * path and a path never has a hole (issues 428, 433). Pure, so it is tested without a renderer and `window.__qa.paths()` lists
 * the same shapes `Paths.tsx` draws.
 */

type Pt = [number, number]

/**
 * The ground as `landMesh` draws it: a grid of `step` meter squares from the world's origin, each cut into two triangles along
 * the diagonal from its (+x, z) corner to its (x, +z) corner, with every grid vertex at `vertexHeight`.
 */
export interface DrawnGround {
  step: number
  vertexHeight: (x: number, z: number) => number
}

/** The drawn ground of a land drawn with `segments` squares a chunk side (the same as `landMesh(land, segments)`). */
export const groundOf = (land: Pick<Land, 'heightAt'>, segments = LAND_SEGMENTS): DrawnGround => ({ step: CHUNK_SIZE / segments, vertexHeight: (x, z) => land.heightAt(x, z) })

/** The height of the drawn ground at a point: on the flat triangle of the land mesh that holds it. */
export function drawnHeightAt(ground: DrawnGround, x: number, z: number): number {
  const { step, vertexHeight: h } = ground
  const i = Math.floor(x / step)
  const j = Math.floor(z / step)
  const u = x / step - i
  const v = z / step - j
  const [x0, z0, x1, z1] = [i * step, j * step, (i + 1) * step, (j + 1) * step]
  const b = h(x1, z0)
  const c = h(x0, z1)
  if (u + v <= 1) {
    const a = h(x0, z0)
    return a + u * (b - a) + v * (c - a)
  }
  const d = h(x1, z1)
  return d + (1 - u) * (c - d) + (1 - v) * (b - d)
}

/** An axis-aligned rectangle on the ground, x0 < x1 and z0 < z1. */
export interface Rect {
  x0: number
  x1: number
  z0: number
  z1: number
}

/** The part of a convex polygon where `a x + b z + c >= 0` (Sutherland-Hodgman against one line). */
function clip(poly: readonly Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = []
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k]!
    const q = poly[(k + 1) % poly.length]!
    const fp = a * p[0] + b * p[1] + c
    const fq = a * q[0] + b * q[1] + c
    if (fp >= 0) out.push(p)
    if ((fp >= 0) !== (fq >= 0)) {
      const t = fp / (fp - fq)
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return out
}

/** Twice the signed area of a polygon in x, z (positive when it runs from +x towards +z). */
const area2 = (poly: readonly Pt[]) => poly.reduce((s, p, k) => {
  const q = poly[(k + 1) % poly.length]!
  return s + p[0] * q[1] - q[0] * p[1]
}, 0)

const EMPTY = 1e-9

/** A polygon without repeated corners or corners in the middle of a straight side (clipping leaves both), so no triangle of it is flat. */
function tidy(poly: readonly Pt[]): Pt[] {
  let out = [...poly]
  for (let changed = true; changed && out.length >= 3; ) {
    changed = false
    for (let k = 0; k < out.length && out.length >= 3; k++) {
      const p = out[(k + out.length - 1) % out.length]!
      const q = out[k]!
      const r = out[(k + 1) % out.length]!
      const cross = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9 || Math.abs(cross) < 1e-12) {
        out.splice(k, 1)
        changed = true
        k--
      }
    }
  }
  return out.length >= 3 ? out : []
}

/** A convex polygon with a rectangle taken out of it, as up to four convex pieces. */
function subtract(poly: Pt[], r: Rect): Pt[][] {
  const xs = poly.map((p) => p[0])
  const zs = poly.map((p) => p[1])
  if (Math.max(...xs) <= r.x0 || Math.min(...xs) >= r.x1 || Math.max(...zs) <= r.z0 || Math.min(...zs) >= r.z1) return [poly]
  const middle = clip(clip(poly, 1, 0, -r.x0), -1, 0, r.x1)
  return [clip(poly, -1, 0, r.x0), clip(poly, 1, 0, -r.x1), clip(middle, 0, -1, r.z0), clip(middle, 0, 1, -r.z1)].filter((p) => p.length >= 3 && Math.abs(area2(p)) > EMPTY)
}

/** A convex polygon cut along the drawn ground's triangles, each piece on one flat triangle of it. */
function alongGround(poly: readonly Pt[], step: number): Pt[][] {
  const xs = poly.map((p) => p[0])
  const zs = poly.map((p) => p[1])
  const out: Pt[][] = []
  for (let i = Math.floor(Math.min(...xs) / step); i * step < Math.max(...xs); i++) {
    const cellX = clip(clip(poly, 1, 0, -i * step), -1, 0, (i + 1) * step)
    if (cellX.length < 3) continue
    for (let j = Math.floor(Math.min(...zs) / step); j * step < Math.max(...zs); j++) {
      const cell = clip(clip(cellX, 0, 1, -j * step), 0, -1, (j + 1) * step)
      if (cell.length < 3) continue
      // The diagonal of the square: x + z = (i + j + 1) step.
      const diagonal = (i + j + 1) * step
      for (const piece of [clip(cell, -1, -1, diagonal), clip(cell, 1, 1, -diagonal)]) if (piece.length >= 3 && Math.abs(area2(piece)) > EMPTY) out.push(piece)
    }
  }
  return out
}

export interface RibbonOptions {
  width?: number
  /** How far above the drawn ground it lies, so it does not flicker against it. */
  lift?: number
  /** Where it is not drawn: the footprints of the buildings, cut out exactly so the track runs right up to a wall. */
  holes?: readonly Rect[]
}

/**
 * A path drawn on the ground (spec 4.3: a 3 meter track along the line). The track, a strip along each leg and a square of its
 * width on each bend (which closes the wedge a bend leaves open on its outside), is cut along the drawn ground's triangles, and
 * each piece lies `lift` above its triangle. So the track follows every bend of the ground: no ground shows through it and it
 * has no holes, however the land rises (issues 428, 433).
 */
export function pathRibbon(points: readonly (readonly [number, number])[], ground: DrawnGround, opts: RibbonOptions = {}): IndexedMesh {
  const { width = 3, lift = 0.05, holes = [] } = opts
  const half = width / 2
  const shapes: Pt[][] = []
  for (let s = 1; s < points.length; s++) {
    const [ax, az] = points[s - 1]!
    const [bx, bz] = points[s]!
    const length = Math.hypot(bx - ax, bz - az)
    if (length === 0) continue
    const nx = ((bz - az) / length) * half
    const nz = (-(bx - ax) / length) * half
    shapes.push([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]])
  }
  for (let s = 1; s + 1 < points.length; s++) {
    const [cx, cz] = points[s]!
    shapes.push([[cx - half, cz - half], [cx + half, cz - half], [cx + half, cz + half], [cx - half, cz + half]])
  }
  const verts: number[] = []
  const idx: number[] = []
  for (const shape of shapes) {
    let pieces = [shape]
    for (const hole of holes) pieces = pieces.flatMap((p) => subtract(p, hole))
    for (const piece of pieces.flatMap((p) => alongGround(p, ground.step)).map(tidy)) {
      if (piece.length < 3) continue
      // Face up: in x, z that is a polygon running from +z towards +x.
      const poly = area2(piece) > 0 ? [...piece].reverse() : piece
      const base = verts.length / 3
      for (const [x, z] of poly) verts.push(x, drawnHeightAt(ground, x, z) + lift, z)
      for (let k = 1; k + 1 < poly.length; k++) idx.push(base, base + k, base + k + 1)
    }
  }
  return { positions: new Float32Array(verts), indices: new Uint32Array(idx) }
}

/** A path as it is drawn: its two places, why it is there, the line it runs along and its mesh. */
export interface DrawnPath {
  from: string
  to: string
  kind: NonNullable<WorldPath['kind']>
  line: [number, number][]
  mesh: IndexedMesh
}

/** The footprint of a place on the ground. */
export function footprintOf(place: Place): Rect {
  const [x, z] = placeCentre(toLandPlace(place))
  const [w, d] = place.exterior.footprint
  return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }
}

/**
 * Every path of a world as the viewer draws it: the founding and expand paths (`allPaths`, spec 4.3) and the yard paths between
 * places that share a chunk and have no path (`yardPaths`, issue 434), each from door to door round the buildings (`routePath`),
 * laid on the drawn ground with the buildings cut out.
 */
export function drawnPaths(places: readonly Place[], land: Pick<Land, 'heightAt'>, segments = LAND_SEGMENTS): DrawnPath[] {
  const landPlaces = places.map(toLandPlace)
  const ground = groundOf(land, segments)
  const holes = places.map(footprintOf)
  const paths = allPaths(landPlaces)
  return [...paths, ...yardPaths(landPlaces, paths)].map((path) => {
    const line = routePath(path, landPlaces)
    return { from: path.from, to: path.to, kind: path.kind ?? 'founding', line, mesh: pathRibbon(line, ground, { holes }) }
  })
}
