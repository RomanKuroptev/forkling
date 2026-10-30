import { IslandConfig } from '@forkling/schema'
import { findSpawn, scatterProps, type PropPlacement, type PropRule, type Spawn } from './island.ts'
import { buildWorldNav, DEFAULT_FOOTPRINTS, type WorldNav } from './world.ts'

/** The hardcoded starter island. From M3 on the world comes from the forkling's repo instead. */
export const starterIsland = IslandConfig.parse({ seed: 1234 })

export const starterPropRules: PropRule[] = [
  {
    kind: 'tree',
    variants: 3,
    count: 70,
    minSpacing: 3.5,
    minHeight: starterIsland.waterLevel + 1.2,
    maxHeight: starterIsland.maxHeight * 0.75,
  },
  {
    kind: 'rock',
    variants: 3,
    count: 35,
    minSpacing: 2.5,
    minHeight: starterIsland.waterLevel + 0.2,
    maxHeight: starterIsland.maxHeight,
  },
]

export interface StarterWorld {
  cfg: IslandConfig
  spawn: Spawn
  placements: PropPlacement[]
  nav: WorldNav
}

let cached: StarterWorld | null = null

/** The starter island with its props and walkability, built once. */
export function starterWorld(): StarterWorld {
  if (!cached) {
    const cfg = starterIsland
    const spawn = findSpawn(cfg)
    const placements = scatterProps(cfg, starterPropRules, { clear: [{ x: spawn.x, z: spawn.z, radius: 5 }] })
    cached = { cfg, spawn, placements, nav: buildWorldNav(cfg, placements, DEFAULT_FOOTPRINTS) }
  }
  return cached
}
