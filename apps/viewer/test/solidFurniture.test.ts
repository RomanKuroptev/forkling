import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { furnitureBoxes } from '../src/world/solidFurniture.ts'
import { KEEP_FROM_MERGE, keepAwayFrom, keepFor } from '../src/player/keepAway.ts'
import { CLOSE_MAX_TURN, mergeClosePose } from '../src/qa/cameras.ts'
import { wallBoxes } from '../src/world/kitGeometry.ts'

const day7 = (id: string): Place => Place.parse(JSON.parse(readFileSync(fileURLToPath(new URL(`../../../test/fixtures/worlds/day-7/places/${id}.json`, import.meta.url)), 'utf8')))
const home = day7('home')
type Box = { min: [number, number, number]; max: [number, number, number] }
const contains = (b: Box, x: number, z: number) => x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]

describe('furniture stops the visitor (issue 357)', () => {
  const boxes = furnitureBoxes(home, kit, 0)
  const named = (id: string) => boxes.filter((b) => b.part === id)

  it("gives Home's bench, desk, chair and low shelf a box each, where they are drawn", () => {
    for (const id of ['bench', 'desk', 'chair', 'shelf-low', 'shelf-tall', 'lamp-floor']) expect(named(id), id).toHaveLength(1)
    // The bench just inside the door, at (8, 19), 1.6 m wide and 0.5 m deep.
    const [bench] = named('bench')
    expect(contains(bench!, 8, 19)).toBe(true)
    expect(bench!.max[0] - bench!.min[0]).toBeCloseTo(1.6)
    expect(bench!.max[1]).toBeCloseTo(0.5)
    // The low shelf the sensor-sensitivity exhibit stands on (the walk ended inside it).
    expect(contains(named('shelf-low')[0]!, 10.6, 12.5)).toBe(true)
  })

  it('leaves out what a visitor walks over or under, what is built into the walls, and what stands in the doorway', () => {
    for (const id of ['rug-round', 'floor-boards', 'window-large', 'door-wood', 'lantern-hanging', 'frame-large']) expect(named(id), id).toHaveLength(0)
  })

  it('every box stands on its floor and is a plain box (the physics stays cheap)', () => {
    for (const b of boxes) {
      expect(b.min[1]).toBeLessThan(1.5)
      for (let k = 0; k < 3; k++) expect(b.max[k]!).toBeGreaterThan(b.min[k]!)
    }
  })
})

describe('the visitor keeps a small distance from Merge (issues 357, 349)', () => {
  const merge = { x: 0, z: 0 }
  it('leaves a step that stays further than the distance alone, and a step away from Merge', () => {
    expect(keepAwayFrom(merge, { x: 3, z: 0 }, { x: 2.5, z: 0 })).toBeNull()
    expect(keepAwayFrom(merge, { x: 0.5, z: 0 }, { x: 0.6, z: 0 })).toBeNull()
  })

  it('stops a step toward Merge at the distance, and slides along it', () => {
    const head = keepAwayFrom(merge, { x: 2, z: 0 }, { x: 0.4, z: 0 })!
    expect(Math.hypot(head.x, head.z)).toBeCloseTo(KEEP_FROM_MERGE)
    const slide = keepAwayFrom(merge, { x: KEEP_FROM_MERGE, z: 0 }, { x: KEEP_FROM_MERGE - 0.1, z: 0.2 })!
    expect(Math.hypot(slide.x, slide.z)).toBeCloseTo(KEEP_FROM_MERGE)
    expect(slide.z).toBeGreaterThan(0)
  })

  it('never pulls a visitor Merge walked up to closer, and never pushes one away', () => {
    const near = keepAwayFrom(merge, { x: 0.7, z: 0 }, { x: 0.5, z: 0 })!
    expect(Math.hypot(near.x, near.z)).toBeCloseTo(0.7)
  })

  it('grows with the size Merge is drawn at: 1.6 m indoors (1.35 times), 2.4 m on open land (twice), where its face is bigger', () => {
    expect(keepFor(1.35)).toBeCloseTo(KEEP_FROM_MERGE)
    expect(keepFor(2)).toBeCloseTo(2.4, 1)
    // On open land its face is about 0.74 m wide; half of it fits in half a phone's width from there.
    const halfWide = Math.atan(Math.tan((35 * Math.PI) / 180) * (390 / 844))
    expect(Math.atan(0.37 / keepFor(2))).toBeLessThan(halfWide)
  })

  it('is far enough that its face is whole on a phone (390 wide, 70 deg tall), not cut by the edge', () => {
    // Merge's face is about 0.5 m wide; half of it must fit inside half the phone's width.
    const halfWide = Math.atan(Math.tan((35 * Math.PI) / 180) * (390 / 844))
    expect(Math.atan(0.25 / KEEP_FROM_MERGE)).toBeLessThan(halfWide)
  })
})

describe('the merge-close camera stands clear of furniture (issue 348)', () => {
  const obstacles: Box[] = [
    ...furnitureBoxes(home, kit, 0),
    ...wallBoxes(home).map((w) => ({ min: [w.x0, 0, w.z0] as [number, number, number], max: [w.x1, w.height, w.z1] as [number, number, number] })),
  ]
  const ground = () => 0
  const crosses = (from: number[], to: number[], b: Box) => {
    for (let i = 0; i <= 50; i++) {
      const t = i / 50
      const p = [0, 1, 2].map((k) => from[k]! + (to[k]! - from[k]!) * t)
      if (p.every((v, k) => v > b.min[k]! && v < b.max[k]!)) return true
    }
    return false
  }

  it('keeps the old pose, 1.5 m in front of the face, where nothing is in the way', () => {
    const pose = mergeClosePose({ x: 8, z: 15 }, Math.PI, ground, obstacles)
    expect(pose.position[0]).toBeCloseTo(8)
    expect(pose.position[2]).toBeCloseTo(13.5)
    expect(pose.target).toEqual([8, 0.4, 15])
  })

  /** How far round from straight in front of Merge's face the lens stands, in degrees. */
  const offFace = (pose: { position: readonly number[] }, merge: { x: number; z: number }, heading: number) => {
    const a = Math.atan2(pose.position[0]! - merge.x, pose.position[2]! - merge.z) - heading
    return Math.abs((Math.atan2(Math.sin(a), Math.cos(a)) * 180) / Math.PI)
  }

  it("stays in front of Merge's face, never more than 45 deg round, wherever Merge stands in Home and whichever way it faces", () => {
    for (const x of [4, 6, 8, 10, 12]) {
      for (const z of [13, 15, 17, 18.3]) {
        for (let h = -Math.PI; h < Math.PI; h += Math.PI / 6) {
          const pose = mergeClosePose({ x, z }, h, ground, obstacles)
          expect(offFace(pose, { x, z }, h), `${x}, ${z}, ${h}`).toBeLessThanOrEqual(CLOSE_MAX_TURN + 0.01)
        }
      }
    }
  })

  it('raises the lens over the bench rather than swinging round to the side, when no eye-level pose in front is clear', () => {
    // Merge just in front of the bench, facing the door past it: every eye-level pose within 45 deg is over the bench.
    const pose = mergeClosePose({ x: 8, z: 17.9 }, 0, ground, obstacles)
    expect(offFace(pose, { x: 8, z: 17.9 }, 0)).toBeLessThanOrEqual(CLOSE_MAX_TURN)
    expect(pose.position[1]).toBeGreaterThan(0.7)
  })

  it('moves off the bench: Merge at (8, 17.5) facing the door had the camera over the bench (day-7 picture 006)', () => {
    const pose = mergeClosePose({ x: 8, z: 17.5 }, 0, ground, obstacles)
    const bench = furnitureBoxes(home, kit, 0).find((b) => b.part === 'bench')!
    // Not just over the bench top: it rises well over it, or stands clear of it.
    expect(contains(bench, pose.position[0], pose.position[2]) && pose.position[1] < bench.max[1] + 0.25).toBe(false)
    expect(offFace(pose, { x: 8, z: 17.5 }, 0)).toBeLessThanOrEqual(CLOSE_MAX_TURN)
    for (const b of obstacles) {
      // Nothing between the lens and Merge's face, its feet or its middle.
      for (const y of [0.05, 0.4, 0.8]) expect(crosses(pose.position, [8, y, 17.5], b), JSON.stringify(b)).toBe(false)
    }
    expect(Math.hypot(pose.position[0] - 8, pose.position[2] - 17.5)).toBeGreaterThan(0.9)
  })
  it('moves when a box fills a corner of the picture near the lens, even off the line to Merge', () => {
    // Merge at the origin facing +z: the plain pose stands at (0, 0.7, 1.5). A crate just in front of the lens, to one side.
    const crate: Box = { min: [0.15, 0.2, 1.0], max: [0.6, 0.65, 1.3] }
    const pose = mergeClosePose({ x: 0, z: 0 }, 0, () => 0, [crate])
    expect(pose.position[2]).not.toBeCloseTo(1.5)
    expect(mergeClosePose({ x: 0, z: 0 }, 0, () => 0, []).position).toEqual([0, 0.7, 1.5])
  })
})
