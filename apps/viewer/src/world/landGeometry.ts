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
