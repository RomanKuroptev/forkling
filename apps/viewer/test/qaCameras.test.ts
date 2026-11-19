import { kit } from '@forkling/schema/kit'
import { placeCentre, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { describe, expect, it } from 'vitest'
import { buildingModel } from '../src/world/building.ts'
import { SIGN_W, signSpot } from '../src/world/exhibitGeometry.ts'
import { frontPose } from '../src/qa/cameras.ts'

const FOV = 70
const DESKTOP = 1280 / 800
const PHONE = 390 / 844
const places = makeFixtureWorld(3, 64).places

/** Whether a point is inside the picture taken from a pose, with a field of view and an aspect. */
function inPicture(pose: ReturnType<typeof frontPose>, aspect: number, p: readonly number[]): boolean {
  const f = [pose.target[0] - pose.position[0], pose.target[1] - pose.position[1], pose.target[2] - pose.position[2]]
  const fl = Math.hypot(...f)
  const fw = f.map((v) => v / fl)
  const rl = Math.hypot(fw[2]!, fw[0]!)
  const right = [-fw[2]! / rl, 0, fw[0]! / rl]
  const up = [right[1]! * fw[2]! - right[2]! * fw[1]!, right[2]! * fw[0]! - right[0]! * fw[2]!, right[0]! * fw[1]! - right[1]! * fw[0]!]
  const d = [p[0]! - pose.position[0], p[1]! - pose.position[1], p[2]! - pose.position[2]]
  const z = d[0]! * fw[0]! + d[1]! * fw[1]! + d[2]! * fw[2]!
  const x = d[0]! * right[0]! + d[1]! * right[1]! + d[2]! * right[2]!
  const y = d[0]! * up[0]! + d[1]! * up[1]! + d[2]! * up[2]!
  const t = Math.tan(((FOV / 2) * Math.PI) / 180)
  return z > 0 && Math.abs(y / z) <= t && Math.abs(x / z) <= t * aspect
}

describe('the front camera of a place (issue 332)', () => {
  it('stands at eye height, at least 7 m in front of the front, and further back on a phone than on a laptop', () => {
    for (const p of places) {
      const [x, z] = placeCentre(toLandPlace(p))
      const front = z + p.exterior.footprint[1] / 2
      const pose = frontPose(p, kit, 0, DESKTOP, FOV)
      expect(pose.position[0]).toBe(x)
      expect(pose.position[1]).toBe(1.6)
      expect(pose.target).toEqual([x, 2, z])
      expect(pose.position[2] - front, p.id).toBeGreaterThanOrEqual(7)
      // A phone stands further back than a laptop.
      expect(frontPose(p, kit, 0, PHONE, FOV).position[2], p.id).toBeGreaterThan(pose.position[2])
    }
  })

  it('on a phone too, the whole front, its title bar and its sign are in the picture', () => {
    for (const aspect of [DESKTOP, PHONE]) {
      for (const p of places) {
        const pose = frontPose(p, kit, 0, aspect, FOV)
        const [x, z] = placeCentre(toLandPlace(p))
        const front = z + p.exterior.footprint[1] / 2
        const [fw] = p.exterior.footprint
        const s = signSpot(p, 0).position
        const corners = [[x - fw / 2, 0, front], [x + fw / 2, 0, front], [s[0] - SIGN_W / 2, 0.9, s[2]], [s[0] + SIGN_W / 2, 2.1, s[2]]]
        const bar = buildingModel(p, kit, 0)?.titleBar
        if (bar) corners.push([bar.position[0] - bar.width / 2, bar.position[1], bar.position[2]], [bar.position[0] + bar.width / 2, bar.position[1], bar.position[2]])
        for (const c of corners) expect(inPicture(pose, aspect, c), `${p.id} at ${aspect.toFixed(2)}: ${c.map((n) => n.toFixed(1)).join(', ')}`).toBe(true)
      }
    }
  })
})
