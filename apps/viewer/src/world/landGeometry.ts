import { CHUNK_SIZE, chunkAt, chunkCentre, type Chunk, type Land } from '@forkling/sim'

/**
 * The shapes of the land (spec 4.1, 4.3), as plain arrays so they can be tested without a renderer. The components in
 * `Land.tsx`, `Fog.tsx` and `Paths.tsx` only turn these into meshes.
 */
export interface IndexedMesh {
  positions: Float32Array
  indices: Uint32Array
}

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

export interface RibbonOptions {
  width?: number
  /** Distance between the strips the path is cut into, so it follows the ground. */
  step?: number
  /** How far above the ground it lies, so it does not flicker against it. */
  lift?: number
  /** Leave out a strip whose middle is here, e.g. inside a building. */
  skip?: (x: number, z: number) => boolean
}

/** A path drawn on the ground (spec 4.3: a 3 meter track along the line), as strips of 4 vertices, each on the ground. */
export function pathRibbon(points: readonly (readonly [number, number])[], heightAt: (x: number, z: number) => number, opts: RibbonOptions = {}): IndexedMesh {
  const { width = 3, step = 2, lift = 0.05, skip } = opts
  const half = width / 2
  const verts: number[] = []
  const idx: number[] = []
  for (let s = 1; s < points.length; s++) {
    const [ax, az] = points[s - 1]!
    const [bx, bz] = points[s]!
    const length = Math.hypot(bx - ax, bz - az)
    if (length === 0) continue
    const dx = (bx - ax) / length
    const dz = (bz - az) / length
    // Rotated a quarter turn, so the strip faces up.
    const nx = dz
    const nz = -dx
    const n = Math.max(1, Math.ceil(length / step - 1e-9))
    for (let k = 0; k < n; k++) {
      const t0 = (k / n) * length
      const t1 = ((k + 1) / n) * length
      const x0 = ax + dx * t0
      const z0 = az + dz * t0
      const x1 = ax + dx * t1
      const z1 = az + dz * t1
      if (skip?.((x0 + x1) / 2, (z0 + z1) / 2)) continue
      const base = verts.length / 3
      for (const [x, z] of [
        [x0 + nx * half, z0 + nz * half],
        [x0 - nx * half, z0 - nz * half],
        [x1 + nx * half, z1 + nz * half],
        [x1 - nx * half, z1 - nz * half],
      ] as const) {
        verts.push(x, heightAt(x, z) + lift, z)
      }
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    }
  }
  // A bend leaves a wedge open on its outside. A square of the track's width on the bend closes it (any wedge is within half a width of the corner).
  for (let s = 1; s + 1 < points.length; s++) {
    const [cx, cz] = points[s]!
    if (skip?.(cx, cz)) continue
    const base = verts.length / 3
    for (const [x, z] of [[cx - half, cz - half], [cx + half, cz - half], [cx - half, cz + half], [cx + half, cz + half]] as const) verts.push(x, heightAt(x, z) + lift, z)
    // Wound like the strips (face up) whichever way the path turns.
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
  }
  return { positions: new Float32Array(verts), indices: new Uint32Array(idx) }
}
