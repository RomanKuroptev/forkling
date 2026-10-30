import { starterPropRules, starterWorld } from '@forkling/sim'

/** The hardcoded starter island, shared with the sim tests. From M3 on this comes from the world repo. */
const world = starterWorld()

export const island = world.cfg
export const spawn = world.spawn
export const props = world.placements
export const rules = starterPropRules
/** Walkability and shadow casters, for the forkling's pathfinding and sunbeams. */
export const nav = world.nav
