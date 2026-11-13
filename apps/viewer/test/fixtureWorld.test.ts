import { describe, expect, it } from 'vitest'
import { SpeciesPack } from '@forkling/schema'
import catSpecies from '@forkling/species-cat/species.json'
import { loadFixtureWorld } from '../src/world/fixtureWorld.ts'

const pack = SpeciesPack.parse(catSpecies)

describe('the fixture world (?world=local&fixture=10)', () => {
  it('is a loaded world of the asked number of places, with Home first, and a cat to watch', () => {
    const world = loadFixtureWorld(10, pack)
    expect(world.places).toHaveLength(10)
    expect(world.places.map((p) => p.id)).toContain('home')
    expect(world.forkling.species).toBe('cat')
    expect(world.pack).toBe(pack)
    expect(world.objects).toEqual([])
  })
  it('puts the cat at rest at Home, on the fixture\'s own clock', () => {
    const world = loadFixtureWorld(10, pack)
    expect(world.goals).toEqual({})
    expect(Number.isFinite(Date.parse(world.forkling.lastTickAt))).toBe(true)
  })
  it('is the same every time, and bounded by what a world may have', () => {
    const at = Date.parse('2026-12-20T12:00:00Z')
    expect(JSON.stringify(loadFixtureWorld(10, pack, at).places)).toBe(JSON.stringify(loadFixtureWorld(10, pack, at).places))
    expect(loadFixtureWorld(500, pack).places).toHaveLength(64)
    expect(loadFixtureWorld(0, pack).places.length).toBeGreaterThanOrEqual(2)
  })
})
