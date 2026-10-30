import { describe, expect, it } from 'vitest'
import { WorldObject } from '@forkling/schema'
import { isWalkable } from '../src/nav.ts'
import { starterWorld, worldWithObjects } from '../src/starter.ts'

const rock = WorldObject.parse({
  id: 'sunny-rock',
  kind: 'rock',
  name: 'The sunny rock',
  position: [2, 0, 20],
  scale: 1.5,
  model: { asset: 'nature/rock_largeA' },
  reason: 'Morning sun.',
})

describe('worldWithObjects', () => {
  it('returns the starter world unchanged when there are no objects', () => {
    expect(worldWithObjects([])).toBe(starterWorld())
  })

  it('blocks walking where an object stands and casts its shade', () => {
    expect(isWalkable(starterWorld().nav.grid, 2, 20)).toBe(true)
    const world = worldWithObjects([rock])
    expect(isWalkable(world.nav.grid, 2, 20)).toBe(false)
    expect(world.nav.casters.length).toBe(starterWorld().nav.casters.length + 1)
  })

  it('places objects on the terrain whatever y the file says', () => {
    const world = worldWithObjects([{ ...rock, position: [2, 50, 20] }])
    const placed = world.placements[world.placements.length - 1]!
    expect(placed.position[1]).toBeLessThan(10)
  })

  it('is deterministic, so every viewer and the mind share one nav grid', () => {
    expect(worldWithObjects([rock]).nav.grid.walkable).toEqual(worldWithObjects([rock]).nav.grid.walkable)
  })
})
