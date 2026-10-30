import { IslandConfig } from '@forkling/schema'
import { findSpawn, scatterProps, type PropRule } from '../../src/island.ts'
import { buildWorldNav, DEFAULT_FOOTPRINTS } from '../../src/world.ts'

/** The same island the viewer shows, so sim tests run against the real terrain. */
export const cfg = IslandConfig.parse({ seed: 1234 })
export const spawn = findSpawn(cfg)

const rules: PropRule[] = [
  { kind: 'tree', variants: 3, count: 70, minSpacing: 3.5, minHeight: cfg.waterLevel + 1.2, maxHeight: cfg.maxHeight * 0.75 },
  { kind: 'rock', variants: 3, count: 35, minSpacing: 2.5, minHeight: cfg.waterLevel + 0.2, maxHeight: cfg.maxHeight },
]

export const placements = scatterProps(cfg, rules, { clear: [{ x: spawn.x, z: spawn.z, radius: 5 }] })
export const world = buildWorldNav(cfg, placements, DEFAULT_FOOTPRINTS)
