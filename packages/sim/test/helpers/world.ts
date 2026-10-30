import { starterWorld } from '../../src/starter.ts'

/** The same island the viewer shows, so sim tests run against the real terrain. */
const starter = starterWorld()
export const cfg = starter.cfg
export const spawn = starter.spawn
export const placements = starter.placements
export const world = starter.nav
