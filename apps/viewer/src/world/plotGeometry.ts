import { isOpenRequest, type PlaceRequest } from '@forkling/schema'
import { chunkCentre } from '@forkling/sim'
import type { Instance } from './kitBase.ts'
import { compose } from './matrix.ts'

/** Half the side of a staked plot, in meters: a square 14 meters across in the middle of its chunk. */
export const PLOT_HALF = 7
const REACH = 0.6
const STAKE = '#8a6a3f'
const ROPE = '#d9c8a0'
const BOARD = '#e8dcc0'
const PENNANT = '#c0502f'

export type Ground = number | ((x: number, z: number) => number)
const at = (ground: Ground, x: number, z: number) => (typeof ground === 'function' ? ground(x, z) : ground)

/**
 * The staked plot of an open place request (spec 10.3): stakes at the corners and the middle of each side, a rope between them, and a
 * sign by the front, so a visitor sees what Merge is waiting for. When Roman has said he is building it there is a pennant on a corner
 * and a pile of boards in the middle. A request that is not open or being built has no plot. Plain boxes, cylinders and a cone, like the
 * rest of the kit's geometry; each piece stands on `ground` (a height, or a function of the point).
 */
export function plotInstances(request: PlaceRequest, ground: Ground): Instance[] {
  if (!isOpenRequest(request)) return []
  const [cx, cz] = chunkCentre(request.chunk)
  const out: Instance[] = []
  const piece = (shape: Instance['shape'], x: number, up: number, z: number, size: [number, number, number], color: string): void => {
    out.push({ shape, matrix: compose([x, at(ground, x, z) + up, z], [0, 0, 0], size), color })
  }
  const stake = (x: number, z: number, height: number) => piece('cylinder', x, height / 2, z, [0.14, height, 0.14], STAKE)

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) stake(cx + sx * PLOT_HALF, cz + sz * PLOT_HALF, 1.6)
  for (const s of [-1, 1]) {
    stake(cx + s * PLOT_HALF, cz, 1.2)
    stake(cx, cz + s * PLOT_HALF, 1.2)
  }
  for (const s of [-1, 1]) {
    piece('box', cx, 1.2, cz + s * PLOT_HALF, [2 * PLOT_HALF, 0.04, 0.04], ROPE)
    piece('box', cx + s * PLOT_HALF, 1.2, cz, [0.04, 0.04, 2 * PLOT_HALF], ROPE)
  }

  const sign = plotSign(request, ground)
  const [sx, , sz] = sign.position
  piece('cylinder', sx, 1.1, sz, [0.16, 2.2, 0.16], STAKE)
  piece('box', sx, 1.9, sz, [2.2, 0.8, 0.1], BOARD)

  if (request.status === 'building') {
    piece('cylinder', cx - PLOT_HALF, 1.4, cz - PLOT_HALF, [0.06, 2.8, 0.06], STAKE)
    piece('cone', cx - PLOT_HALF + 0.35, 2.5, cz - PLOT_HALF, [0.5, 0.9, 0.5], PENNANT)
    for (let k = 0; k < 3; k++) piece('box', cx, 0.1 + k * 0.2, cz, [2, 0.2, 0.6], STAKE)
  }
  return out
}

/** Where a plot's sign stands (by the front, +z, a little left of the middle) and so where a visitor points to read it. On the ground. */
export function plotSign(request: Pick<PlaceRequest, 'chunk'>, ground: Ground): { position: [number, number, number] } {
  const [cx, cz] = chunkCentre(request.chunk)
  const x = cx + 1.5
  const z = cz + PLOT_HALF + REACH
  return { position: [x, at(ground, x, z), z] }
}
