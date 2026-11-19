import { describe, expect, it } from 'vitest'
import type { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { starterPlaces } from '@forkling/sim'
import { exhibitSpots } from '../src/world/exhibitGeometry.ts'
import { SCREEN_FACE, screenFaces } from '../src/world/screenFaces.ts'
import { LOCAL_REF } from '../src/world/localWorld.ts'
import { worldFileUrl } from '../src/world/worldData.ts'

/** The starter Workshop with a work on each of two screens, a souvenir on a shelf and the gallery on the terminal. */
function workshop(): Place {
  const place = starterPlaces().find((p) => p.id === 'workshop')!
  const room = place.rooms[0]!
  const screens = room.parts.flatMap((pp, i) => (pp.part === 'screen-small' || pp.part === 'screen-large' ? [i] : []))
  const shelf = room.parts.findIndex((pp) => kit.parts.find((k) => k.id === pp.part)?.slots[0]?.kind === 'shelf')
  expect(screens.length).toBeGreaterThanOrEqual(2)
  expect(shelf).toBeGreaterThanOrEqual(0)
  place.exhibits = [
    { id: 'screen-with-thumb', kind: 'work', ref: 'works/with-thumb', slot: `${room.id}/${screens[0]}/0`, label: 'With Thumb: a work that has its picture', added: '2026-11-20' },
    { id: 'screen-no-thumb', kind: 'work', ref: 'works/no-thumb', slot: `${room.id}/${screens[1]}/0`, label: 'No Thumb: a work with no picture yet', added: '2026-11-20' },
    { id: 'a-keepsake', kind: 'souvenir', ref: 'souvenirs/x', slot: `${room.id}/${shelf}/0`, label: 'A keepsake', added: '2026-11-20' },
  ]
  return place
}

describe('what a screen in a place shows (look.md: a screen shows the work installed on it)', () => {
  it('gives every work on a screen a face: its picture when it has one, else its title', () => {
    const place = workshop()
    const faces = screenFaces([place], kit, () => 0, new Set(['with-thumb']))
    expect(faces.map((f) => f.exhibitId).sort()).toEqual(['screen-no-thumb', 'screen-with-thumb'])
    const pic = faces.find((f) => f.exhibitId === 'screen-with-thumb')!
    expect(pic.picture).toBe('works/with-thumb/thumb.png')
    const words = faces.find((f) => f.exhibitId === 'screen-no-thumb')!
    expect(words.picture).toBeNull()
    expect(words.title).toBe('No Thumb')
    expect(pic.key).toBe('workshop/screen-with-thumb')
  })

  it('puts the face on the glass of the screen, just in front of it, facing where the screen faces', () => {
    const place = workshop()
    const spot = exhibitSpots(place, kit, 2).find((s) => s.exhibit.id === 'screen-with-thumb')!
    const face = screenFaces([place], kit, () => 2, new Set(['with-thumb'])).find((f) => f.exhibitId === 'screen-with-thumb')!
    expect(face.rotY).toBeCloseTo(spot.rotY, 5)
    expect(face.position[1]).toBeCloseTo(spot.position[1], 5)
    // A little out from the slot along the screen's front (+z of its part, turned by rotY).
    const dx = face.position[0] - spot.position[0]
    const dz = face.position[2] - spot.position[2]
    expect(Math.hypot(dx, dz)).toBeGreaterThan(0.01)
    expect(Math.hypot(dx, dz)).toBeLessThan(0.05)
    expect(dx * Math.sin(spot.rotY) + dz * Math.cos(spot.rotY)).toBeGreaterThan(0)
    expect(face.size[0]).toBeGreaterThan(0.6)
    expect(face.size[1]).toBeGreaterThan(0.35)
    expect(SCREEN_FACE.w).toBe(face.size[0])
  })

  it('shows a done project by its name, and leaves a souvenir on a shelf alone', () => {
    const place = workshop()
    place.exhibits[1] = { ...place.exhibits[1]!, kind: 'project', ref: 'projects/tide-clock', label: 'A clock that reads the tide' }
    const faces = screenFaces([place], kit, () => 0, new Set())
    expect(faces.find((f) => f.exhibitId === 'screen-no-thumb')).toMatchObject({ picture: null, title: 'A clock that reads the tide' })
    expect(faces.find((f) => f.exhibitId === 'a-keepsake')).toBeUndefined()
  })

  it('never takes a picture path from a ref that climbs out of works/', () => {
    const place = workshop()
    place.exhibits[0] = { ...place.exhibits[0]!, ref: 'works/../brain/budget' }
    const faces = screenFaces([place], kit, () => 0, new Set(['../brain/budget']))
    expect(faces.find((f) => f.exhibitId === 'screen-with-thumb')!.picture).toBeNull()
  })
})

describe('where a screen loads its picture from', () => {
  it('is the file at the commit on GitHub, the local world folder, or nothing for a made-up world', () => {
    const path = 'works/a-door/thumb.png'
    expect(worldFileUrl({ ref: { owner: 'RomanKuroptev', repo: 'merge' }, sha: 'abc' }, path, null)).toBe('https://raw.githubusercontent.com/RomanKuroptev/merge/abc/works/a-door/thumb.png')
    expect(worldFileUrl({ ref: LOCAL_REF, sha: 'local' }, path, 'http://127.0.0.1:5173/world/')).toBe('http://127.0.0.1:5173/world/works/a-door/thumb.png')
    expect(worldFileUrl({ ref: LOCAL_REF, sha: 'fixture' }, path, null)).toBeNull()
    expect(worldFileUrl({ ref: { owner: 'a', repo: 'b' }, sha: 'abc' }, '../x.png', null)).toBeNull()
  })
})
