import { describe, expect, it } from 'vitest'
import { stationFor } from '../src/stations.ts'

const spots = new Set(['home', 'workshop', 'desk', 'workbench', 'house-of-lights', 'shelf-low'])

describe('where each mind verb goes (spec 2.7: the engine decides where, the species pack decides the pose)', () => {
  it('has Merge read, write and reply at the desk at Home', () => {
    expect(stationFor('wander', 'lidar finds', spots)).toBe('desk')
    expect(stationFor('write', 'home', spots)).toBe('desk')
    expect(stationFor('reply', undefined, spots)).toBe('desk')
  })

  it('has it work at the bench in the Workshop for a tinker, whatever the idea', () => {
    expect(stationFor('tinker', 'a clock made of signals', spots)).toBe('workbench')
  })

  it('has it go to the place a tend or a revisit names', () => {
    expect(stationFor('tend', 'house-of-lights', spots)).toBe('house-of-lights')
    expect(stationFor('revisit', 'house-of-lights', spots)).toBe('house-of-lights')
  })

  it('has it go to the place an expand or a found names, until there is a construction site', () => {
    expect(stationFor('expand', 'house-of-lights', spots)).toBe('house-of-lights')
    expect(stationFor('found', 'a new place', spots)).toBe('home')
  })

  it('has it rest at Home', () => {
    expect(stationFor('rest', undefined, spots)).toBe('home')
  })

  it('falls back to Home when the place a step names is not there', () => {
    expect(stationFor('tend', 'nowhere', spots)).toBe('home')
    expect(stationFor('revisit', undefined, spots)).toBe('home')
  })

  it('falls back down the line when the usual place is missing: no desk means Home, no bench means the Workshop, then Home', () => {
    expect(stationFor('write', undefined, new Set(['home']))).toBe('home')
    expect(stationFor('tinker', undefined, new Set(['workshop', 'home']))).toBe('workshop')
    expect(stationFor('tinker', undefined, new Set(['home']))).toBe('home')
  })

  it('says nothing for a world that has none of these (the pet-era island), and for a verb that is not a mind verb', () => {
    expect(stationFor('wander', 'x', new Set(['perch', 'sunbeam']))).toBeUndefined()
    expect(stationFor('dance', 'house-of-lights', spots)).toBeUndefined()
  })

  it('knows no species: nothing here names a cat or any furniture of one', () => {
    for (const verb of ['wander', 'tend', 'revisit', 'expand', 'found', 'tinker', 'write', 'reply', 'rest']) {
      expect(stationFor(verb, undefined, spots) ?? 'none').not.toMatch(/cat|bed/)
    }
  })
})
