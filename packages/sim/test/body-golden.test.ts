import { describe, expect, it } from 'vitest'
import { Forkling, Place, SpeciesPack } from '@forkling/schema'
import homeFile from '../../../templates/forkling-world/places/home.json'
import workshopFile from '../../../templates/forkling-world/places/workshop.json'
import blobJson from './fixtures/blob.species.json'
import { buildBodyWorld, type BodyWorld } from '../src/body-world.ts'
import { makeFixtureWorld } from '../src/fixture-world.ts'
import { advancePlayback, startPlayback } from '../src/playback.ts'

/**
 * A determinism guard for retiring the pet era (W5 slice 14): the body on a world with places must not change when the island
 * and the objects are removed. The snapshot was written before any removal and must stay as it is.
 */
const blob = SpeciesPack.parse(blobJson)
const START = Date.UTC(2026, 11, 20, 6, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()

function day(world: BodyWorld) {
  const forkling = Forkling.parse({
    name: 'Blobby',
    species: 'blob',
    position: [world.spawn.x, 0, world.spawn.z],
    mood: 0.2,
    intention: { type: 'roam', startedAt: iso(START), seed: 99, reason: 'Blob felt like a stroll.' },
    lastTickAt: iso(START),
    timezone: 'Europe/Stockholm',
  })
  let pb = startPlayback({ forkling, pack: blob, behaviors: [], world }, START)
  const rows: string[] = []
  for (let t = START; t <= START + 24 * 3600 * 1000; t += 15 * 60 * 1000) {
    pb = advancePlayback(pb, t, null)
    const p = pb.state.pos
    rows.push(`${iso(t).slice(11, 16)} ${p.x.toFixed(2)},${p.z.toFixed(2)} ${pb.state.phase}`)
  }
  return rows
}

describe('the body on a world with places', () => {
  it('walks the same day on Home and the Workshop', () => {
    const world = buildBodyWorld(1, [Place.parse(homeFile), Place.parse(workshopFile)])
    expect(day(world)).toMatchSnapshot()
  })

  it('walks the same day on the 10-place fixture world', () => {
    const world = buildBodyWorld(1, makeFixtureWorld(1, 10).places)
    expect(day(world)).toMatchSnapshot()
  })

  it('has the same spawn and spots', () => {
    const world = buildBodyWorld(1, [Place.parse(homeFile), Place.parse(workshopFile)])
    expect({ spawn: world.spawn, visitor: world.visitorSpawn, spots: world.spots([0, 1, 0]) }).toMatchSnapshot()
  })
})
