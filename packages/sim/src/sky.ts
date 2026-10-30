import type { IslandConfig } from '@forkling/schema'
import { heightAt } from './island.ts'
import { isWalkable, worldToCell, type NavGrid, type Point2 } from './nav.ts'

/** A shadow-casting prop, as a vertical cylinder. `top` is an absolute world y in meters. */
export interface Caster extends Point2 {
  radius: number
  top: number
}

export type Vec3Tuple = [number, number, number]

/** Highest the sun climbs, in degrees above the horizon. Keeps shadows from vanishing at noon. */
const MAX_ELEVATION_DEG = 70

const SUNRISE = 6
const SUNSET = 20

/** Unit vector from the ground towards the sun. +x is east, y is up. Rises at 6:00, peaks at 13:00, sets at 20:00. */
export function sunDirection(hour: number): Vec3Tuple {
  const angle = (Math.PI * (hour - SUNRISE)) / (SUNSET - SUNRISE)
  const elevation = Math.sin(angle) * MAX_ELEVATION_DEG * (Math.PI / 180)
  const azimuth = Math.cos(angle)
  const horizontal = Math.cos(elevation)
  // A slight tilt to the south keeps noon shadows pointing somewhere.
  const x = azimuth * horizontal
  const z = 0.35 * horizontal
  const y = Math.sin(elevation)
  const n = Math.hypot(x, y, z)
  return [x / n, y / n, z / n]
}

/** Whether a point is in direct sunlight: the sun is up and no caster's cylinder is on the ray towards it. */
export function isSunlit(p: { x: number; y: number; z: number }, sun: Vec3Tuple, casters: readonly Caster[]): boolean {
  if (sun[1] <= 0.05) return false
  const hLen = Math.hypot(sun[0], sun[2])
  const hx = sun[0] / hLen
  const hz = sun[2] / hLen
  // Height gained per meter travelled horizontally towards the sun.
  const rise = sun[1] / hLen
  for (const c of casters) {
    const dx = c.x - p.x
    const dz = c.z - p.z
    // Where along the ray the horizontal distance to the caster is smallest.
    const s = Math.max(0, dx * hx + dz * hz)
    const nearX = p.x + hx * s - c.x
    const nearZ = p.z + hz * s - c.z
    if (Math.hypot(nearX, nearZ) <= c.radius && p.y + rise * s <= c.top) return false
  }
  return true
}

export interface SunbeamOptions {
  /** Distance between candidate spots, in cells. */
  spacing?: number
  /** A sunbeam must be within this many meters of a caster, so it is a patch of light among shade. */
  nearCaster?: number
}

/** Walkable, sunlit spots beside props. They drift around the props as the sun moves, which is where a cat naps. */
export function findSunbeams(
  cfg: IslandConfig,
  grid: NavGrid,
  sun: Vec3Tuple,
  casters: readonly Caster[],
  opts: SunbeamOptions = {},
): Point2[] {
  const { spacing = 3, nearCaster = 6 } = opts
  if (sun[1] <= 0.05) return []
  const found: Point2[] = []
  for (let row = 0; row < grid.rows; row += spacing) {
    for (let col = 0; col < grid.cols; col += spacing) {
      const x = grid.originX + (col + 0.5) * grid.cellSize
      const z = grid.originZ + (row + 0.5) * grid.cellSize
      if (!isWalkable(grid, x, z) || !worldToCell(grid, x, z)) continue
      if (!casters.some((c) => Math.hypot(c.x - x, c.z - z) <= nearCaster)) continue
      if (isSunlit({ x, y: heightAt(x, z, cfg), z }, sun, casters)) found.push({ x, z })
    }
  }
  return found
}
