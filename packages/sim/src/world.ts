import type { IslandConfig, SpeciesPack, WorldObject } from '@forkling/schema'
import { heightAt, type PropPlacement } from './island.ts'
import { eatsFrom, matchesTarget, portionsLeft } from './objects.ts'
import { buildNavGrid, isWalkable, nearestWalkable, type NavGrid, type Obstacle, type Point2 } from './nav.ts'
import { findSunbeams, type Caster, type Vec3Tuple } from './sky.ts'

/** How a kind of prop blocks walking and casts shadows, in meters at scale 1. */
export interface Footprint {
  /** Radius that blocks walking. */
  blocks: number
  /** Radius of the shadow it casts. */
  shade: number
  height: number
}

export const DEFAULT_FOOTPRINTS: Record<string, Footprint> = {
  tree: { blocks: 0.4, shade: 1.0, height: 4.2 },
  rock: { blocks: 0.9, shade: 0.8, height: 1.0 },
}

export interface WorldNav {
  grid: NavGrid
  obstacles: Obstacle[]
  casters: Caster[]
}

/** Walkability and shadow geometry for the island and its props. Built once, since props don't move in M2. */
export function buildWorldNav(
  cfg: IslandConfig,
  placements: readonly PropPlacement[],
  footprints: Record<string, Footprint>,
): WorldNav {
  const obstacles: Obstacle[] = []
  const casters: Caster[] = []
  for (const p of placements) {
    const f = footprints[p.kind]
    if (!f) continue
    const [x, y, z] = p.position
    obstacles.push({ x, z, radius: f.blocks * p.scale })
    casters.push({ x, z, radius: f.shade * p.scale, top: y + f.height * p.scale })
  }
  return { grid: buildNavGrid(cfg, obstacles), obstacles, casters }
}

/** Walkable high ground, highest first. Anywhere a forkling can climb to survey its island. */
export function perchSpots(cfg: IslandConfig, grid: NavGrid, count = 6, spacing = 5): Point2[] {
  const candidates: (Point2 & { y: number })[] = []
  for (let row = 0; row < grid.rows; row += spacing) {
    for (let col = 0; col < grid.cols; col += spacing) {
      const x = grid.originX + (col + 0.5) * grid.cellSize
      const z = grid.originZ + (row + 0.5) * grid.cellSize
      if (isWalkable(grid, x, z)) candidates.push({ x, z, y: heightAt(x, z, cfg) })
    }
  }
  candidates.sort((a, b) => b.y - a.y || a.x - b.x || a.z - b.z)
  return candidates.slice(0, count).map(({ x, z }) => ({ x, z }))
}

/**
 * The spots the world offers, by kind: `food` from the pack's starter spots (until objects arrive in M5),
 * `perch` from high ground, and `sunbeam` from the current sun. Objects add a spot under each of their affordances
 * and a `perch` when they are high (so a rock that can be perched on is one more `perch`) and one under their own id, so a goal can name a single one.
 * A verb that targets objects gets `for:<verb>`: the objects its properties filter or unlocks match.
 * Any pack's actions may target these kinds.
 */
export function collectSpots(
  pack: SpeciesPack,
  cfg: IslandConfig,
  nav: WorldNav,
  spawn: Point2,
  sun: Vec3Tuple,
  objects: readonly WorldObject[] = [],
): Record<string, Point2[]> {
  const spots: Record<string, Point2[]> = {}
  for (const s of pack.starterSpots) {
    const p = nearestWalkable(nav.grid, { x: spawn.x + s.offset[0], z: spawn.z + s.offset[1] }, 12)
    if (p) (spots[s.kind] ??= []).push(p)
  }
  spots.perch = perchSpots(cfg, nav.grid)
  spots.sunbeam = findSunbeams(cfg, nav.grid, sun, nav.casters)
  for (const o of objects) {
    if (o.state.held) continue
    // Objects block walking, so the spot is the nearest ground beside them.
    const p = nearestWalkable(nav.grid, { x: o.position[0], z: o.position[2] }, 4)
    if (!p) continue
    spots[o.id] = [p]
    for (const kind of o.affordances) (spots[kind] ??= []).push(p)
    if (o.properties.high && !o.affordances.includes('perch')) (spots.perch ??= []).push(p)
    // Something with no portions left feeds nobody: it is still there to look at, but not to eat from.
    const empty = portionsLeft(o) === 0
    for (const verb of pack.actions) {
      if (empty && eatsFrom(verb)) continue
      if (verb.target.type === 'object' && matchesTarget(verb.target, verb.id, o)) (spots[`for:${verb.id}`] ??= []).push(p)
    }
  }
  return spots
}
