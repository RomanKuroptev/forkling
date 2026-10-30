import { describe, expect, it } from 'vitest'
import { IslandConfig } from '@forkling/schema'
import { heightAt, scatterProps, type PropRule } from '../src/island.ts'
import {
  buildNavGrid,
  createNavGrid,
  findPath,
  isWalkable,
  lineOfSight,
  nearestWalkable,
  type NavGrid,
  type Obstacle,
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

describe('buildNavGrid on the island', () => {
  const cfg = IslandConfig.parse({ seed: 1234 })
  const rules: PropRule[] = [
    { kind: 'tree', variants: 3, count: 70, minSpacing: 3.5, minHeight: cfg.waterLevel + 1.2, maxHeight: cfg.maxHeight * 0.75 },
    { kind: 'rock', variants: 3, count: 35, minSpacing: 2.5, minHeight: cfg.waterLevel + 0.2, maxHeight: cfg.maxHeight },
  ]
  const obstacles: Obstacle[] = scatterProps(cfg, rules).map((p) => ({
    x: p.position[0],
    z: p.position[2],
    radius: (p.kind === 'tree' ? 0.4 : 0.9) * p.scale,
  }))
  const grid = buildNavGrid(cfg, obstacles)

  it('covers the whole island', () => {
    expect(grid.cols).toBe(cfg.size)
    expect(grid.rows).toBe(cfg.size)
  })

  it('has walkable land in the middle and blocked sea at the edge', () => {
    expect(isWalkable(grid, 0, 0)).toBe(true)
    expect(isWalkable(grid, cfg.size / 2 - 0.5, 0.5)).toBe(false)
    expect(isWalkable(grid, 1000, 0)).toBe(false)
  })

  it('blocks cells that are below the waterline margin', () => {
    for (let x = -49.5; x < 50; x += 3) {
      for (let z = -49.5; z < 50; z += 3) {
        if (isWalkable(grid, x, z)) expect(heightAt(x, z, cfg)).toBeGreaterThan(cfg.waterLevel + 0.2)
      }
    }
  })

  it('blocks cells inside obstacles', () => {
    for (const o of obstacles) expect(isWalkable(grid, o.x, o.z)).toBe(false)
  })

  it('leaves most of the island walkable', () => {
    const land = Array.from(grid.walkable).filter(Boolean).length
    expect(land).toBeGreaterThan(1200)
  })

  it('finds paths between distant walkable points that stay on walkable ground', () => {
    const from = nearestWalkable(grid, { x: -30, z: -20 })!
    const to = nearestWalkable(grid, { x: 25, z: 28 })!
    const path = findPath(grid, from, to)!
    expect(path).not.toBeNull()
    let prev = from
    for (const p of path) {
      expect(isWalkable(grid, p.x, p.z)).toBe(true)
      expect(lineOfSight(grid, prev, p)).toBe(true)
      prev = p
    }
    expect(path[path.length - 1]).toEqual(to)
  })
})
