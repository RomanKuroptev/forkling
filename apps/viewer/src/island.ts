import { IslandConfig } from '@forkling/schema'
import { findSpawn, scatterProps, type PropRule } from '@forkling/sim'

/** The hardcoded M1 island. From M3 on this comes from the world repo. */
export const island = IslandConfig.parse({ seed: 1234 })

export const spawn = findSpawn(island)

const rules: PropRule[] = [
  { kind: 'tree', variants: 3, count: 70, minSpacing: 3.5, minHeight: island.waterLevel + 1.2, maxHeight: island.maxHeight * 0.75 },
  { kind: 'rock', variants: 3, count: 35, minSpacing: 2.5, minHeight: island.waterLevel + 0.2, maxHeight: island.maxHeight },
]

export const props = scatterProps(island, rules, { clear: [{ x: spawn.x, z: spawn.z, radius: 5 }] })
