import { describe, expect, it } from 'vitest'
import type { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { placeCentre, starterPlaces, toLandPlace } from '@forkling/sim'
import { exhibitSpots } from '../src/world/exhibitGeometry.ts'
import { galleryWalls, tileAt, wallInstances, type GalleryWork } from '../src/world/galleryWall.ts'
import { sceneInstances } from '../src/world/kitGeometry.ts'
import { placeObjects } from '../src/qa/sceneList.ts'

const palette = kit.palettes[0]!
const workshop = (): Place => structuredClone(starterPlaces().find((p) => p.id === 'workshop')!)
/** `n` shelved works, made a day apart, newest first as the viewer keeps them. */
const shelf = (n: number): GalleryWork[] =>
  Array.from({ length: n }, (_, i) => ({ id: `work-${String(n - i).padStart(3, '0')}`, title: `Work ${n - i}`, about: `What work ${n - i} is.`, made: new Date(Date.UTC(2026, 10, 1) + (n - i) * 86_400_000).toISOString() }))

/** The room a wall stands in, as a box in the world. */
function roomBox(place: Place, baseY: number) {
  const [px, pz] = placeCentre(toLandPlace(place))
  const room = place.rooms[0]!
  return { x0: px + room.at[0] - room.size[0] / 2, x1: px + room.at[0] + room.size[0] / 2, z0: pz + room.at[1] - room.size[1] / 2, z1: pz + room.at[1] + room.size[1] / 2, y0: baseY, y1: baseY + room.size[2] }
}

describe('the gallery wall: every finished work hangs as a lit tile above the gallery terminal (spec 7.2, issue 291)', () => {
  it('hangs one tile for each shelved work, newest first, on the terminal of the gallery', () => {
    const place = workshop()
    const walls = galleryWalls(place, kit, 0, shelf(75))
    expect(walls).toHaveLength(1)
    const wall = walls[0]!
    expect(wall.exhibit.kind).toBe('gallery')
    expect(wall.tiles.map((t) => t.work.id)).toEqual(shelf(75).map((w) => w.id))
    expect(new Set(wall.tiles.map((t) => t.work.id)).size).toBe(75)
  })

  it('keeps every tile inside the room, above the terminal, big enough to see and apart from the others', () => {
    for (const n of [1, 5, 29, 75, 200]) {
      const place = workshop()
      const wall = galleryWalls(place, kit, 2, shelf(n))[0]!
      const box = roomBox(place, 2)
      const terminal = exhibitSpots(place, kit, 2).find((s) => s.exhibit.kind === 'gallery')!
      expect(wall.tiles, `${n} works`).toHaveLength(n)
      for (const t of wall.tiles) {
        const [x, y, z] = t.position
        expect(x).toBeGreaterThan(box.x0)
        expect(x).toBeLessThan(box.x1)
        expect(z).toBeGreaterThan(box.z0)
        expect(z).toBeLessThan(box.z1)
        expect(y - t.size[1] / 2).toBeGreaterThan(terminal.position[1])
        expect(y + t.size[1] / 2).toBeLessThan(box.y1)
        expect(Math.min(t.size[0], t.size[1])).toBeGreaterThanOrEqual(0.06)
      }
      for (let i = 0; i < wall.tiles.length; i++) {
        for (let j = i + 1; j < wall.tiles.length; j++) {
          const a = wall.tiles[i]!
          const b = wall.tiles[j]!
          const apart = Math.abs(a.position[1] - b.position[1]) >= (a.size[1] + b.size[1]) / 2 || Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]) >= (a.size[0] + b.size[0]) / 2
          expect(apart, `${a.work.id} and ${b.work.id}`).toBe(true)
        }
      }
    }
  })

  it('grows with the shelf: a few works get bigger tiles than many', () => {
    const few = galleryWalls(workshop(), kit, 0, shelf(4))[0]!
    const many = galleryWalls(workshop(), kit, 0, shelf(75))[0]!
    expect(few.tiles[0]!.size[0]).toBeGreaterThan(many.tiles[0]!.size[0])
    expect(few.board.size[1]).toBeLessThan(many.board.size[1])
  })

  it('turns with its terminal and stays in the room', () => {
    const place = workshop()
    const room = place.rooms[0]!
    const index = Number(place.exhibits.find((e) => e.kind === 'gallery')!.slot.split('/')[1])
    room.parts[index] = { ...room.parts[index]!, at: [0, 0, 0], rot: Math.PI / 2 }
    const wall = galleryWalls(place, kit, 0, shelf(40))[0]!
    const box = roomBox(place, 0)
    expect(wall.tiles).toHaveLength(40)
    for (const t of wall.tiles) {
      expect(t.position[0]).toBeGreaterThan(box.x0)
      expect(t.position[0]).toBeLessThan(box.x1)
      expect(t.rotY).toBeCloseTo(Math.PI / 2, 6)
    }
  })

  it('has no wall with nothing on the shelf, and none in a place with no gallery', () => {
    expect(galleryWalls(workshop(), kit, 0, [])).toEqual([])
    const home = starterPlaces().find((p) => p.id === 'home')!
    expect(home.exhibits.some((e) => e.kind === 'gallery')).toBe(false)
    expect(galleryWalls(home, kit, 0, shelf(10))).toEqual([])
  })

  it('draws a board and one lit tile per work', () => {
    const wall = galleryWalls(workshop(), kit, 0, shelf(12))[0]!
    const shapes = wallInstances(wall, palette.colors)
    expect(shapes).toHaveLength(13)
    expect(shapes.filter((s) => s.color === palette.colors.glow)).toHaveLength(12)
  })

  it('finds the tile under a point on the wall, and nothing off the tiles', () => {
    const wall = galleryWalls(workshop(), kit, 0, shelf(20))[0]!
    for (const t of [wall.tiles[0]!, wall.tiles[7]!, wall.tiles[19]!]) expect(tileAt(wall, t.position)?.work.id).toBe(t.work.id)
    const far = wall.tiles[0]!.position
    expect(tileAt(wall, [far[0], far[1] + 5, far[2]])).toBeNull()
  })
})

describe('the gallery wall in the drawing and the scene list', () => {
  it('is drawn only while the place has its inside loaded', () => {
    const places = starterPlaces()
    const flat = () => 0
    const without = sceneInstances(places, kit, { heightAt: flat, interiors: new Set(['workshop']) })
    const withShelf = sceneInstances(places, kit, { heightAt: flat, interiors: new Set(['workshop']), shelf: shelf(30) })
    expect(withShelf.box.count - without.box.count).toBe(31)
    const outside = sceneInstances(places, kit, { heightAt: flat, interiors: new Set(), shelf: shelf(30) })
    const outsideBare = sceneInstances(places, kit, { heightAt: flat, interiors: new Set() })
    expect(outside.box.count).toBe(outsideBare.box.count)
  })

  it('lists every shelved work on the wall as a work, with its ref, so the harness sees each one shown', () => {
    const list = placeObjects({ places: starterPlaces(), kit, heightAt: () => 0, interiors: new Set(['workshop']), nowMs: 0, plots: [], shelf: shelf(30) })
    const works = list.filter((o) => o.kind === 'work')
    for (const w of shelf(30)) {
      const entry = works.find((o) => o.ref === `works/${w.id}`)
      expect(entry, w.id).toBeDefined()
      expect(entry).toMatchObject({ place: 'workshop', name: w.title, visible: true })
      expect(entry!.box).not.toBeNull()
    }
    expect(new Set(works.map((o) => o.id)).size).toBe(works.length)
  })
})
