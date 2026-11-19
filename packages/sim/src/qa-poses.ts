import { createPrng } from './prng.ts'
import type { Box, Vec3 } from './qa-geometry.ts'

/**
 * The seeded camera poses of the audit harness's world checks (docs/spec/audit/spec.md 7.4): eye height a few meters from every
 * place's front, sides and back, inside every room, at the edge of the land looking in and out, straight up, low near the
 * ground, and Merge from four sides. Same input and seed, same poses, so pictures can be compared run to run. Pure.
 */
export interface PoseInput {
  places: readonly { id: string; box: Box }[]
  rooms: readonly { id: string; place?: string; box: Box }[]
  merge: Box | null
}

export interface CameraPose {
  name: string
  position: Vec3
  target: Vec3
  /** Where the visitor stands for it, so the insides near the camera are drawn (they load around the visitor). */
  stand: { x: number; z: number }
}

const EYE = 1.6
const mid = (b: Box): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]

function candidates(input: PoseInput): CameraPose[] {
  const out: CameraPose[] = []
  const pose = (name: string, position: Vec3, target: Vec3, stand = { x: position[0], z: position[2] }) => out.push({ name, position, target, stand })
  for (const { id, box } of input.places) {
    const [cx, , cz] = mid(box)
    const y = box.min[1] + EYE
    const look: Vec3 = [cx, box.min[1] + 2, cz]
    const d = 5
    pose(`place-front:${id}`, [cx, y, box.max[2] + d], look)
    pose(`place-back:${id}`, [cx, y, box.min[2] - d], look)
    pose(`place-left:${id}`, [box.min[0] - d, y, cz], look)
    pose(`place-right:${id}`, [box.max[0] + d, y, cz], look)
    pose(`low:${id}`, [cx + 2, box.min[1] + 0.3, box.max[2] + 3], [cx, box.min[1] + 1, cz])
  }
  for (const { id, box } of input.rooms) {
    const [cx, , cz] = mid(box)
    const y = box.min[1] + EYE
    const dirs: [string, number, number][] = [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]]
    for (const [dir, dx, dz] of dirs) pose(`room:${id}:${dir}`, [cx, y, cz], [cx + dx * 5, y - 0.3, cz + dz * 5])
  }
  if (input.places.length) {
    const min: Vec3 = [Math.min(...input.places.map((p) => p.box.min[0])) - 15, Math.min(...input.places.map((p) => p.box.min[1])), Math.min(...input.places.map((p) => p.box.min[2])) - 15]
    const max: Vec3 = [Math.max(...input.places.map((p) => p.box.max[0])) + 15, 0, Math.max(...input.places.map((p) => p.box.max[2])) + 15]
    const c: Vec3 = [(min[0] + max[0]) / 2, min[1] + EYE, (min[2] + max[2]) / 2]
    const corners: [string, number, number][] = [['nw', min[0], min[2]], ['ne', max[0], min[2]], ['sw', min[0], max[2]], ['se', max[0], max[2]]]
    for (const [name, x, z] of corners) {
      pose(`edge-in:${name}`, [x, c[1], z], c)
      pose(`edge-out:${name}`, [x, c[1], z], [x + (x - c[0]), c[1], z + (z - c[2])])
    }
    pose('sky:centre', c, [c[0] + 0.01, c[1] + 50, c[2]])
  }
  if (input.merge) {
    const [mx, , mz] = mid(input.merge)
    const y = input.merge.min[1] + 0.6
    const sides: [string, number, number][] = [['front', 0, 1], ['back', 0, -1], ['left', -1, 0], ['right', 1, 0]]
    for (const [side, dx, dz] of sides) pose(`merge:${side}`, [mx + dx * 1.5, y, mz + dz * 1.5], [mx, input.merge.min[1] + 0.35, mz], { x: mx, z: mz })
  }
  return out
}

/**
 * `count` poses drawn from the candidates with the seed (all of them when there are fewer), in a stable order. Merge's four
 * sides, the sky and one edge view are always kept, so every sheet has them.
 */
export function cameraPoses(input: PoseInput, seed: number, count = 40): CameraPose[] {
  const all = candidates(input)
  if (all.length <= count) return all
  const always = all.filter((p) => p.name.startsWith('merge:') || p.name === 'sky:centre' || p.name === 'edge-in:se')
  const rest = all.filter((p) => !always.includes(p))
  const prng = createPrng(seed)
  // A seeded shuffle of the rest; take what fills the count, then keep the candidates' own order.
  for (let i = rest.length - 1; i > 0; i--) {
    const j = prng.int(i + 1)
    ;[rest[i], rest[j]] = [rest[j]!, rest[i]!]
  }
  const chosen = new Set([...always, ...rest.slice(0, count - always.length)])
  return all.filter((p) => chosen.has(p))
}
