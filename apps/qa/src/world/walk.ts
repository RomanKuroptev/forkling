import type { Place } from '@forkling/schema'
import { bodyWorldFor, findPath, placeCentre, toLandPlace, type Box, type Point2, type Vec3 } from '@forkling/sim'
import type { Page } from 'playwright'
import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'
import { CAPSULE, MERGE_GAP, gapToBox, gridWithFurniture, solidParts, walkedInto } from './bump.ts'
import { kit } from '@forkling/schema/kit'
import { reachedRoom, routePoints, stairRoute } from './stairs.ts'

/**
 * The walking checks (audit spec 7.4): with the real W key, the visitor walks from the arrival point into every place along
 * the walking grid's path; a walk that gets stuck is a place a visitor cannot reach (behind a drawn obstacle) or an invisible
 * wall (nothing drawn in the way). From behind each place it walks straight at the back wall, which must stop it. Rays from
 * the middle of every room must meet a wall on every side but the door. The camera must never be inside a mesh on the way.
 * Running at the end of the land, in each of four directions, must leave the visitor on the land (issues 340, 351). Walking straight
 * at a piece of furniture in each place, and at Merge, must stop the visitor before it (issues 357, 349); the walks into places
 * go round the furniture, on a fine grid with it in.
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
  ground(points: [number, number][]): Ground[]
  scene(): SceneObject[]
}
type Ground = { y: number; chunk: 'owned' | 'edge' | 'fog' }
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

/** The headings the edge walk runs in (radians, 0 along +z): the four ways off the land. */
export const EDGE_HEADINGS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]

/**
 * How far along a line of ground samples (`step` meters apart, the first at the start) the land ends: the distance of the
 * first sample in the fog, or null when the line never leaves the land.
 */
export function landEndsAt(samples: readonly Ground[], step: number): number | null {
  const i = samples.findIndex((g) => g.chunk === 'fog')
  return i < 0 ? null : i * step
}

/** The visitor has left the land when it stands over the fog (no ground there) or has fallen more than a meter below the ground. */
export function offLand(visitor: { y: number }, ground: Ground): boolean {
  return ground.chunk === 'fog' || visitor.y < ground.y - 1
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
  const boxed = input.scene.filter((o): o is SceneObject & { box: Box } => o.box !== null)
  const furniture = solidParts(input.scene)
  const grid = gridWithFurniture(bodyWorldFor({ seed: input.seed, places: input.places as Place[] }).grid, furniture.map((p) => p.box))
  const places = boxed.filter((o) => o.kind === 'place')
  const wiredPlaces = new Set(places.filter((p) => p.material === 'wireframe').map((p) => p.id))
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

  // Every room upstairs is reached on foot (issue 333): from in front of its place's door (the walk from the arrival point to the
  // place is checked above), along the grid to the foot of its stairs, up them, and on to its middle. A room with no stairs at all
  // is `world.upper-room-no-stairs`, from the files.
  /** Walks straight toward a point with the W key, facing it, until within `near` meters or stuck; true when it got there. */
  const walkStraight = async (to: Point2, near = 0.5): Promise<boolean> => {
    let last = Infinity
    let slow = 0
    for (let i = 0; i < 60; i++) {
      const v = await where()
      const d = Math.hypot(to.x - v.x, to.z - v.z)
      if (d < near) return true
      slow = last - d < 0.1 ? slow + 1 : 0
      if (slow >= 3) return false
      last = d
      await qa(page, (q, a: number) => q.look(a, 0), headingTo(v, to))
      await qa(page, (q, a: number) => q.press('KeyW', a), Math.min(400, (d / 2.5) * 1000 + 50))
    }
    return false
  }
  for (const r of boxed.filter((o) => o.kind === 'room' && !wiredPlaces.has(o.place ?? ''))) {
    const place = input.places.find((p) => p.id === r.place)
    const roomId = r.id.slice((r.place ?? '').length + 1)
    const room = place?.rooms.find((x) => x.id === roomId)
    if (!place || !room || room.floor < 1) continue
    const route = stairRoute(place as Place, room.id, kit)
    if (!route) continue
    const legs = routePoints(place as Place, route)
    const [cx, , cz] = centre(r.box)
    const [px, pz] = placeCentre(toLandPlace(place as Place))
    const door = { x: px, z: pz + place.exterior.footprint[1] / 2 + 2 }
    await qa(page, (q, a: [number, number, number]) => q.teleport(a[0], a[1], a[2]), [door.x, door.z, Math.PI])
    const path = findPath(grid, door, legs[0]!.stand)
    let stuckAt = ''
    if (!path) stuckAt = 'the walking grid finds no way from the door to the foot of its stairs'
    else {
      for (const wp of path) if (!stuckAt && !(await walkStraight(wp, 0.6))) stuckAt = `on the way from the door to the foot of its stairs, heading for x ${wp.x.toFixed(1)}, z ${wp.z.toFixed(1)}`
    }
    for (const [k, leg] of legs.entries()) {
      if (stuckAt) break
      if (k > 0 && !(await walkStraight(leg.stand))) stuckAt = `on the way to flight ${k + 1}`
      else if (!(await walkStraight(leg.top, 0.4))) stuckAt = `on flight ${k + 1} of the stairs`
    }
    if (!stuckAt && !(await walkStraight({ x: cx, z: cz }, 0.8))) stuckAt = 'on the way from the top of the stairs to the middle of the room'
    const v = await where()
    if (!reachedRoom(v, r.box))
      add('world.upper-room-unreachable', r.id, 'major', `A visitor cannot walk up to ${r.id}`, `Walking from its place's door to the foot of its stairs, up them and on to its middle, the visitor ends at x ${v.x.toFixed(1)}, y ${v.y.toFixed(1)}, z ${v.z.toFixed(1)}${stuckAt ? `, stuck ${stuckAt}` : ''}; the room's floor is at y ${r.box.min[1].toFixed(1)}.`, 'A visitor sees the room from outside but cannot get in.', `places/${r.place}.json`)
  }

  // Rays from the middle of each room, on every side but the door.
  // A place being built is drawn as a cyan wireframe: its walls are lines by design, so its rooms are left out.
  const wire = wiredPlaces
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
  // The end of the land must stop a visitor who runs at it (issues 340, 351): past it there is no ground.
  const STEP = 2
  for (const heading of EDGE_HEADINGS) {
    const dir = { x: Math.sin(heading), z: Math.cos(heading) }
    const line = Array.from({ length: 200 }, (_, i) => [input.start.x + dir.x * i * STEP, input.start.z + dir.z * i * STEP] as [number, number])
    const end = landEndsAt(await qa(page, (q, a: [number, number][]) => q.ground(a), line), STEP)
    if (end === null) continue
    const from = Math.max(0, end - 8)
    await qa(page, (q, a: [number, number, number]) => q.teleport(a[0], a[1], a[2]), [input.start.x + dir.x * from, input.start.z + dir.z * from, heading])
    await qa(page, (q) => q.press(['KeyW', 'ShiftLeft'], 4000))
    const v = await where()
    const [g] = await qa(page, (q, a: [number, number][]) => q.ground(a), [[v.x, v.z]])
    const deg = Math.round((heading * 180) / Math.PI)
    if (g && offLand(v, g))
      add('world.walk-off-edge', `heading-${deg}`, 'major', 'A visitor can walk off the edge of the land', `Running at the end of the land heading ${deg} deg, the visitor ends at x ${v.x.toFixed(1)}, z ${v.z.toFixed(1)}, ${g.chunk === 'fog' ? 'over the fog, where there is no ground' : `${(g.y - v.y).toFixed(1)} m below the ground`}.`, 'A visitor who walks away from the places falls under the world, loses it and can only get back by reloading.')
  }
  // Furniture stops the visitor (issue 357): in each place, a walk straight at one piece from 1.5 m off must end before it.
  const rooms = new Map(boxed.filter((o) => o.kind === 'room').map((r) => [r.id, r.box]))
  const wired = new Set(places.filter((p) => p.material === 'wireframe').map((p) => p.id))
  const inside = (b: Box, x: number, z: number, m: number) => x > b.min[0] + m && x < b.max[0] - m && z > b.min[2] + m && z < b.max[2] - m
  const near = (b: Box, x: number, z: number, m: number) => x > b.min[0] - m && x < b.max[0] + m && z > b.min[2] - m && z < b.max[2] + m
  for (const place of places.filter((p) => !wired.has(p.id))) {
    const walk = furnitureWalk(place.id)
    if (!walk) continue
    const { part, start, dir } = walk
    await qa(page, (q, a: [number, number, number]) => q.teleport(a[0], a[1], a[2]), [start.x, start.z, Math.atan2(dir.x, dir.z)])
    await qa(page, (q) => q.press('KeyW', 2000))
    const end = await where()
    if (walkedInto(start, dir, part.box, end))
      add('world.walk-through-furniture', part.id, 'major', `A visitor walks into the ${part.name ?? 'furniture'} in ${place.id}`, `Walking straight at ${part.id} ("${part.name}") from x ${start.x.toFixed(1)}, z ${start.z.toFixed(1)}, the visitor ends at x ${end.x.toFixed(1)}, z ${end.z.toFixed(1)}, inside it or past it.`, 'Furniture feels like cardboard, and the camera ends up inside it.', 'apps/viewer/src/world/solidFurniture.ts')
  }
  function furnitureWalk(placeId: string): { part: (typeof furniture)[number]; start: Point2; dir: Point2 } | null {
    for (const part of furniture.filter((f) => f.place === placeId).sort((a, b) => a.id.localeCompare(b.id))) {
      const room = rooms.get(part.id.split('/').slice(0, 2).join('/'))
      if (!room) continue
      const [px, , pz] = centre(part.box)
      const [rx, , rz] = centre(room)
      // From the room's middle side first, then round.
      const toward = Math.atan2(rx - px, rz - pz)
      for (const turn of [0, 1, -1, 2, -2, 3, -3, 4].map((k) => (k * Math.PI) / 4)) {
        const out = { x: Math.sin(toward + turn), z: Math.cos(toward + turn) }
        const half = Math.abs(out.x) * (part.box.max[0] - part.box.min[0]) / 2 + Math.abs(out.z) * (part.box.max[2] - part.box.min[2]) / 2
        const start = { x: px + out.x * (half + 1.5), z: pz + out.z * (half + 1.5) }
        if (!inside(room, start.x, start.z, 0.6)) continue
        // A clear run: no other piece on the way, nor where the visitor stands.
        const others = furniture.filter((f) => f !== part)
        const run = 1.5 / (half + 1.5)
        const clear = [0, 0.25, 0.5, 0.75, 1].every((t) => !others.some((f) => near(f.box, start.x + (px - start.x) * t * run, start.z + (pz - start.z) * t * run, CAPSULE + 0.1)))
        if (clear) return { part, start, dir: { x: -out.x, z: -out.z } }
      }
    }
    return null
  }

  // The visitor stops short of Merge (issues 357, 349): a walk straight at it from 3 m must leave the visitor outside its drawn box.
  // Merge walks about: where it is now, not when the scene was first read.
  const merge = (await qa(page, (q) => q.scene())).find((o): o is SceneObject & { box: Box } => o.kind === 'merge' && o.box !== null)
  if (merge) {
    const [mx, , mz] = centre(merge.box)
    const room = boxed.find((o) => o.kind === 'room' && near(o.box, mx, mz, 0) && o.box.min[1] <= merge.box.min[1] + 0.5 && o.box.max[1] > merge.box.min[1])
    const toward = room ? Math.atan2(centre(room.box)[0] - mx, centre(room.box)[2] - mz) : headingTo({ x: mx, z: mz }, input.start)
    for (const turn of [0, 1, -1, 2, -2, 3, -3, 4].map((k) => (k * Math.PI) / 4)) {
      const out = { x: Math.sin(toward + turn), z: Math.cos(toward + turn) }
      const start = { x: mx + out.x * 3, z: mz + out.z * 3 }
      if (room && !inside(room.box, start.x, start.z, 0.6)) continue
      if (!room && places.some((p) => near(p.box, start.x, start.z, 0.5))) continue
      if (furniture.some((f) => [0, 0.25, 0.5, 0.75].some((t) => near(f.box, start.x - out.x * 3 * t, start.z - out.z * 3 * t, CAPSULE + 0.1)))) continue
      await qa(page, (q, a: [number, number, number]) => q.teleport(a[0], a[1], a[2]), [start.x, start.z, Math.atan2(-out.x, -out.z)])
      // In short presses, keeping the nearest the visitor came: one that slid round Merge's small collider walked on past it.
      let gap = Infinity
      let end: Point2 = start
      for (let i = 0; i < 10; i++) {
        await qa(page, (q) => q.press('KeyW', 250))
        const v = await where()
        const now = (await qa(page, (q) => q.scene())).find((o) => o.kind === 'merge')?.box ?? merge.box
        const g = gapToBox(v, now)
        if (g < gap) [gap, end] = [g, { x: v.x, z: v.z }]
      }
      if (gap < MERGE_GAP)
        add('world.walk-into-merge', 'merge', 'major', 'A visitor walks right up onto Merge', `Walking straight at Merge from x ${start.x.toFixed(1)}, z ${start.z.toFixed(1)}, the visitor comes to x ${end.x.toFixed(1)}, z ${end.z.toFixed(1)}, ${gap.toFixed(2)} m from its drawn body; at least ${MERGE_GAP} m keeps the camera off it.`, 'The camera ends up on top of Merge, its face cut by the edge of the screen.', 'apps/viewer/src/player/keepAway.ts')
      break
    }
  }
  await qa(page, (q, a: [number, number, number]) => q.teleport(a[0], a[1], a[2]), [input.start.x, input.start.z, input.start.yaw])
  return out
}
