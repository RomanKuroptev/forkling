import { describe, expect, it } from 'vitest'
import { makeFixtureWorld } from '../src/fixture-world.ts'
import { doorOf } from '../src/paths.ts'
import { toLandPlace, placeCentre } from '../src/land.ts'
import { NOTE_DISCLOSURE, noteFate, noteSpot, placeAt } from '../src/note-spot.ts'

const places = makeFixtureWorld(1, 5).places
const lands = places.map(toLandPlace)
const home = places.find((p) => p.id === 'home')!
const note = (over: Record<string, unknown> = {}) => ({ id: 'n-2026-11-16-aaaaaa', placeId: 'home', position: null as [number, number] | null, ...over })

describe('where a paper note lies (spec 10.1: at the spot where it was written, at Home\'s mailbox if written on /notes/)', () => {
  it('lies where the visitor stood, when the note says so', () => {
    expect(noteSpot(note({ position: [12.5, -3.25] }), places)).toEqual([12.5, -3.25])
  })

  it('a note with no spot lies by the door of its place, in front of the front wall, never inside the building', () => {
    for (const place of places) {
      const [dx, dz] = doorOf(toLandPlace(place))
      const [x, z] = noteSpot(note({ placeId: place.id }), places)
      expect(Math.abs(x - dx)).toBeLessThanOrEqual(1.6)
      expect(z).toBeGreaterThanOrEqual(dz + 0.8)
      expect(z).toBeLessThanOrEqual(dz + 2.6)
    }
  })

  it('a note written on the notes page (at Home) lies by Home\'s door, and so does a note for a place that does not exist', () => {
    const [dx, dz] = doorOf(toLandPlace(home))
    for (const placeId of ['home', 'nowhere']) {
      const [x, z] = noteSpot(note({ placeId }), places)
      expect(Math.abs(x - dx)).toBeLessThanOrEqual(1.6)
      expect(z).toBeGreaterThanOrEqual(dz + 0.8)
    }
  })

  it('is the same every time for the same note, and different notes at the same door do not lie on top of each other', () => {
    const a = noteSpot(note({ id: 'n-2026-11-16-aaaaaa' }), places)
    expect(noteSpot(note({ id: 'n-2026-11-16-aaaaaa' }), places)).toEqual(a)
    const spots = Array.from({ length: 12 }, (_, i) => noteSpot(note({ id: `n-2026-11-16-${String(i).padStart(6, '0')}` }), places))
    const distinct = new Set(spots.map((s) => `${s[0].toFixed(2)},${s[1].toFixed(2)}`))
    expect(distinct.size).toBeGreaterThanOrEqual(9)
  })

  it('has somewhere to lie even in a world with no places, and with no Home', () => {
    expect(noteSpot(note(), [])).toEqual([0, 0])
    const [x, z] = noteSpot(note({ placeId: 'nowhere' }), places.filter((p) => p.id !== 'home'))
    expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true)
  })

  it('does not trust a position that is not a pair of finite numbers', () => {
    for (const position of [[Number.NaN, 1], [1, Number.POSITIVE_INFINITY], [1], null]) {
      const [x, z] = noteSpot(note({ position }), places)
      expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true)
    }
  })
})

describe('placeAt: which place a visitor stands in', () => {
  it('is the place whose footprint holds the point', () => {
    for (const place of places) {
      const [cx, cz] = placeCentre(toLandPlace(place))
      expect(placeAt([cx, cz], places)?.id).toBe(place.id)
    }
  })

  it('is the nearest place by its middle when the visitor is out on the land', () => {
    const [cx, cz] = placeCentre(toLandPlace(home))
    expect(placeAt([cx + 200, cz], places)).toBeTruthy()
    const [nx, nz] = placeCentre(lands[0]!)
    expect(placeAt([nx + 1.5, nz + 40], [places[0]!])?.id).toBe(places[0]!.id)
  })

  it('is null when there are no places', () => {
    expect(placeAt([0, 0], [])).toBeNull()
  })
})

describe('noteFate: what became of a note, in words both the site and the viewer use', () => {
  const base = { id: 'n-1', status: 'new', reply: null, declineReason: null, foundAt: null }
  it('says each of the five, with the date it was found where that matters', () => {
    expect(noteFate(base, '')).toEqual({ lead: 'Not found yet.', detail: null })
    expect(noteFate({ ...base, status: 'found', foundAt: 'x' }, '2026-11-16')).toEqual({ lead: 'Found by Merge on 2026-11-16. Not answered yet.', detail: null })
    expect(noteFate({ ...base, status: 'replied', reply: 'I do.' }, '2026-11-16')).toEqual({ lead: 'Merge replied:', detail: 'I do.' })
    expect(noteFate({ ...base, status: 'kept' }, '2026-11-16')).toEqual({ lead: 'Merge kept this note.', detail: null })
    expect(noteFate({ ...base, status: 'declined', declineReason: 'Not today.' }, '2026-11-16')).toEqual({ lead: 'Merge declined this note:', detail: 'Not today.' })
  })
})

describe('the disclosure a visitor reads before sending a note (spec 10.1)', () => {
  it('says what the spec says, once, for the site and the viewer alike', () => {
    expect(NOTE_DISCLOSURE).toHaveLength(4)
    const all = NOTE_DISCLOSURE.join(' ')
    expect(all).toMatch(/public/i)
    expect(all).toMatch(/permanently in a public repository, even if it is later hidden/i)
    expect(all).toMatch(/can be shared as a picture/i)
    expect(all).toMatch(/read by an AI/i)
    expect(all).toMatch(/3 notes a day/)
    expect(all).toMatch(/Links, email addresses and phone numbers are taken out/)
  })
})
