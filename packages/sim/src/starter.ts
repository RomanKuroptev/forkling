import { IslandConfig, type WorldObject } from '@forkling/schema'
import { findSpawn, heightAt, scatterProps, type PropPlacement, type PropRule, type Spawn } from './island.ts'
import { buildWorldNav, DEFAULT_FOOTPRINTS, type Footprint, type WorldNav } from './world.ts'

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
  /** The world repo's objects, which can also be where the forkling goes (by id or by affordance). */
  objects: WorldObject[]
}

let cached: StarterWorld | null = null

/** The starter island with its props and walkability, built once. */
export function starterWorld(): StarterWorld {
  if (!cached) {
    const cfg = starterIsland
    const spawn = findSpawn(cfg)
    const placements = scatterProps(cfg, starterPropRules, { clear: [{ x: spawn.x, z: spawn.z, radius: 5 }] })
    cached = { cfg, spawn, placements, nav: buildWorldNav(cfg, placements, DEFAULT_FOOTPRINTS), objects: [] }
  }
  return cached
}

/** How an object blocks and shades, by what its model looks like. Anything that isn't a tree or a rock is small. */
const OBJECT_FOOTPRINTS: Record<string, Footprint> = {
  ...DEFAULT_FOOTPRINTS,
  object: { blocks: 0.5, shade: 0.6, height: 1 },
}

function footprintKind(asset: string): string {
  if (asset.includes('tree')) return 'tree'
  if (asset.includes('rock')) return 'rock'
  return 'object'
}

/**
 * The starter island plus a world repo's objects, which block walking and cast shade like props. Every viewer (and
 * the mind, later) builds the same grid from the same objects, which keeps playback identical.
 */
export function worldWithObjects(objects: readonly WorldObject[]): StarterWorld {
  const starter = starterWorld()
  if (objects.length === 0) return starter
  const extra: PropPlacement[] = objects.map((o) => ({
    kind: 'asset' in o.model ? footprintKind(o.model.asset) : 'object',
    variant: 0,
    position: [o.position[0], heightAt(o.position[0], o.position[2], starter.cfg), o.position[2]],
    rotationY: o.rotation[1],
    scale: o.scale,
  }))
  const placements = [...starter.placements, ...extra]
  return { ...starter, placements, nav: buildWorldNav(starter.cfg, placements, OBJECT_FOOTPRINTS), objects: [...objects] }
}
