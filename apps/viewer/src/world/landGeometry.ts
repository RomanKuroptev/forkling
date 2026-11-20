import { CHUNK_SIZE, chunkAt, chunkCentre, type Chunk, type Land } from '@forkling/sim'

/**
 * The shapes of the land (spec 4.1, 4.3), as plain arrays so they can be tested without a renderer. The components in
 * `Land.tsx`, `Fog.tsx` and `Paths.tsx` only turn these into meshes.
 */
export interface IndexedMesh {
  positions: Float32Array
  indices: Uint32Array
}

/** Squares of 2 meters a side (16 to a chunk side): gentle terrain, and few enough triangles for a world of 64 places. The paths are laid on the same squares (`pathGeometry.ts`). */
export const LAND_SEGMENTS = 16

export interface VisibleChunk {
  chunk: Chunk
  owned: boolean
}

/** The chunks that are drawn: the owned ones and the edge chunks around them. Never the fog. In a fixed order. */
export function visibleChunks(land: Land): VisibleChunk[] {
  if (land.places.length === 0) return []
  // A staked plot may touch only another plot, so it counts when looking for the edges of what is drawn.
  const known = [...land.places.map((p) => p.chunk), ...land.staked]
  const xs = known.map((c) => c[0])
  const zs = known.map((c) => c[1])
  const out: VisibleChunk[] = []
  for (let cz = Math.min(...zs) - 1; cz <= Math.max(...zs) + 1; cz++) {
    for (let cx = Math.min(...xs) - 1; cx <= Math.max(...xs) + 1; cx++) {
      const kind = land.classify([cx, cz])
      if (kind !== 'fog') out.push({ chunk: [cx, cz], owned: kind === 'owned' })
    }
  }
  return out
}

/**
 * The ground of every drawn chunk as a grid of `segments` by `segments` squares (two triangles each, facing up), with every
 * vertex on the land's own height. Neighbouring chunks use the same heights along their shared edge, so there is no seam.
 */
export function landMesh(land: Land, segments = 2): IndexedMesh {
  const chunks = visibleChunks(land)
  const side = segments + 1
  const positions = new Float32Array(chunks.length * side * side * 3)
  const indices = new Uint32Array(chunks.length * segments * segments * 6)
  const step = CHUNK_SIZE / segments
  let v = 0
  let t = 0
  chunks.forEach(({ chunk }, k) => {
    const base = k * side * side
    for (let j = 0; j <= segments; j++) {
      for (let i = 0; i <= segments; i++) {
        const x = chunk[0] * CHUNK_SIZE + i * step
        const z = chunk[1] * CHUNK_SIZE + j * step
        positions[v++] = x
        positions[v++] = land.heightAt(x, z)
        positions[v++] = z
      }
    }
    for (let j = 0; j < segments; j++) {
      for (let i = 0; i < segments; i++) {
        const a = base + j * side + i
        const b = a + 1
        const c = a + side
        const d = c + 1
        indices[t++] = a
        indices[t++] = c
        indices[t++] = b
        indices[t++] = b
        indices[t++] = c
        indices[t++] = d
      }
    }
  })
  return { positions, indices }
}

/** How far the side of the land reaches under its lowest edge, in meters: the land reads as a slab, as in the look's pictures. */
export const LAND_SIDE_DEPTH = 4
/** The bright band at the top of the side, in meters. */
export const LAND_RIM_BAND = 0.3
/** The bright strip on top of the land along its end, how wide (meters) and how far above the ground, so it shows from where the walk stops. */
export const LAND_LIP = { width: 0.5, lift: 0.04 } as const

export interface LandSide {
  /** Triangles, three vertices each, not indexed. */
  positions: Float32Array
  /** For each vertex: 1 in the bright band at the top, 0 in the side below it. */
  tone: Float32Array
}

interface Border {
  /** The points along the border, `segments + 1` of them, on the land mesh's own vertices. */
  points: [number, number][]
  /** The way out, towards the fog: a unit vector along x or z. */
  out: [number, number]
}

/** Every border between a drawn chunk and the fog, as a line of points on the land mesh's vertices (the walk stops just inside them). */
function fogBorders(land: Land, segments: number): Border[] {
  const step = CHUNK_SIZE / segments
  const borders: Border[] = []
  for (const { chunk } of visibleChunks(land)) {
    const [cx, cz] = chunkCentre(chunk)
    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      if (land.classify(chunkAt(cx + dx * CHUNK_SIZE, cz + dz * CHUNK_SIZE)) !== 'fog') continue
      const points: [number, number][] = []
      for (let i = 0; i <= segments; i++) {
        const along = -CHUNK_SIZE / 2 + i * step
        points.push(dx === 0 ? [cx + along, cz + (dz * CHUNK_SIZE) / 2] : [cx + (dx * CHUNK_SIZE) / 2, cz + along])
      }
      borders.push({ points, out: [dx, dz] })
    }
  }
  return borders
}

/** Pushes the triangle a, b, c, turned so it faces `out`. */
function pushFacing(to: number[], a: number[], b: number[], c: number[], out: [number, number, number]) {
  const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]
  const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]
  const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!]
  if (n[0]! * out[0] + n[1]! * out[1] + n[2]! * out[2] >= 0) to.push(...a, ...b, ...c)
  else to.push(...a, ...c, ...b)
}

/**
 * The side of the land (issue 454): on every border between a drawn chunk and the fog, a face from the land's own height down to
 * one flat underside `LAND_SIDE_DEPTH` under its lowest edge, with a bright band at the top. The walk stops just inside it
 * (`apps/viewer/src/player/keepOnLand.ts`), so a visitor sees the land end in a slab with a side, as in the look's pictures.
 */
export function landSides(land: Land, segments = LAND_SEGMENTS): LandSide {
  const borders = fogBorders(land, segments)
  if (borders.length === 0) return { positions: new Float32Array(0), tone: new Float32Array(0) }
  const bottom = Math.min(...borders.flatMap((b) => b.points.map(([x, z]) => land.heightAt(x, z)))) - LAND_SIDE_DEPTH
  const positions: number[] = []
  const tone: number[] = []
  for (const { points, out } of borders) {
    const facing: [number, number, number] = [out[0], 0, out[1]]
    for (let i = 0; i < segments; i++) {
      const [x0, z0] = points[i]!
      const [x1, z1] = points[i + 1]!
      const y0 = land.heightAt(x0, z0)
      const y1 = land.heightAt(x1, z1)
      // The band at the top, then the side under it.
      for (const [top0, top1, low0, low1, t] of [
        [y0, y1, y0 - LAND_RIM_BAND, y1 - LAND_RIM_BAND, 1],
        [y0 - LAND_RIM_BAND, y1 - LAND_RIM_BAND, bottom, bottom, 0],
      ] as const) {
        pushFacing(positions, [x0, top0, z0], [x0, low0, z0], [x1, top1, z1], facing)
        pushFacing(positions, [x1, top1, z1], [x0, low0, z0], [x1, low1, z1], facing)
        tone.push(t, t, t, t, t, t)
      }
    }
  }
  return { positions: new Float32Array(positions), tone: new Float32Array(tone) }
}

/**
 * A bright strip on top of the land along every border with the fog, `LAND_LIP.width` wide and lifted a little off the ground, so
 * the end of the land shows from where the walk stops, looking down at it. Its inner edge follows the land mesh's own slope.
 */
export function landLip(land: Land, segments = LAND_SEGMENTS): Float32Array {
  const step = CHUNK_SIZE / segments
  const share = LAND_LIP.width / step
  const positions: number[] = []
  for (const { points, out } of fogBorders(land, segments)) {
    // A point `w` meters in from the border, at the height the land mesh has there (straight between its vertices).
    const inner = ([x, z]: [number, number]): number[] => {
      const edge = land.heightAt(x, z)
      const back = land.heightAt(x - out[0] * step, z - out[1] * step)
      return [x - out[0] * LAND_LIP.width, edge + (back - edge) * share + LAND_LIP.lift, z - out[1] * LAND_LIP.width]
    }
    const outer = ([x, z]: [number, number]): number[] => [x, land.heightAt(x, z) + LAND_LIP.lift, z]
    for (let i = 0; i < segments; i++) {
      const a = outer(points[i]!)
      const b = outer(points[i + 1]!)
      const c = inner(points[i]!)
      const d = inner(points[i + 1]!)
      pushFacing(positions, a, c, b, [0, 1, 0])
      pushFacing(positions, b, c, d, [0, 1, 0])
    }
  }
  return new Float32Array(positions)
}

export interface FogWall {
  /** The middle of the wall: on the chunk edge, or `inset` meters into the edge chunk. */
  x: number
  z: number
  /** How far into the chunk this layer stands. The layers together thicken the fog towards the edge. */
  inset: number
  /** 0 for a wall along x (facing z), a quarter turn for one along z. */
  rotY: number
  length: number
}

const SIDES: [number, number, number][] = [
  [0, -CHUNK_SIZE / 2, 0],
  [0, CHUNK_SIZE / 2, 0],
  [-CHUNK_SIZE / 2, 0, Math.PI / 2],
  [CHUNK_SIZE / 2, 0, Math.PI / 2],
]

/** How many layers of fog stand on each side, and how far apart: together they cover most of the outer chunk (spec 4.1: terrain fading into fog). */
export const FOG_LAYERS = 4
export const FOG_LAYER_GAP = 7

/**
 * Layers of fog on every side of a drawn chunk that faces fog, the first on the chunk edge and each next one further in, so the
 * ground whitens towards the edge and the world ends in a bank of mist, not in a cliff or a hard line.
 */
export function fogWalls(land: Land, layers = FOG_LAYERS): FogWall[] {
  const walls: FogWall[] = []
  for (const { chunk } of visibleChunks(land)) {
    const [cx, cz] = chunkCentre(chunk)
    for (const [dx, dz, rotY] of SIDES) {
      const beyond = chunkAt(cx + dx * 2, cz + dz * 2)
      if (land.classify(beyond) !== 'fog') continue
      for (let layer = 0; layer < layers; layer++) {
        const inset = layer * FOG_LAYER_GAP
        walls.push({ x: cx + dx - Math.sign(dx) * inset, z: cz + dz - Math.sign(dz) * inset, inset, rotY, length: CHUNK_SIZE })
      }
    }
  }
  return walls
}
