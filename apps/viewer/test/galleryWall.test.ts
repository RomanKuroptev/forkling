import { describe, expect, it } from 'vitest'
import type { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { placeCentre, starterPlaces, toLandPlace } from '@forkling/sim'
import { exhibitSpots } from '../src/world/exhibitGeometry.ts'
import { GALLERY_PAGE_MS, galleryWalls, pageAt, tileAt, tilesOn, wallFaceLayout, wallInstances, type GalleryWork } from '../src/world/galleryWall.ts'
import { exteriorInstances, floorHeight, renderBudget, sceneInstances } from '../src/world/kitGeometry.ts'
import { instancesBox, placeObjects } from '../src/qa/sceneList.ts'
import type { Instance } from '../src/world/kitBase.ts'

const palette = kit.palettes[0]!
/** The Workshop as the fixtures have it: the gallery terminal in the back right corner, beside the back wall's right window. */
const workshop = (): Place => {
  const p = structuredClone(starterPlaces().find((x) => x.id === 'workshop')!)
  return p
}
/** `n` shelved works, made a day apart, newest first as the viewer keeps them; every other one has a thumbnail. */
const shelf = (n: number): GalleryWork[] =>
  Array.from({ length: n }, (_, i) => ({ id: `work-${String(n - i).padStart(3, '0')}`, title: `Work ${n - i}`, about: `What work ${n - i} is.`, made: new Date(Date.UTC(2026, 10, 1) + (n - i) * 86_400_000).toISOString(), thumb: i % 2 === 0 }))

const wallsOf = (place: Place, n: number, baseY = 0) => galleryWalls(place, kit, baseY, shelf(n), exteriorInstances(place, kit, baseY))

/** The glowing windows of a place, as boxes in the world. */
const windows = (place: Place, baseY: number) =>
  exteriorInstances(place, kit, baseY)
    .filter((i) => i.glow)
    .map((i) => instancesBox([i])!)
    .filter((b) => b.max[1] - b.min[1] > 0.5)

const overlap = (a: { min: number[]; max: number[] }, b: { min: number[]; max: number[] }) => [0, 1, 2].every((k) => a.min[k]! < b.max[k]! && b.min[k]! < a.max[k]!)

describe('the gallery wall: every finished work hangs on a board over the gallery terminal (spec 7.2, issues 291, 307)', () => {
  it('holds every shelved work, newest first, on the terminal that carries the gallery', () => {
    const walls = wallsOf(workshop(), 75)
    expect(walls).toHaveLength(1)
    expect(walls[0]!.exhibit.kind).toBe('gallery')
    expect(walls[0]!.works.map((w) => w.id)).toEqual(shelf(75).map((w) => w.id))
  })

  it('stays clear of every window, under the ceiling line, above the terminal and inside the walls', () => {
    for (const n of [1, 3, 4, 29, 75, 300]) {
      for (const baseY of [0, 2.5]) {
        const place = workshop()
        const wall = wallsOf(place, n, baseY)[0]!
        const board = instancesBox(wallInstances(wall, palette.colors))!
        for (const w of windows(place, baseY)) expect(overlap(board, w), `${n} works: the board covers a window`).toBe(false)
        // The ceiling line is the accent band along the top of the walls (0.25 m), and the board keeps a gap under it.
        expect(board.max[1], `${n} works`).toBeLessThanOrEqual(baseY + floorHeight(place) - 0.25 - 0.1 + 1e-6)
        const terminal = exhibitSpots(place, kit, baseY).find((s) => s.exhibit.kind === 'gallery')!
        expect(board.min[1]).toBeGreaterThan(terminal.position[1])
        const [px, pz] = placeCentre(toLandPlace(place))
        const [fw, fd] = place.exterior.footprint
        expect(board.min[0]).toBeGreaterThanOrEqual(px - fw / 2 + 0.6 - 1e-6)
        expect(board.max[0]).toBeLessThanOrEqual(px + fw / 2 - 0.6 + 1e-6)
        expect(board.min[2]).toBeGreaterThanOrEqual(pz - fd / 2 + 0.6 - 1e-6)
        expect(board.max[2]).toBeLessThanOrEqual(pz + fd / 2 - 0.6 + 1e-6)
      }
    }
  })

  it('moves aside when its terminal stands under a window, and still clears it', () => {
    const place = workshop()
    const index = Number(place.exhibits.find((e) => e.kind === 'gallery')!.slot.split('/')[1])
    const room = place.rooms[0]!
    // Under the back wall's right window (it is centred 2.8 m right of the middle of the building).
    room.parts[index] = { ...room.parts[index]!, at: [2.8 - room.at[0], 0, room.parts[index]!.at[2]] }
    const wall = wallsOf(place, 29)[0]!
    const board = instancesBox(wallInstances(wall, palette.colors))!
    for (const w of windows(place, 0)) expect(overlap(board, w)).toBe(false)
    expect(wall.slots.length).toBeGreaterThan(0)
  })

  it('hangs on the wall behind the terminal, not in the middle of the room', () => {
    const place = workshop()
    const wall = wallsOf(place, 29)[0]!
    const [, pz] = placeCentre(toLandPlace(place))
    const back = pz - place.exterior.footprint[1] / 2 + 0.6
    expect(wall.board.position[2] - back).toBeGreaterThan(0)
    expect(wall.board.position[2] - back).toBeLessThan(0.1)
  })

  it('is a few big tiles, not many small ones: at most six a page, each picture as big as a screen', () => {
    for (const n of [4, 29, 75]) {
      const wall = wallsOf(workshop(), n)[0]!
      expect(wall.slots.length).toBeGreaterThanOrEqual(2)
      expect(wall.slots.length).toBeLessThanOrEqual(6)
      for (const s of wall.slots) expect(s.picture[0]).toBeGreaterThanOrEqual(0.6)
    }
    const one = wallsOf(workshop(), 1)[0]!
    expect(one.slots).toHaveLength(1)
  })

  it('turns its pages in time, so every work comes up, each on exactly one page', () => {
    for (const n of [5, 29, 75]) {
      const wall = wallsOf(workshop(), n)[0]!
      expect(wall.pages).toBe(Math.ceil(n / wall.slots.length))
      const seen: string[] = []
      for (let p = 0; p < wall.pages; p++) seen.push(...tilesOn(wall, p).map((t) => t.work.id))
      expect(seen).toEqual(wall.works.map((w) => w.id))
      const pages = new Set(Array.from({ length: wall.pages }, (_, k) => pageAt(wall, 1_800_000_000_000 + k * GALLERY_PAGE_MS)))
      expect(pages.size).toBe(wall.pages)
    }
    // The same moment shows the same page in every window.
    const wall = wallsOf(workshop(), 29)[0]!
    expect(pageAt(wall, 1_800_000_123_456)).toBe(pageAt(wall, 1_800_000_123_456))
  })

  it('finds the work under a point on the page shown now, and nothing off the tiles', () => {
    const wall = wallsOf(workshop(), 29)[0]!
    for (const page of [0, 2, wall.pages - 1]) {
      for (const t of tilesOn(wall, page)) expect(tileAt(wall, page, t.slot.position)?.id).toBe(t.work.id)
    }
    const far = wall.slots[0]!.position
    expect(tileAt(wall, 0, [far[0], far[1] + 5, far[2]])).toBeNull()
  })

  it('lays every tile of a page out on its face: the picture or title above a caption, inside the board, apart', () => {
    const wall = wallsOf(workshop(), 29)[0]!
    const face = wallFaceLayout(wall, 512)
    expect(face.width).toBeGreaterThan(0)
    expect(face.tiles).toHaveLength(wall.slots.length)
    for (const t of face.tiles) {
      for (const r of [t.picture, t.caption]) {
        expect(r.x).toBeGreaterThanOrEqual(0)
        expect(r.y).toBeGreaterThanOrEqual(0)
        expect(r.x + r.w).toBeLessThanOrEqual(face.width)
        expect(r.y + r.h).toBeLessThanOrEqual(face.height)
      }
      expect(t.caption.y).toBeGreaterThanOrEqual(t.picture.y + t.picture.h)
    }
    expect(face.strip.y + face.strip.h).toBeLessThanOrEqual(face.height)
  })

  it('has no wall with nothing on the shelf, and none in a place with no gallery', () => {
    expect(wallsOf(workshop(), 0)).toEqual([])
    const home = starterPlaces().find((p) => p.id === 'home')!
    expect(home.exhibits.some((e) => e.kind === 'gallery')).toBe(false)
    expect(wallsOf(home, 10)).toEqual([])
  })

  it('draws a board that glows in the place glow colour behind the face', () => {
    const shapes: Instance[] = wallInstances(wallsOf(workshop(), 12)[0]!, palette.colors)
    expect(shapes).toHaveLength(1)
    expect(shapes[0]).toMatchObject({ color: palette.colors.glow, glow: true })
  })
})

describe('the gallery wall in the drawing and the scene list', () => {
  it('is one more box while the inside is loaded and costs no draw call of its own in the instanced shapes', () => {
    const places = starterPlaces()
    const flat = () => 0
    const without = sceneInstances(places, kit, { heightAt: flat, interiors: new Set(['workshop']) })
    const withShelf = sceneInstances(places, kit, { heightAt: flat, interiors: new Set(['workshop']), shelf: shelf(75) })
    expect(withShelf.box.count - without.box.count).toBe(1)
    expect(renderBudget(withShelf).drawCalls).toBe(renderBudget(without).drawCalls)
    const outside = sceneInstances(places, kit, { heightAt: flat, interiors: new Set(), shelf: shelf(30) })
    expect(outside.box.count).toBe(sceneInstances(places, kit, { heightAt: flat, interiors: new Set() }).box.count)
  })

  it('lists every shelved work on the wall as a work with its ref, its tile and what it shows, so the harness sees each one', () => {
    const shows = new Map([['workshop/all-works/work-030', 'picture' as const]])
    const list = placeObjects({ places: starterPlaces(), kit, heightAt: () => 0, interiors: new Set(['workshop']), nowMs: 0, plots: [], shelf: shelf(30), gallery: shows })
    const works = list.filter((o) => o.kind === 'work' && o.slot === 'gallery-wall')
    expect(works).toHaveLength(30)
    for (const w of shelf(30)) {
      const entry = works.find((o) => o.ref === `works/${w.id}`)
      expect(entry, w.id).toBeDefined()
      expect(entry).toMatchObject({ place: 'workshop', exhibitKind: 'gallery', name: w.title, visible: true })
      expect(entry!.box).not.toBeNull()
    }
    expect(works.find((o) => o.ref === 'works/work-030')!.shows).toBe('picture')
    expect(works.find((o) => o.ref === 'works/work-029')!.shows).toBe('nothing')
    expect(new Set(list.map((o) => o.id)).size).toBe(list.length)
    // A tile is told apart from a work on its slot: only exhibits carry the slot address a work's `installedIn` names.
    for (const t of works) expect(t.at).toBeUndefined()
    const workshopFile = starterPlaces().find((p) => p.id === 'workshop')!
    for (const e of workshopFile.exhibits) expect(list.find((o) => o.id === `workshop/${e.id}`)?.at).toBe(`workshop/${e.slot}`)
  })
})
