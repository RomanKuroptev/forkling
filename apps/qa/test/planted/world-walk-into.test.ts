import { createNavGrid, findPath } from '@forkling/sim'
import { describe, expect, it } from 'vitest'
import { gapToBox, gridWithFurniture, MERGE_GAP, solidParts, walkedInto } from '../../src/world/bump.ts'
import type { SceneObject } from '../../src/world/open.ts'

// Home's bench just inside the door in day-7: 1.6 m wide, 0.5 m deep, 0.5 m high, at (8, 19).
const bench = { min: [7.2, 0, 18.75], max: [8.8, 0.5, 19.25] }
const south = { x: 0, z: -1 }

describe('the walking checks stop at furniture and at Merge (issues 357, 349)', () => {
  it('planted: a walk that ends inside the bench, or past it, walked into it; one that stops a capsule short did not', () => {
    const start = { x: 8, z: 21 }
    expect(walkedInto(start, south, bench, { x: 8, z: 19 })).toBe(true)
    expect(walkedInto(start, south, bench, { x: 8, z: 15 })).toBe(true)
    expect(walkedInto(start, south, bench, { x: 8, z: 19.56 })).toBe(false)
    // A walk whose line misses the bench says nothing about it.
    expect(walkedInto({ x: 12, z: 21 }, south, bench, { x: 12, z: 15 })).toBe(false)
  })

  it('planted: a visitor 0.5 m from the middle of Merge is on top of its drawn body; one 1.2 m off is not', () => {
    const merge = { min: [-0.3, 0, -0.6], max: [0.3, 1, 0.6] }
    expect(gapToBox({ x: 0, z: 0.5 }, merge)).toBeLessThan(MERGE_GAP)
    expect(gapToBox({ x: 1.2, z: 0 }, merge)).toBeGreaterThanOrEqual(MERGE_GAP)
  })

  it('counts the pieces that stand on a floor, not a rug, a hanging lantern or a part in the doorway', () => {
    const room: SceneObject = { id: 'home/main', kind: 'room', place: 'home', box: { min: [2, 0, 12], max: [14, 3, 20] }, visible: true, material: 'solid' }
    const part = (k: number, name: string, min: [number, number, number], max: [number, number, number], extra: Partial<SceneObject> = {}): SceneObject => ({ id: `home/main/${k}`, kind: 'part', place: 'home', name, box: { min, max }, visible: true, material: 'solid', ...extra })
    const scene = [
      room,
      part(0, 'bench', [7.2, 0, 18.75], [8.8, 0.5, 19.25]),
      part(1, 'rug-round', [7, 0, 16], [9, 0.03, 18]),
      part(2, 'lantern-hanging', [10, 2.5, 15], [10.3, 3, 15.3]),
      part(3, 'frame-large', [7.4, 1.5, 19.9], [8.6, 2.4, 20], { material: 'none', inDoorway: { holds: [] } }),
    ]
    expect(solidParts(scene).map((p) => p.name)).toEqual(['bench'])
  })

  it('the walk into a place goes round the bench by the door on the fine grid, where the 1 m grid ran into it', () => {
    // An open room up to z 20, its front wall row z 20 to 21 with the door at x 7 to 9, open land beyond.
    const cols = 16
    const rows = 24
    const walkable = new Uint8Array(cols * rows)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) walkable[r * cols + c] = r !== 20 || c === 7 || c === 8 ? 1 : 0
    const coarse = createNavGrid({ cols, rows, cellSize: 1, originX: 0, originZ: 0, walkable })
    const straight = findPath(coarse, { x: 8, z: 23 }, { x: 8, z: 16 })!
    const fine = findPath(gridWithFurniture(coarse, [bench]), { x: 8, z: 23 }, { x: 8, z: 16 })
    expect(fine).not.toBeNull()
    const crosses = (path: { x: number; z: number }[]) => {
      const pts = [{ x: 8, z: 23 }, ...path]
      for (let i = 1; i < pts.length; i++) {
        for (let t = 0; t <= 1; t += 0.05) {
          const x = pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * t
          const z = pts[i - 1]!.z + (pts[i]!.z - pts[i - 1]!.z) * t
          if (x > 7.2 - 0.3 && x < 8.8 + 0.3 && z > 18.75 - 0.3 && z < 19.25 + 0.3) return true
        }
      }
      return false
    }
    expect(crosses(straight)).toBe(true)
    expect(crosses(fine!)).toBe(false)
  })
})
