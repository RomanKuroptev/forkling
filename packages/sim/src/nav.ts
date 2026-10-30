import type { IslandConfig } from '@forkling/schema'
import { heightAt } from './island.ts'

export interface Point2 {
  x: number
  z: number
}

/** A circular footprint that blocks walking, in meters. */
export interface Obstacle extends Point2 {
  radius: number
}

/** Walkability over the island in square cells. Cell (col, row) covers x from `originX + col * cellSize`, and likewise for z. */
export interface NavGrid {
  cols: number
  rows: number
  cellSize: number
  originX: number
  originZ: number
  /** Row-major, 1 where walkable. */
  walkable: Uint8Array
}

export interface NavOptions {
  cellSize?: number
  /** Minimum height above the waterline for a cell to count as dry land, in meters. */
  minAboveWater?: number
  /** Steepest slope that can be walked, in degrees. */
  maxSlopeDeg?: number
  /** Extra clearance around obstacles, in meters. */
  margin?: number
}

export function createNavGrid(grid: NavGrid): NavGrid {
  return grid
}

export function buildNavGrid(cfg: IslandConfig, obstacles: Obstacle[], opts: NavOptions = {}): NavGrid {
  const { cellSize = 1, minAboveWater = 0.3, maxSlopeDeg = 35, margin = 0.3 } = opts
  const cols = Math.ceil(cfg.size / cellSize)
  const rows = cols
  const originX = -cfg.size / 2
  const originZ = -cfg.size / 2
  const walkable = new Uint8Array(cols * rows)
  const maxSlope = Math.tan((maxSlopeDeg * Math.PI) / 180)
  const probe = cellSize / 2

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = originX + (col + 0.5) * cellSize
      const z = originZ + (row + 0.5) * cellSize
      if (heightAt(x, z, cfg) <= cfg.waterLevel + minAboveWater) continue
      const dx = (heightAt(x + probe, z, cfg) - heightAt(x - probe, z, cfg)) / (2 * probe)
      const dz = (heightAt(x, z + probe, cfg) - heightAt(x, z - probe, cfg)) / (2 * probe)
      if (Math.hypot(dx, dz) >= maxSlope) continue
      walkable[row * cols + col] = 1
    }
  }

  const grid = createNavGrid({ cols, rows, cellSize, originX, originZ, walkable })
  for (const o of obstacles) {
    const reach = o.radius + margin
    const c0 = Math.floor((o.x - reach - originX) / cellSize)
    const c1 = Math.floor((o.x + reach - originX) / cellSize)
    const r0 = Math.floor((o.z - reach - originZ) / cellSize)
    const r1 = Math.floor((o.z + reach - originZ) / cellSize)
    for (let row = Math.max(0, r0); row <= Math.min(rows - 1, r1); row++) {
      for (let col = Math.max(0, c0); col <= Math.min(cols - 1, c1); col++) {
        const c = cellCenter(grid, col, row)
        if (Math.hypot(c.x - o.x, c.z - o.z) <= reach) walkable[row * cols + col] = 0
      }
    }
    // The cell holding the obstacle's centre is always blocked, even for a footprint smaller than a cell.
    const cell = worldToCell(grid, o.x, o.z)
    if (cell) walkable[cell.row * cols + cell.col] = 0
  }
  return grid
}

export function cellCenter(grid: NavGrid, col: number, row: number): Point2 {
  return { x: grid.originX + (col + 0.5) * grid.cellSize, z: grid.originZ + (row + 0.5) * grid.cellSize }
}

export function worldToCell(grid: NavGrid, x: number, z: number): { col: number; row: number } | null {
  const col = Math.floor((x - grid.originX) / grid.cellSize)
  const row = Math.floor((z - grid.originZ) / grid.cellSize)
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null
  return { col, row }
}

export function isWalkable(grid: NavGrid, x: number, z: number): boolean {
  const cell = worldToCell(grid, x, z)
  return cell !== null && grid.walkable[cell.row * grid.cols + cell.col] === 1
}

/** True when the straight segment from `a` to `b` stays on walkable cells. */
export function lineOfSight(grid: NavGrid, a: Point2, b: Point2): boolean {
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  const steps = Math.max(1, Math.ceil(length / (grid.cellSize * 0.25)))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (!isWalkable(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false
  }
  return true
}

/** The point itself if it is walkable, else the centre of the closest walkable cell within `maxRadius` meters. */
export function nearestWalkable(grid: NavGrid, p: Point2, maxRadius = 30): Point2 | null {
  if (isWalkable(grid, p.x, p.z)) return p
  const c0 = Math.max(0, Math.floor((p.x - maxRadius - grid.originX) / grid.cellSize))
  const c1 = Math.min(grid.cols - 1, Math.floor((p.x + maxRadius - grid.originX) / grid.cellSize))
  const r0 = Math.max(0, Math.floor((p.z - maxRadius - grid.originZ) / grid.cellSize))
  const r1 = Math.min(grid.rows - 1, Math.floor((p.z + maxRadius - grid.originZ) / grid.cellSize))
  let best: Point2 | null = null
  let bestDist = maxRadius
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (!grid.walkable[row * grid.cols + col]) continue
      const c = cellCenter(grid, col, row)
      const d = Math.hypot(c.x - p.x, c.z - p.z)
      if (d < bestDist) {
        best = c
        bestDist = d
      }
    }
  }
  return best
}

const SQRT2 = Math.SQRT2
const NEIGHBORS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
]

/** Minimal binary min-heap keyed by f, ties broken by node index so runs are deterministic. */
class Heap {
  private f: number[] = []
  private node: number[] = []

  get size() {
    return this.f.length
  }

  push(f: number, node: number) {
    let i = this.f.length
    this.f.push(f)
    this.node.push(node)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.less(parent, i)) break
      this.swap(i, parent)
      i = parent
    }
  }

  pop(): number {
    const top = this.node[0]!
    const lastF = this.f.pop()!
    const lastNode = this.node.pop()!
    if (this.f.length > 0) {
      this.f[0] = lastF
      this.node[0] = lastNode
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.f.length && this.less(l, m)) m = l
        if (r < this.f.length && this.less(r, m)) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }

  private less(a: number, b: number) {
    return this.f[a]! < this.f[b]! || (this.f[a] === this.f[b] && this.node[a]! < this.node[b]!)
  }

  private swap(a: number, b: number) {
    ;[this.f[a], this.f[b]] = [this.f[b]!, this.f[a]!]
    ;[this.node[a], this.node[b]] = [this.node[b]!, this.node[a]!]
  }
}

/**
 * A* over the grid (8-connected, no corner cutting, octile heuristic), then string-pulled so only
 * the turning points remain. Returns the waypoints after `from`, ending exactly at `to`, or null if
 * either end is unwalkable or unreachable.
 */
export function findPath(grid: NavGrid, from: Point2, to: Point2): Point2[] | null {
  const start = worldToCell(grid, from.x, from.z)
  const goal = worldToCell(grid, to.x, to.z)
  if (!start || !goal) return null
  const { cols, walkable } = grid
  const s = start.row * cols + start.col
  const g = goal.row * cols + goal.col
  if (!walkable[s] || !walkable[g]) return null
  if (s === g) return [to]

  const cost = new Float32Array(grid.cols * grid.rows).fill(Infinity)
  const parent = new Int32Array(grid.cols * grid.rows).fill(-1)
  const closed = new Uint8Array(grid.cols * grid.rows)
  const heuristic = (col: number, row: number) => {
    const dx = Math.abs(col - goal.col)
    const dz = Math.abs(row - goal.row)
    return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz)
  }

  const open = new Heap()
  cost[s] = 0
  open.push(heuristic(start.col, start.row), s)
  while (open.size > 0) {
    const cur = open.pop()
    if (closed[cur]) continue
    closed[cur] = 1
    if (cur === g) break
    const col = cur % cols
    const row = (cur - col) / cols
    for (const [dc, dr, step] of NEIGHBORS) {
      const nc = col + dc
      const nr = row + dr
      if (nc < 0 || nr < 0 || nc >= cols || nr >= grid.rows) continue
      const n = nr * cols + nc
      if (!walkable[n] || closed[n]) continue
      // No cutting the corner between two blockers.
      if (dc !== 0 && dr !== 0 && (!walkable[row * cols + nc] || !walkable[nr * cols + col])) continue
      const next = cost[cur]! + step
      if (next < cost[n]!) {
        cost[n] = next
        parent[n] = cur
        open.push(next + heuristic(nc, nr), n)
      }
    }
  }
  if (parent[g] === -1) return null

  const cells: Point2[] = []
  for (let n = parent[g]!; n !== s; n = parent[n]!) {
    cells.push(cellCenter(grid, n % cols, Math.floor(n / cols)))
  }
  const points = [from, ...cells.reverse(), to]

  // String pulling: from each anchor, jump to the furthest point still in line of sight.
  const path: Point2[] = []
  let anchor = 0
  while (anchor < points.length - 1) {
    let next = points.length - 1
    while (next > anchor + 1 && !lineOfSight(grid, points[anchor]!, points[next]!)) next--
    path.push(points[next]!)
    anchor = next
  }
  return path
}
