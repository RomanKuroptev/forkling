export interface Point2 {
  x: number
  z: number
}

/**
 * A named point the body goes to (`BodyWorld.spots`). At a seat it carries `perch`, the height of the seat top the body sits on
 * (meters), and `face`, the yaw it turns to when it gets there (radians, 0 facing +z).
 */
export interface Spot extends Point2 {
  perch?: number
  face?: number
}

/** Walkability over the land in square cells. Cell (col, row) covers x from `originX + col * cellSize`, and likewise for z. */
export interface NavGrid {
  cols: number
  rows: number
  cellSize: number
  originX: number
  originZ: number
  /** Row-major, 1 where walkable. */
  walkable: Uint8Array
}

export function createNavGrid(grid: NavGrid): NavGrid {
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

/**
 * True when the straight segment from `a` to `b` only touches walkable cells. Walks every cell the
 * segment crosses (Amanatides-Woo), so no sliver of a blocked cell is missed. Passing exactly through a
 * corner needs both cells beside it to be open.
 */
export function lineOfSight(grid: NavGrid, a: Point2, b: Point2): boolean {
  const open = (col: number, row: number) =>
    col >= 0 && row >= 0 && col < grid.cols && row < grid.rows && grid.walkable[row * grid.cols + col] === 1

  const x0 = (a.x - grid.originX) / grid.cellSize
  const z0 = (a.z - grid.originZ) / grid.cellSize
  const dx = (b.x - grid.originX) / grid.cellSize - x0
  const dz = (b.z - grid.originZ) / grid.cellSize - z0
  let col = Math.floor(x0)
  let row = Math.floor(z0)
  const endCol = Math.floor(x0 + dx)
  const endRow = Math.floor(z0 + dz)
  const stepCol = Math.sign(dx)
  const stepRow = Math.sign(dz)
  const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx)
  const deltaZ = dz === 0 ? Infinity : Math.abs(1 / dz)
  let nextX = dx === 0 ? Infinity : (dx > 0 ? col + 1 - x0 : x0 - col) * deltaX
  let nextZ = dz === 0 ? Infinity : (dz > 0 ? row + 1 - z0 : z0 - row) * deltaZ

  const limit = Math.abs(endCol - col) + Math.abs(endRow - row) + 2
  for (let i = 0; i < limit; i++) {
    if (!open(col, row)) return false
    if (col === endCol && row === endRow) return true
    if (nextX < nextZ) {
      col += stepCol
      nextX += deltaX
    } else if (nextZ < nextX) {
      row += stepRow
      nextZ += deltaZ
    } else {
      if (!open(col + stepCol, row) || !open(col, row + stepRow)) return false
      col += stepCol
      row += stepRow
      nextX += deltaX
      nextZ += deltaZ
    }
  }
  return open(col, row) && col === endCol && row === endRow
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
