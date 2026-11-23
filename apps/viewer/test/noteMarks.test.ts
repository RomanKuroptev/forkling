import { describe, expect, it } from 'vitest'
import { Note } from '@forkling/schema'
import { placeCentre, starterPlaces, toLandPlace } from '@forkling/sim'
import { FLOOR_TOP } from '../src/world/kitBase.ts'
import { noteMarks } from '../src/world/noteMarks.ts'

const places = starterPlaces()
const home = places.find((p) => p.id === 'home')!
const [hx, hz] = placeCentre(toLandPlace(home))
const [fw, fd] = home.exterior.footprint
// A slope, so the ground under a note differs from the ground at Home's middle.
const heightAt = (x: number, z: number) => 0.05 * x + 0.03 * z
const note = (position: [number, number]) =>
  Note.parse({ id: 'n-2026-11-23-aaaaaa', name: 'Ann', message: 'Hello in there.', placeId: 'home', at: '2026-11-23T09:30:00Z', topics: [], status: 'new', position })

describe('a note left inside a house', () => {
  it('lies on the floor, not under it: at the floor top over the base at the middle of the place', () => {
    const at: [number, number] = [hx + fw / 4, hz - fd / 4]
    const [mark] = noteMarks([note(at)], places, heightAt)
    const floorTop = heightAt(hx, hz) + FLOOR_TOP
    expect(mark!.position[1]).toBeGreaterThanOrEqual(floorTop)
    expect(mark!.position[1] - floorTop).toBeLessThan(0.03)
    expect(mark!.position[0]).toBe(at[0])
    expect(mark!.position[2]).toBe(at[1])
  })

  it('outside any building still lies on the land', () => {
    const at: [number, number] = [hx + fw / 2 + 5, hz + fd / 2 + 5]
    const [mark] = noteMarks([note(at)], places, heightAt)
    expect(mark!.position[1]).toBeCloseTo(heightAt(at[0], at[1]) + 0.04, 3)
  })
})
