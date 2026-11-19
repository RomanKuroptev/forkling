import { describe, expect, it } from 'vitest'
import { inTheWay, sightLines } from '../../src/world/bump.ts'

// Merge at (8, 17.5), facing the door (+z); the old camera stood 1.5 m in front, over Home's bench (issue 348).
const merge = { min: [7.7, 0, 17.0], max: [8.3, 1.0, 18.0] }
const position = [8, 0.7, 19]
const target = [8, 0.4, 17.5]

describe('the merge-close picture has nothing between the lens and Merge (issue 348)', () => {
  const lines = sightLines(position, target, merge, 70, 1280 / 800)

  it('casts lines to Merge, its feet to its top, and across the picture, each short of Merge', () => {
    expect(lines.length).toBe(3 + 35)
    for (const l of lines) {
      expect(Math.hypot(...l.dir)).toBeCloseTo(1)
      expect(l.reach).toBeLessThan(1.5)
    }
  })

  it('planted: the bench top 0.2 m under the lens is in the way', () => {
    // The lines heading down meet the bench top (0.5 m high) a little way out.
    const hits = lines.map((l) => (l.dir[1] < -0.2 ? { distance: 0.2 / -l.dir[1], object: 'InstancedMesh' } : null))
    expect(inTheWay(position, lines, hits, merge).length).toBeGreaterThan(0)
  })

  it("Merge's own body reaching out of its box (a paw, the tail) is not in the way; anything else there is", () => {
    const at = lines.map((l) => ({ distance: l.reach - 0.4, object: 'Mesh' }))
    expect(inTheWay(position, lines, at.map((h) => ({ ...h, of: 'merge' })), merge)).toEqual([])
    expect(inTheWay(position, lines, at, merge).length).toBeGreaterThan(0)
  })

  it('a clear picture is not in the way: nothing hit, Merge itself, or the floor', () => {
    expect(inTheWay(position, lines, lines.map(() => null), merge)).toEqual([])
    // Merge's own body, hit inside its box.
    const own = lines.map((l) => {
      const d = l.reach - 0.01
      const p = [0, 1, 2].map((k) => position[k]! + l.dir[k]! * d)
      return p.every((v, k) => v >= merge.min[k]! - 0.05 && v <= merge.max[k]! + 0.05) ? { distance: d, object: 'Mesh' } : null
    })
    expect(own.some((h) => h !== null)).toBe(true)
    expect(inTheWay(position, lines, own, merge)).toEqual([])
    // The floor, hit where a line heading down meets it before Merge.
    const floor = lines.map((l) => (l.dir[1] < 0 && 0.7 / -l.dir[1] < l.reach ? { distance: 0.7 / -l.dir[1], object: 'Land' } : null))
    expect(floor.some((h) => h !== null)).toBe(true)
    expect(inTheWay(position, lines, floor, merge)).toEqual([])
  })
})
