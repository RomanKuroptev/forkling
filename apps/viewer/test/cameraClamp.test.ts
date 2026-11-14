import { describe, expect, it } from 'vitest'
import type { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { createLand, placeCentre, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { CAMERA_CLEARANCE, clampCamera, easeCamera, nearSolids, worldSolids, type Solid, type Vec3 } from '../src/world/cameraClamp.ts'
import { floorHeight } from '../src/world/kitBase.ts'

// ---------- an oracle that does not use the code under test ----------
const strictlyInside = (p: Vec3, s: Solid) => p.every((v, i) => v > s.min[i]! + 1e-6 && v < s.max[i]! - 1e-6)
/** Whether the segment from `a` to `b` passes through the inside of the solid (slab test; touching a face does not count). */
function crosses(a: Vec3, b: Vec3, s: Solid): boolean {
  let t0 = 0
  let t1 = 1
  for (let i = 0; i < 3; i++) {
    const lo = s.min[i]! + 1e-6
    const hi = s.max[i]! - 1e-6
    const d = b[i]! - a[i]!
    if (Math.abs(d) < 1e-12) {
      if (a[i]! <= lo || a[i]! >= hi) return false
      continue
    }
    let near = (lo - a[i]!) / d
    let far = (hi - a[i]!) / d
    if (near > far) [near, far] = [far, near]
    t0 = Math.max(t0, near)
    t1 = Math.min(t1, far)
    if (t1 - t0 <= 1e-9) return false
  }
  return true
}
const problem = (target: Vec3, camera: Vec3, solids: readonly Solid[]): string | null => {
  for (const s of solids) {
    if (strictlyInside(camera, s)) return `inside ${s.id}`
    if (crosses(target, camera, s)) return `behind ${s.id}`
  }
  return null
}
/** Whether the line from the visitor to the camera keeps the camera clearance from every solid (one the visitor is already within the clearance of, pressed to a wall, is measured as it is). */
const clearWithMargin = (target: Vec3, camera: Vec3, solids: readonly Solid[]) =>
  solids.every((s) => {
    const grown: Solid = { id: s.id, min: s.min.map((v) => v - CAMERA_CLEARANCE) as unknown as Vec3, max: s.max.map((v) => v + CAMERA_CLEARANCE) as unknown as Vec3 }
    return !problem(target, camera, [strictlyInside(target, grown) ? s : grown])
  })
/** Whether the whole line from the visitor to the camera is above the ground, with the camera's own clearance. */
const lineAboveGround = (a: Vec3, b: Vec3, ground: (x: number, z: number) => number) => Array.from({ length: 49 }, (_, k) => k / 48).every((t) => a[1] + (b[1] - a[1]) * t >= ground(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t) + 0.36)
/** A camera position on the orbit round `target`: polar from straight up, azimuth about y, as `CameraControls` has them. */
const orbit = (target: Vec3, polar: number, azimuth: number, distance: number): Vec3 => [target[0] + distance * Math.sin(polar) * Math.sin(azimuth), target[1] + distance * Math.cos(polar), target[2] + distance * Math.sin(polar) * Math.cos(azimuth)]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const box = (id: string, min: Vec3, max: Vec3): Solid => ({ id, min, max })

describe('pulling the camera in front of a wall', () => {
  const wall = box('wall', [10, 0, -20], [10.8, 3.4, 20])

  it('leaves a camera with a clear view exactly where it was', () => {
    expect(clampCamera([0, 1.5, 0], [-6, 4, 3], [wall])).toEqual([-6, 4, 3])
    expect(clampCamera([0, 1.5, 0], [-6, 4, 3], [])).toEqual([-6, 4, 3])
  })

  it('stops a camera that would be behind a wall in front of it, on the same line, clear of it by the clearance', () => {
    const target: Vec3 = [5, 1.5, 0]
    const got = clampCamera(target, [15, 1.5, 0], [wall])
    expect(got[0]).toBeLessThanOrEqual(10 - CAMERA_CLEARANCE + 1e-6)
    expect(got[0]).toBeGreaterThan(8) // not further in than it has to be
    expect(got[1]).toBeCloseTo(1.5, 6)
    expect(got[2]).toBeCloseTo(0, 6)
    expect(problem(target, got, [wall])).toBeNull()
  })

  it('looks from another direction when the visitor is pressed against the wall, instead of putting the camera in the wall or on the visitor', () => {
    const target: Vec3 = [9.7, 1.5, 0]
    const got = clampCamera(target, [20, 1.5, 0], [wall])
    expect(problem(target, got, [wall])).toBeNull()
    expect(dist(target, got), 'a usable distance').toBeGreaterThanOrEqual(1.4)
  })

  it('copes with a visitor whose centre is inside the clearance of a wall (hugging it)', () => {
    const target: Vec3 = [9.82, 1.5, 0]
    for (const az of [0, 1, 2, 3, 4, 5]) {
      const got = clampCamera(target, orbit(target, 1.2, az, 9), [wall])
      expect(problem(target, got, [wall]), `azimuth ${az}`).toBeNull()
    }
  })
})

describe('keeping the camera above the ground', () => {
  const slope = (x: number) => 0.5 * x

  it('pulls a camera that would be under a hillside back to the surface, clear of it', () => {
    const target: Vec3 = [0, 3, 0]
    const wanted: Vec3 = [20, 6, 0] // the ground is at 10 m there
    const got = clampCamera(target, wanted, [], { ground: slope })
    expect(got[1]).toBeGreaterThanOrEqual(slope(got[0]) + 0.3)
    expect(dist(got, wanted)).toBeGreaterThan(1)
    // On the same line, and not further in than it has to be: the next step out would be under the ground.
    expect((got[1] - 3) / got[0]).toBeCloseTo((6 - 3) / 20, 6)
    expect(slope(got[0] + 1.5) + 0.35).toBeGreaterThan(3 + ((got[0] + 1.5) * 3) / 20)
  })

  it('leaves a camera above the ground where it was', () => {
    expect(clampCamera([0, 3, 0], [-20, 6, 0], [], { ground: slope })).toEqual([-20, 6, 0])
  })
})

describe('easing the camera back out', () => {
  const wall = box('wall', [10, 0, -20], [10.8, 3.4, 20])
  const target: Vec3 = [5, 1.5, 0]

  it('snaps in at once when the camera shown would now be behind a wall, so it never shows the wall', () => {
    const shown = easeCamera({ shown: [12, 1.5, 0], target, wanted: [8.5, 1.5, 0], solids: [wall], dt: 1 / 60 })
    expect(problem(target, shown, [wall])).toBeNull()
    expect(shown).toEqual([8.5, 1.5, 0])
  })

  it('does not jump when nothing is in the way: a camera behind the visitor moves a part of the way to a camera in front of the wall', () => {
    const shown = easeCamera({ shown: [-5, 1.5, 0], target, wanted: [8.5, 1.5, 0], solids: [wall], dt: 1 / 60 })
    expect(problem(target, shown, [wall])).toBeNull()
    expect(shown[0]).toBeGreaterThan(-5)
    expect(shown[0]).toBeLessThan(8.5)
  })

  it('glides out when the way opens, a part of the way each frame, and gets there', () => {
    let shown: Vec3 = [8.5, 1.5, 0]
    const wanted: Vec3 = [-4, 1.5, 0]
    const first = easeCamera({ shown, target, wanted, solids: [wall], dt: 1 / 60 })
    expect(first[0]).toBeLessThan(shown[0])
    expect(first[0]).toBeGreaterThan(wanted[0])
    for (let i = 0; i < 300; i++) shown = easeCamera({ shown, target, wanted, solids: [wall], dt: 1 / 60 })
    expect(dist(shown, wanted)).toBeLessThan(0.01)
  })

  it('never passes through anything while gliding: every frame is clear, whichever way the camera swings', () => {
    let shown: Vec3 = [4, 1.5, 3]
    for (let frame = 0; frame < 600; frame++) {
      const wanted = orbit(target, 0.9, frame * 0.05, 9)
      const clamped = clampCamera(target, wanted, [wall])
      shown = easeCamera({ shown, target, wanted: clamped, solids: [wall], dt: 1 / 60 })
      expect(problem(target, shown, [wall]), `frame ${frame}`).toBeNull()
    }
  })

  it('stays put when it is already where it should be', () => {
    expect(easeCamera({ shown: [-4, 1.5, 0], target, wanted: [-4, 1.5, 0], solids: [wall], dt: 1 / 60 })).toEqual([-4, 1.5, 0])
  })
})

describe('the solids of a place', () => {
  const fixture = makeFixtureWorld(1, 10)
  const land = createLand(1, fixture.places.map(toLandPlace))
  const ground = (x: number, z: number) => land.heightAt(x, z)
  const solids = worldSolids(fixture.places, kit, ground)
  const home = fixture.places.find((p) => p.id === 'home')!

  it('has walls all round with a gap at the door, and a roof above them', () => {
    const own = solids.filter((s) => s.id.startsWith('home:'))
    expect(own.filter((s) => s.id.startsWith('home:wall')).length).toBe(5)
    const top = ground(...placeCentre(toLandPlace(home))) + floorHeight(home)
    expect(own.some((s) => s.id.startsWith('home:roof') && s.min[1] >= top - 1e-6)).toBe(true)
  })

  it('keeps a camera under the ceiling when the visitor is in a room, however steeply it is held up', () => {
    const [px, pz] = placeCentre(toLandPlace(home))
    const base = ground(px, pz)
    const target: Vec3 = [px, base + 1.5, pz]
    for (const polar of [0, 0.05, 0.15, 0.3]) {
      const got = clampCamera(target, orbit(target, polar, 1, 12), nearSolids(solids, target, 40), { ground })
      expect(got[1], `polar ${polar}`).toBeLessThan(base + floorHeight(home))
    }
  })

  it('is easy to find the ones near a point', () => {
    const [px, pz] = placeCentre(toLandPlace(home))
    const near = nearSolids(solids, [px, 0, pz], 30)
    expect(near.length).toBeGreaterThan(5)
    expect(near.length).toBeLessThan(solids.length)
    expect(near.some((s) => s.id.startsWith('home:'))).toBe(true)
  })
})

// ---------- the automated check: every room, around every building ----------
const worlds = [
  { seed: 1, count: 10, every: 1 },
  { seed: 3, count: 64, every: 8 },
]

describe.each(worlds)('the camera is never inside or behind a building (seed $seed, $count places)', ({ seed, count, every }) => {
  const world = makeFixtureWorld(seed, count)
  const land = createLand(seed, world.places.map(toLandPlace))
  const ground = (x: number, z: number) => land.heightAt(x, z)
  const solids = worldSolids(world.places, kit, ground)
  const EYE = 1.5

  /** Where a visitor can be: the middle and corners of every room, the doorway and just outside it, and round the outside at three distances. */
  const spots = (place: Place): [number, number][] => {
    const [px, pz] = placeCentre(toLandPlace(place))
    const [fw, fd] = place.exterior.footprint
    const out: [number, number][] = [[px, pz + fd / 2], [px, pz + fd / 2 + 1.5]]
    for (const room of place.rooms) {
      const [cx, cz] = [px + (room.at?.[0] ?? 0), pz + (room.at?.[1] ?? 0)]
      const [hw, hd] = [Math.max(0, room.size[0] / 2 - 1.2), Math.max(0, room.size[1] / 2 - 1.2)]
      out.push([cx, cz], [cx + hw, cz + hd], [cx - hw, cz + hd], [cx + hw, cz - hd], [cx - hw, cz - hd])
    }
    for (const d of [1, 3, 8]) {
      const [rx, rz] = [fw / 2 + d, fd / 2 + d]
      out.push([px, pz - rz], [px, pz + rz], [px - rx, pz], [px + rx, pz], [px - rx, pz - rz], [px + rx, pz - rz], [px - rx, pz + rz], [px + rx, pz + rz])
    }
    return out
  }

  const cases: { place: Place; target: Vec3; near: Solid[] }[] = []
  world.places.forEach((place, i) => {
    if (i % every !== 0) return
    for (const [x, z] of spots(place)) {
      const target: Vec3 = [x, ground(x, z) + EYE, z]
      const near = nearSolids(solids, target, 45)
      // A spot that is inside a wall is not somewhere a visitor can stand (the walls have colliders).
      if (near.some((s) => strictlyInside(target, s))) continue
      cases.push({ place, target, near })
    }
  })
  const cameras = (target: Vec3): Vec3[] => {
    const out: Vec3[] = []
    for (const polar of [0.12 * Math.PI, 0.28 * Math.PI, 0.47 * Math.PI]) for (const d of [2.5, 9, 18]) for (let k = 0; k < 8; k++) out.push(orbit(target, polar, (k / 8) * Math.PI * 2, d))
    return out
  }

  it('has places to look at, in every room and round every building', () => {
    expect(cases.length).toBeGreaterThan(every === 1 ? 200 : 40)
  })

  it('would be inside or behind a building often enough, without the clamp, for this check to mean something', () => {
    let bad = 0
    let total = 0
    for (const { target, near } of cases) for (const camera of cameras(target)) {
      total++
      if (problem(target, camera, near)) bad++
    }
    expect(bad / total).toBeGreaterThan(0.1)
  })

  it('puts the camera in the clear for every visitor spot, from every side, up high and low, near and far', () => {
    const failures: string[] = []
    for (const { place, target, near } of cases) {
      for (const wanted of cameras(target)) {
        const got = clampCamera(target, wanted, near, { ground })
        const why = problem(target, got, near)
        if (why) failures.push(`${place.id} at ${target.map((v) => v.toFixed(1))} wanting ${wanted.map((v) => v.toFixed(1))}: ${why}`)
        if (got[1] < ground(got[0], got[2]) + 0.3 - 1e-6 && wanted[1] >= ground(wanted[0], wanted[2]) + 0.35) failures.push(`${place.id}: under the ground at ${got.map((v) => v.toFixed(1))}`)
        if (dist(target, got) > dist(target, wanted) + 1e-6) failures.push(`${place.id}: further out than asked`)
      }
    }
    expect(failures.slice(0, 5)).toEqual([])
    expect(failures.length).toBe(0)
  })

  it('does not move a camera that was already in the clear, and never leaves it under a ceiling it should be below', () => {
    for (const { place, target, near } of cases) {
      const [px, pz] = placeCentre(toLandPlace(place))
      const [fw, fd] = place.exterior.footprint
      const indoors = Math.abs(target[0] - px) < fw / 2 - 0.8 && Math.abs(target[2] - pz) < fd / 2 - 0.8
      for (const wanted of cameras(target)) {
        const got = clampCamera(target, wanted, near, { ground })
        if (clearWithMargin(target, wanted, near) && lineAboveGround(target, wanted, ground)) expect(got, `${place.id} target ${target.map((v) => v.toFixed(2))} wanted ${wanted.map((v) => v.toFixed(2))} got ${got.map((v) => v.toFixed(2))}`).toEqual(wanted)
        if (indoors) expect(got[1], `${place.id} indoors at ${target.map((v) => v.toFixed(1))}`).toBeLessThan(ground(px, pz) + floorHeight(place) * place.exterior.floors)
      }
    }
  })
})
