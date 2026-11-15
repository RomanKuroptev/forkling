import { describe, expect, it } from 'vitest'
import {
  createNavGrid,
  findPath,
  isWalkable,
  lineOfSight,
  nearestWalkable,
  type NavGrid,
} from '../src/nav.ts'

/** A grid from ASCII art: `#` blocked, anything else open. One character per 1 m cell, centred on the origin. */
function ascii(rows: string[]): NavGrid {
  const cols = rows[0]!.length
  const walkable = new Uint8Array(cols * rows.length)
  rows.forEach((row, r) => [...row].forEach((ch, c) => (walkable[r * cols + c] = ch === '#' ? 0 : 1)))
  return createNavGrid({ cols, rows: rows.length, cellSize: 1, originX: 0, originZ: 0, walkable })
}

/** Centre of the cell at (col, row) in an `ascii` grid. */
const at = (col: number, row: number) => ({ x: col + 0.5, z: row + 0.5 })

describe('findPath on small grids', () => {
  it('goes straight across open ground with a single waypoint', () => {
    const grid = ascii(['........', '........', '........', '........'])
    const path = findPath(grid, at(0, 0), at(7, 3))!
    expect(path).toEqual([at(7, 3)])
  })

  it('routes around a wall through the gap', () => {
    const grid = ascii([
      '....#....',
      '....#....',
      '....#....',
      '.........',
      '....#....',
    ])
    const path = findPath(grid, at(0, 0), at(8, 0))!
    expect(path.length).toBeGreaterThan(1)
    expect(path[path.length - 1]).toEqual(at(8, 0))
    // Every leg has clear line of sight, so the path never crosses the wall.
    let prev = at(0, 0)
    for (const p of path) {
      expect(lineOfSight(grid, prev, p)).toBe(true)
      prev = p
    }
    // And it really did use the gap in row 3.
    expect(path.some((p) => Math.floor(p.z) === 3)).toBe(true)
  })

  it('returns null when the target is walled off', () => {
    const grid = ascii(['..#..', '..#..', '..#..'])
    expect(findPath(grid, at(0, 1), at(4, 1))).toBeNull()
  })

  it('returns null when start or target is not walkable', () => {
    const grid = ascii(['..#..'])
    expect(findPath(grid, at(2, 0), at(4, 0))).toBeNull()
    expect(findPath(grid, at(0, 0), at(2, 0))).toBeNull()
    expect(findPath(grid, { x: -5, z: 0.5 }, at(4, 0))).toBeNull()
  })

  it('does not cut the corner between two diagonal blockers', () => {
    const grid = ascii(['.#', '#.'])
    expect(findPath(grid, at(0, 0), at(1, 1))).toBeNull()
  })

  it('returns an empty path when already at the target cell', () => {
    const grid = ascii(['...'])
    expect(findPath(grid, at(1, 0), { x: 1.4, z: 0.6 })).toEqual([{ x: 1.4, z: 0.6 }])
  })

  it('is deterministic', () => {
    const grid = ascii(['....#....', '....#....', '.........', '....#....'])
    expect(findPath(grid, at(0, 0), at(8, 3))).toEqual(findPath(grid, at(0, 0), at(8, 3)))
  })
})

describe('nearestWalkable', () => {
  it('returns the point itself when it is walkable', () => {
    const grid = ascii(['...'])
    expect(nearestWalkable(grid, at(1, 0))).toEqual(at(1, 0))
  })

  it('snaps to the closest open cell centre', () => {
    const grid = ascii(['###..', '###..'])
    expect(nearestWalkable(grid, at(0, 0))).toEqual(at(3, 0))
  })

  it('returns null when nothing is within range', () => {
    const grid = ascii(['####'])
    expect(nearestWalkable(grid, at(1, 0), 5)).toBeNull()
  })
})
