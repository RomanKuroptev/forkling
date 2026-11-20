import { describe, expect, it } from 'vitest'
import { kit } from '@forkling/schema/kit'
import { starterPlaces } from '@forkling/sim'
import type { Place } from '@forkling/schema'
import * as THREE from 'three'
import { createWorldClock } from '../src/clock.ts'
import { QA_DEFAULT_NOW, qaParams } from '../src/qa/params.ts'
import { instancesBox, objectEntry, placeObjects } from '../src/qa/sceneList.ts'
import { compose } from '../src/world/matrix.ts'
import { outsideWall } from '../src/world/theme.ts'

const flat = () => 0
const NOW = Date.parse('2026-11-26T13:00:00Z')

describe('?qa=1 (the audit harness hooks)', () => {
  it('is off without qa=1, so normal mode installs nothing', () => {
    expect(qaParams('')).toBeNull()
    expect(qaParams('?world=local&now=2026-11-26T13:00:00Z&seed=3')).toBeNull()
    expect(qaParams('?qa=0')).toBeNull()
  })
  it('reads the frozen moment and the seed from the address', () => {
    expect(qaParams('?qa=1&now=2026-11-26T14:00:00%2B01:00&seed=7')).toEqual({ now: NOW, seed: 7 })
  })
  it('has a fixed moment and seed 1 when the address gives none or nonsense', () => {
    expect(qaParams('?qa=1')).toEqual({ now: QA_DEFAULT_NOW, seed: 1 })
    expect(qaParams('?qa=1&now=yesterday&seed=x')).toEqual({ now: QA_DEFAULT_NOW, seed: 1 })
  })
})

describe('the world clock under ?qa=1', () => {
  it('stands still at the address moment and moves only when the harness steps it', () => {
    const time = { elapsedMs: 0 }
    const clock = createWorldClock('Europe/Stockholm', '?qa=1&now=2026-11-26T13:00:00Z', time)
    expect(clock.now()).toBe(NOW)
    expect(clock.now()).toBe(NOW)
    time.elapsedMs = 1500
    expect(clock.now()).toBe(NOW + 1500)
    expect(clock.hour()).toBeCloseTo(14, 1)
    // The world is shown as it is at that moment, not as a stale copy, so Merge's face is its real face.
    expect(clock.synced).toBe(true)
  })
  it('is the real clock as before without qa=1', () => {
    const clock = createWorldClock('Europe/Stockholm', '', { elapsedMs: 99_999 })
    expect(clock.synced).toBe(true)
    expect(Math.abs(clock.now() - Date.now())).toBeLessThan(1000)
  })
})

describe('the scene list', () => {
  it('boxes a unit box instance by its matrix', () => {
    const box = instancesBox([{ shape: 'box', matrix: compose([1, 2, 3], [0, 0, 0], [2, 4, 6]), color: '#ffffff' }])
    expect(box).toEqual({ min: [0, 0, 0], max: [2, 4, 6] })
    expect(instancesBox([])).toBeNull()
  })

  it('lists every place, its rooms, its sign and its exhibits, with the works marked as works', () => {
    const places = starterPlaces()
    const workshop = places.find((p) => p.id === 'workshop')!
    const room = workshop.rooms[0]!
    const slotPart = room.parts.findIndex((pp) => (kit.parts.find((k) => k.id === pp.part)?.slots.length ?? 0) > 0)
    expect(slotPart).toBeGreaterThanOrEqual(0)
    workshop.exhibits = [{ id: 'a-work', kind: 'work', ref: 'works/a-work', slot: `${room.id}/${slotPart}/0`, label: 'A work', added: '2026-11-20' }]
    const list = placeObjects({ places, kit, heightAt: flat, interiors: new Set(['workshop']), nowMs: NOW, plots: [] })
    const ids = (kind: string) => list.filter((o) => o.kind === kind).map((o) => o.id)
    expect(ids('place').sort()).toEqual(places.map((p) => p.id).sort())
    expect(ids('room').sort()).toEqual(places.flatMap((p) => p.rooms.map((r) => `${p.id}/${r.id}`)).sort())
    expect(ids('sign').sort()).toEqual(places.map((p) => `${p.id}/sign`).sort())
    const work = list.find((o) => o.kind === 'work')!
    expect(work).toMatchObject({ id: 'workshop/a-work', place: 'workshop', ref: 'works/a-work', visible: true })
    expect(work.box).not.toBeNull()
    for (const o of list.filter((x) => x.kind === 'place')) {
      expect(o.box!.min[1]).toBeCloseTo(0, 1)
      expect(o.material).toBe('solid')
    }
  })

  it('says an exhibit is not drawn while its place has no inside loaded', () => {
    const places = starterPlaces()
    const home = places.find((p) => p.id === 'home')!
    const room = home.rooms[0]!
    const slotPart = room.parts.findIndex((pp) => (kit.parts.find((k) => k.id === pp.part)?.slots.length ?? 0) > 0)
    home.exhibits = [{ id: 'keep', kind: 'souvenir', ref: 'souvenirs/keep', slot: `${room.id}/${slotPart}/0`, label: 'Kept', added: '2026-11-20' }]
    const list = placeObjects({ places, kit, heightAt: flat, interiors: new Set(), nowMs: NOW, plots: [] })
    expect(list.find((o) => o.id === 'home/keep')).toMatchObject({ kind: 'exhibit', visible: false })
    expect(list.filter((o) => o.kind === 'room').every((o) => !o.visible)).toBe(true)
  })

  it('lists the colour each place\'s outside walls are drawn in, for the shade check (look.md rule 2)', () => {
    const places = starterPlaces()
    const list = placeObjects({ places, kit, heightAt: flat, interiors: new Set(), nowMs: NOW, plots: [] })
    // Home's timber walls are in its palette's wall; the Workshop's tin shack is chrome all round, a neutral, so it lists none.
    const home = places.find((p) => p.id === 'home')!
    expect(list.find((o) => o.id === 'home')!.outsideWall).toBe(outsideWall(kit.palettes.find((k) => k.id === home.exterior.palette)!.colors))
    expect(list.find((o) => o.id === 'workshop')!.outsideWall).toBeUndefined()
  })

  it('says what each exhibit card shows: the souvenir once read, the label before, the gallery with its count (issues 347, 355)', () => {
    const places = starterPlaces()
    const home = places.find((p) => p.id === 'home')!
    const room = home.rooms[0]!
    const shelf = room.parts.findIndex((pp) => kit.parts.find((k) => k.id === pp.part)?.slots[0]?.kind === 'shelf')
    expect(shelf).toBeGreaterThanOrEqual(0)
    home.exhibits = [
      { id: 'keep', kind: 'souvenir', ref: 'souvenirs/keep', slot: `${room.id}/${shelf}/0`, label: 'Kept, in my words', added: '2026-11-20' },
      { id: 'blank', kind: 'souvenir', ref: null, slot: `${room.id}/${shelf}/1`, label: ' ', added: '2026-11-20' },
    ]
    const before = placeObjects({ places, kit, heightAt: flat, interiors: new Set(['home']), nowMs: NOW, plots: [] })
    expect(before.find((o) => o.id === 'home/keep')!.card).toMatchObject({ shows: 'text', text: 'Kept · Kept, in my words' })
    expect(before.find((o) => o.id === 'home/blank')!.card!.shows).toBe('nothing')
    const souvenirs = new Map([['souvenirs/keep', { id: 'keep', why: 'w', topics: [], source: { url: 'https://en.wikipedia.org/wiki/Sand', title: 'Sand', fetchedAt: '2026-11-13T06:25:44.992Z' }, licence: null, placedIn: 'home', kind: 'quote' as const, content: 'Sand is granular.' }]])
    const after = placeObjects({ places, kit, heightAt: flat, interiors: new Set(['home']), nowMs: NOW, plots: [], souvenirs, workCount: 2 })
    expect(after.find((o) => o.id === 'home/keep')!.card).toEqual({ shows: 'text', text: 'Sand · “Sand is granular.”' })
    const gallery = after.find((o) => o.exhibitKind === 'gallery')
    if (gallery) expect(gallery.card!.text).toContain('2 works')
  })

  it('marks a place being built as wireframe, its rooms too, and puts the sign text in the list', () => {
    const places: Place[] = starterPlaces()
    places[0]!.state = { ...places[0]!.state, construction: { kind: 'found', finishesAt: '2026-11-27T13:00:00Z' } }
    places[0]!.exterior = { ...places[0]!.exterior, sign: 'Under way' }
    const list = placeObjects({ places, kit, heightAt: flat, interiors: new Set(), nowMs: NOW, plots: [] })
    expect(list.find((o) => o.id === places[0]!.id)!.material).toBe('wireframe')
    expect(list.find((o) => o.id === places[1]!.id)!.material).toBe('solid')
    // Being built, the sign says so and how long is left in place of its sign text (issue 331).
    expect(list.find((o) => o.id === `${places[0]!.id}/sign`)!.text).toBe(`${places[0]!.name} Building · ready in about 24 h`)
    expect(list.filter((o) => o.kind === 'room' && o.place === places[0]!.id).map((o) => o.material)).toEqual(places[0]!.rooms.map(() => 'wireframe'))
    expect(list.filter((o) => o.kind === 'room' && o.place === places[1]!.id).every((o) => o.material === 'solid')).toBe(true)
  })

  it('says what each work screen shows: its picture or its title as drawn, and nothing until it is drawn', () => {
    const places = starterPlaces()
    const workshop = places.find((p) => p.id === 'workshop')!
    const room = workshop.rooms[0]!
    const screens = room.parts.flatMap((pp, i) => (pp.part === 'screen-small' ? [i] : []))
    workshop.exhibits = [
      { id: 'a', kind: 'work', ref: 'works/a', slot: `${room.id}/${screens[0]}/0`, label: 'A', added: '2026-11-20' },
      { id: 'b', kind: 'work', ref: 'works/b', slot: `${room.id}/${screens[1]}/0`, label: 'B', added: '2026-11-20' },
    ]
    const screensDrawn = new Map([['workshop/a', 'picture' as const]])
    const list = placeObjects({ places, kit, heightAt: flat, interiors: new Set(['workshop']), nowMs: NOW, plots: [], screens: screensDrawn })
    expect(list.find((o) => o.id === 'workshop/a')).toMatchObject({ slot: 'screen', shows: 'picture' })
    expect(list.find((o) => o.id === 'workshop/b')).toMatchObject({ slot: 'screen', shows: 'nothing' })
  })

  it('boxes a drawn object (Merge, the visitor) from the three.js scene, with whether it is shown', () => {
    const group = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ wireframe: false }))
    mesh.position.set(5, 0.5, 5)
    group.add(mesh)
    group.updateMatrixWorld(true)
    const entry = objectEntry('merge', 'merge', group)
    expect(entry.box!.min[0]).toBeCloseTo(4.5)
    expect(entry.box!.max[1]).toBeCloseTo(1)
    expect(entry.visible).toBe(true)
    group.visible = false
    expect(objectEntry('merge', 'merge', group).visible).toBe(false)
  })

  it('lists a body with a see-through part as glass, and an opaque one as solid (issue 455)', () => {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()))
    expect(objectEntry('merge', 'merge', group).material).toBe('solid')
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.6 })))
    expect(objectEntry('merge', 'merge', group).material).toBe('glass')
  })
})
