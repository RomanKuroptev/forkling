import type { Place } from '@forkling/schema'
import { bodyWorldFor, findPath, type Box, type Point2, type Vec3 } from '@forkling/sim'
import type { Page } from 'playwright'
import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'

/**
 * The walking checks (audit spec 7.4): with the real W key, the visitor walks from the arrival point into every place along
 * the walking grid's path; a walk that gets stuck is a place a visitor cannot reach (behind a drawn obstacle) or an invisible
 * wall (nothing drawn in the way). From behind each place it walks straight at the back wall, which must stop it. Rays from
 * the middle of every room must meet a wall on every side but the door. The camera must never be inside a mesh on the way.
 */

type Hit = { distance: number; object: string } | null
type Qa = {
  step(ms: number): Promise<void>
  press(keys: string | string[], ms: number): Promise<void>
  visitor(): { x: number; y: number; z: number; yaw: number; pitch: number } | null
  teleport(x: number, z: number, yaw?: number): Promise<void>
  look(yaw: number, pitch: number): Promise<void>
  setCamera(pose: null): Promise<void>
  ray(origin: Vec3, dir: Vec3, far: number): Hit
}
const qa = <T>(page: Page, fn: (q: Qa, arg: never) => T | Promise<T>, arg?: unknown) =>
  page.evaluate(({ src, arg }) => (0, eval)(`(${src})`)((globalThis as unknown as { __qa: Qa }).__qa, arg), { src: fn.toString(), arg }) as Promise<T>

const EYE = 0.7
const headingTo = (from: Point2, to: Point2) => Math.atan2(to.x - from.x, to.z - from.z)
const centre = (b: Box): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]

/** Room ray directions (heading in radians, 0 along +z), the door side (+z) left out because the door is open. */
export const ROOM_RAYS = [Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2]

/** Directions a room's rays leave without meeting anything: holes or see-through walls. */
export function holesFrom(hits: { heading: number; hit: Hit }[]): number[] {
  return hits.filter((h) => h.hit === null).map((h) => h.heading)
}

/** The camera is inside a mesh when every ray from it meets something almost at once. */
export function enclosed(hits: Hit[], within = 0.25): boolean {
  return hits.length > 0 && hits.every((h) => h !== null && h.distance < within)
}

export interface WalkInput {
  fixture: string
  seed: number
  places: readonly Place[]
  scene: SceneObject[]
  start: { x: number; z: number; yaw: number }
}

export async function walkChecks(page: Page, input: WalkInput): Promise<CheckResult[]> {
  const { fixture } = input
  const out: CheckResult[] = []
  const add = (id: string, key: string, severity: CheckResult['severity'], title: string, what: string, causes: string, where?: string) =>
    out.push({ id, fingerprint: `${id}|${fixture}|${key}`, severity, title, what, causes, evidence: [], fixKind: 'code', fixture, ...(where ? { where } : {}) })
  const grid = bodyWorldFor({ seed: input.seed, places: input.places as Place[] }).grid
  const boxed = input.scene.filter((o): o is SceneObject & { box: Box } => o.box !== null)
  const places = boxed.filter((o) => o.kind === 'place')
  const where = async () => {
    const v = await qa(page, (q) => q.visitor())
    if (!v) throw new Error('the visitor is not in the world')
    return v
  }
  const cameraInside = async (): Promise<boolean> => {
    const v = await where()
    const eye: Vec3 = [v.x, v.y + EYE, v.z]
    const dirs: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]
    const hits = await qa(page, (q, a: [Vec3, Vec3[]]) => a[1].map((d) => q.ray(a[0], d, 1)), [eye, dirs])
    return enclosed(hits)
  }

  await qa(page, (q) => q.setCamera(null))
  let cameraFound = false
  for (const p of places) {
    const [cx, , cz] = centre(p.box)
    const goal = { x: cx, z: cz }
    const path = findPath(grid, input.start, goal)
    if (!path) {
      add('world.no-path', p.id, 'minor', `The walking grid has no way into ${p.id}`, `From the arrival point (${input.start.x.toFixed(1)}, ${input.start.z.toFixed(1)}) the grid finds no path to the middle of ${p.id}.`, 'Merge and visitors cannot walk in; its door may face a wall or the edge.', `places/${p.id}.json`)
      continue
    }
    await qa(page, (q, a: [number, number, number]) => q.teleport(a[0], a[1], a[2]), [input.start.x, input.start.z, input.start.yaw])
    let stuck: { x: number; z: number; to: Point2 } | null = null
    for (const wp of path) {
      let last = Infinity
      let slow = 0
      for (let i = 0; i < 60; i++) {
        const v = await where()
        const d = Math.hypot(wp.x - v.x, wp.z - v.z)
        if (d < 0.6) break
        slow = last - d < 0.1 ? slow + 1 : 0
        if (slow >= 3) {
          stuck = { x: v.x, z: v.z, to: wp }
          break
        }
        last = d
        await qa(page, (q, a: number) => q.look(a, 0), headingTo(v, wp))
        await qa(page, (q, a: number) => q.press('KeyW', a), Math.min(400, (d / 2.5) * 1000 + 50))
        if (!cameraFound && (await cameraInside())) {
          cameraFound = true
          const c = await where()
          add('world.camera-in-mesh', p.id, 'major', 'The camera goes inside a solid object', `Walking to ${p.id}, at x ${c.x.toFixed(1)}, z ${c.z.toFixed(1)} every direction is blocked within 25 cm of the eyes.`, 'A visitor sees the inside of a wall or a block of colour.')
        }
      }
      if (stuck) break
    }
    if (stuck) {
      const v = await where()
      const ahead = await qa(page, (q, a: [Vec3, Vec3]) => q.ray(a[0], a[1], 1.2), [[v.x, v.y, v.z], [Math.sin(headingTo(v, stuck.to)), 0, Math.cos(headingTo(v, stuck.to))]])
      if (ahead === null) add('world.invisible-wall', p.id, 'major', `An invisible wall stops the visitor on the way to ${p.id}`, `At x ${stuck.x.toFixed(1)}, z ${stuck.z.toFixed(1)} the visitor cannot go on, and nothing is drawn within 1.2 m ahead.`, 'A visitor bumps into air.')
      else add('world.cannot-reach', p.id, 'major', `A visitor cannot walk into ${p.id}`, `Following the walking grid from the arrival point, the visitor gets stuck at x ${stuck.x.toFixed(1)}, z ${stuck.z.toFixed(1)} against "${ahead.object}" ${ahead.distance.toFixed(2)} m ahead.`, 'A visitor cannot get in by walking.', `places/${p.id}.json`)
    }

    // The back wall must stop a visitor walking straight at it.
    const back = { x: cx, z: p.box.min[2] - 2 }
    await qa(page, (q, a: [number, number, number]) => q.teleport(a[0], a[1], a[2]), [back.x, back.z, 0])
    await qa(page, (q) => q.press('KeyW', 3000))
    const after = await where()
    if (after.z > p.box.min[2] + 1.2 && after.x > p.box.min[0] && after.x < p.box.max[0]) add('world.walk-through-wall', p.id, 'major', `A visitor walks through the back wall of ${p.id}`, `Walking straight at the back wall from x ${back.x.toFixed(1)}, z ${back.z.toFixed(1)}, the visitor ends inside, at z ${after.z.toFixed(1)}.`, 'A visitor walks through walls: the building feels like a picture, not a place.', `places/${p.id}.json`)
  }

  // Rays from the middle of each room, on every side but the door.
  // A place being built is drawn as a cyan wireframe: its walls are lines by design, so its rooms are left out.
  const wire = new Set(places.filter((p) => p.material === 'wireframe').map((p) => p.id))
  for (const r of boxed.filter((o) => o.kind === 'room' && !wire.has(o.place ?? ''))) {
    const [cx, , cz] = centre(r.box)
    // The visitor stands in the room, so its inside is drawn.
    await qa(page, (q, a: [number, number]) => q.teleport(a[0], a[1]), [cx, cz])
    const origin: Vec3 = [cx, r.box.min[1] + 1.2, cz]
    const far = Math.max(r.box.max[0] - r.box.min[0], r.box.max[2] - r.box.min[2]) + 2
    const hits = await qa(page, (q, a: [Vec3, number[], number]) => a[1].map((h) => ({ heading: h, hit: q.ray(a[0], [Math.sin(h), 0, Math.cos(h)], a[2]) })), [origin, ROOM_RAYS, far])
    const holes = holesFrom(hits)
    if (holes.length) add('world.hole', r.id, 'major', `The room ${r.id} has a hole in its walls`, `From its middle, rays heading ${holes.map((h) => `${Math.round((h * 180) / Math.PI)} deg`).join(', ')} leave the room without meeting anything within ${far.toFixed(0)} m.`, 'A visitor sees out through a wall that should be solid.')
  }
  await qa(page, (q, a: [number, number, number]) => q.teleport(a[0], a[1], a[2]), [input.start.x, input.start.z, input.start.yaw])
  return out
}
