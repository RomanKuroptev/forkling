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
  // One place beyond Home and the Workshop is closed, so a boarded door and its sign can be looked at (spec 9.9).
  const toClose = world.places.find((p) => p.id !== 'home' && p.id !== 'workshop')
  if (toClose && world.places.length > 2) toClose.state = { ...toClose.state, closed: { at: new Date(nowMs - 3 * 86_400_000).toISOString(), reason: 'I have nothing new to put in it for now.' } }
  if (toClose && world.places.length > 2) toClose.away = [{ id: 'old-map', kind: 'souvenir', label: 'A map of the fog bank.', at: new Date(nowMs - 5 * 86_400_000).toISOString().slice(0, 10), reason: 'It said what it had to say.' }]
  const home = world.places.find((p) => p.id === 'home')!
  const [hx, hz] = placeCentre(toLandPlace(home))
  const now = new Date(nowMs).toISOString()
  const forkling = Forkling.parse({
    ...templateForkling,
    name: 'Fixture',
    position: [hx, 0, hz],
    intention: { ...templateForkling.intention, type: pack.mindPoses.wander ?? 'sit', startedAt: now },
    lastTickAt: now,
  })
  // A wander step is in progress for an hour, so the cat is shown reading at the desk at Home.
  const goals = {
    today: { date: now.slice(0, 10), steps: [{ verb: 'wander', reason: 'Reading at my desk.', minutes: 60 }], reason: 'A plan for looking at the fixture.' },
    now: { index: 0, startedAt: now, until: new Date(nowMs + 3_600_000).toISOString() },
  }
  return { ref: LOCAL_REF, sha: 'fixture', committedAt: now, forkling, pack, places: world.places, requests: world.requests, workIds: [], goals }
}
