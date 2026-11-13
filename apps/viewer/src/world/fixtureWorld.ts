import { Forkling, type SpeciesPack } from '@forkling/schema'
import { placeCentre, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import templateForkling from '../../../../templates/forkling-world/forkling.json'
import { LOCAL_REF } from './localWorld.ts'
import type { LoadedWorld } from './loadWorld.ts'

/**
 * `?world=local&fixture=10`: a made-up world of that many places (at least 2, at most 64), built in the browser from the real
 * Home, Workshop and kit, with a cat resting at Home. Nothing is read from the network, so it is the way to look at the land
 * and to measure how fast it draws.
 */
export function loadFixtureWorld(count: number, pack: SpeciesPack, nowMs: number = Date.now()): LoadedWorld {
  const world = makeFixtureWorld(1, Math.min(64, Math.max(2, Math.floor(count))), new Date(nowMs).toISOString())
  const home = world.places.find((p) => p.id === 'home')!
  const [hx, hz] = placeCentre(toLandPlace(home))
  const now = new Date(nowMs).toISOString()
  const forkling = Forkling.parse({
    ...templateForkling,
    name: 'Fixture',
    position: [hx, 0, hz],
    intention: { ...templateForkling.intention, startedAt: now },
    lastTickAt: now,
  })
  return { ref: LOCAL_REF, sha: 'fixture', committedAt: now, forkling, pack, objects: [], places: world.places, goals: {} }
}
