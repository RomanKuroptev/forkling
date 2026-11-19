import { describe, expect, it } from 'vitest'
import { surfaceFights, type DrawnBox } from '../src/qa-surfaces.ts'

/** An axis-aligned box from its middle and size, as a column-major matrix of the unit cube. */
const box = (at: [number, number, number], size: [number, number, number], color: string, extra: Partial<DrawnBox> = {}): DrawnBox => ({
  matrix: [size[0], 0, 0, 0, 0, size[1], 0, 0, 0, 0, size[2], 0, at[0], at[1], at[2], 1],
  color,
  ...extra,
})

/** A box turned `a` radians about y. */
const turned = (at: [number, number, number], size: [number, number, number], a: number, color: string): DrawnBox => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { matrix: [c * size[0], 0, -s * size[0], 0, 0, size[1], 0, 0, s * size[2], 0, c * size[2], 0, at[0], at[1], at[2], 1], color }
}

describe('surfaces that fight (z-fighting)', () => {
  it('finds a floor whose top lies in the plane of the slab under it, in another colour (issues 350, 353)', () => {
    const slab = box([0, 0.06, 0], [14, 0.12, 12], '#ffffff')
    const floor = box([0, 0.06, 0], [11, 0.12, 9], '#dedcff')
    // The tops fight, and so do the undersides.
    const fights = surfaceFights([slab, floor])
    expect(fights.map((f) => Math.round(f.normal[1])).sort()).toEqual([-1, 1])
    expect(fights[0]!.area).toBeCloseTo(99)
  })

  it('leaves a floor raised a centimetre above the slab alone', () => {
    expect(surfaceFights([box([0, 0.06, 0], [14, 0.12, 12], '#ffffff'), box([0, 0.065, 0], [11, 0.15, 9], '#dedcff')])).toEqual([])
  })

  it('finds the back of a title bar flush with the back of its panel (issue 337)', () => {
    const panel = box([0, 5, 0], [8, 2, 0.5], '#bfeaf5')
    const bar = box([0, 5.5, 0.05], [8, 1, 0.6], '#ff3fa4')
    const normals = surfaceFights([panel, bar]).map((f) => f.normal.map((n) => Math.round(n)).join(','))
    // The back (-z), both sides and the top share their planes.
    expect(normals).toEqual(expect.arrayContaining(['0,0,-1', '1,0,0', '-1,0,0', '0,1,0']))
  })

  it('finds the feet of furniture flush with the underside of the floor they stand on (issue 335)', () => {
    const floor = box([0, 3.06, 0], [8, 0.12, 8], '#dedcff')
    const leg = box([1, 3.345, 1], [0.07, 0.69, 0.07], '#7a5cff')
    expect(surfaceFights([floor, leg]).map((f) => f.normal[1])).toEqual([-1])
  })

  it('ignores faces of one colour, faces that look opposite ways, faces only touching at an edge, and small slivers', () => {
    expect(surfaceFights([box([0, 0.5, 0], [2, 1, 2], '#ffffff'), box([0, 0.5, 0], [1, 1, 2], '#FFFFFF')])).toEqual([])
    // Stacked: the top of one is the bottom of the other.
    expect(surfaceFights([box([0, 0.5, 0], [2, 1, 2], '#ffffff'), box([0, 1.5, 0], [2, 1, 2], '#000000')])).toEqual([])
    // Side by side, sharing only an edge of their tops.
    expect(surfaceFights([box([0, 0.5, 0], [2, 1, 2], '#ffffff'), box([2, 0.5, 0], [2, 1, 2], '#000000')])).toEqual([])
    // A 2 cm by 2 cm patch is too small to see.
    expect(surfaceFights([box([0, 0.5, 0], [2, 1, 2], '#ffffff'), box([0.99, 0.5, 0.99], [0.02, 1, 0.02], '#000000')]).filter((f) => f.normal[1] > 0.5)).toEqual([])
  })

  it('ignores a shared patch hidden inside a third box, and two boxes of one group', () => {
    const a = box([0, 0.5, 0], [2, 1, 2], '#ffffff')
    const b = box([0, 0.5, 0], [2, 1, 2], '#000000')
    const lid = box([0, 1.5, 0], [3, 1.2, 3], '#ff0000')
    expect(surfaceFights([a, b, lid]).filter((f) => f.normal[1] > 0.5)).toEqual([])
    expect(surfaceFights([{ ...a, group: 'shelf' }, { ...b, group: 'shelf' }])).toEqual([])
  })

  it('finds turned boxes too, in their own plane', () => {
    const a = turned([0, 0.5, 0], [2, 1, 0.4], 0.5, '#ffffff')
    const b = turned([0, 0.5, 0], [1, 1, 0.4], 0.5, '#000000')
    const fights = surfaceFights([a, b])
    expect(fights.length).toBeGreaterThanOrEqual(2)
    expect(fights.some((f) => Math.abs(f.normal[0] - Math.sin(0.5)) < 1e-6 && Math.abs(f.normal[2] - Math.cos(0.5)) < 1e-6)).toBe(true)
  })
})
