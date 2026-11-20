import type { Kit, Place, PlaceRequest, SlotKind, Souvenir } from '@forkling/schema'
import { placeCentre, toLandPlace } from '@forkling/sim'
import * as THREE from 'three'
import { buildingModel } from '../world/building.ts'
import { SIGN_H, SIGN_W, exhibitInstances, exhibitSpots, signSpot, type ExhibitSpot } from '../world/exhibitGeometry.ts'
import { galleryWalls, slotOf, type GalleryWork } from '../world/galleryWall.ts'
import { cardContent, cardPose, cardShows, cardView, wireCard, type CardPose, type CardShows } from '../world/exhibitCards.ts'
import { exteriorInstances, floorHeight, signPostInstances, siteInside, type Instance } from '../world/kitGeometry.ts'
import { doorwayBox, partInDoorway, placedPartBox } from '../world/doorway.ts'
import { compose } from '../world/matrix.ts'
import { plotInstances } from '../world/plotGeometry.ts'
import { SIGN_CELL, signBoards } from '../world/signGeometry.ts'
import { COLORS } from '../world/theme.ts'
import { wireframeInstances } from '../world/wireframe.ts'
import { plantBoards, type QaPlant } from './plant.ts'
import { partsInAir, screenStands, settledPlace } from '../world/insideWalls.ts'

/**
 * What `window.__qa.scene()` lists (docs/spec/audit/spec.md 7.1): every place, its doorway, room, drawn part, exhibit, sign, label and plot, Merge and
 * the visitor, and the pieces in front of a building (columns), each with an id, a kind, a box in world meters and whether it is drawn. Places are drawn as a few instanced
 * meshes, so their entries come from the same geometry functions the drawing uses; Merge and the visitor come from their
 * three.js objects.
 */
export interface QaBox {
  min: [number, number, number]
  max: [number, number, number]
}

/**
 * `part` is a piece of a room's furniture as drawn (id `<place>/<room>/<part index>`, name the kit part); `door` is a place's doorway,
 * which must stay clear. `column`: one solid piece a building stands in front of its front (its hero: porch columns, an arch, a screen),
 * for the check that nothing hides a sign.
 */
export type QaKind = 'place' | 'room' | 'part' | 'door' | 'work' | 'exhibit' | 'sign' | 'label' | 'plot' | 'merge' | 'visitor' | 'column'

export interface QaObject {
  id: string
  kind: QaKind
  /** The place it belongs to, for rooms, exhibits, signs and labels. */
  place?: string
  /** The file an exhibit shows (`works/<id>` and so on). */
  ref?: string | null
  /** The exhibit's kind in the place file. */
  exhibitKind?: string
  /** The kind of slot an exhibit stands in (`screen`, `frame`, `shelf`, ...), or `gallery-wall` for a tile on the gallery wall. */
  slot?: SlotKind | 'gallery-wall'
  /** Where an exhibit stands, as a work's `installedIn` names it: `<place>/<room>/<part index>/<slot index>`. A gallery wall tile has none. */
  at?: string
  /** For a work or project on a screen or a gallery wall tile: what it shows as drawn, its picture or its title, or nothing (a plain lit panel). */
  shows?: ScreenShows
  /**
   * What an exhibit's card shows (issues 347, 355): a picture, its words, its title, or nothing, and the words on it. Every exhibit
   * but a work screen has one. The souvenir files are read as the insides load, so before that a card shows the exhibit's label.
   */
  card?: { shows: CardShows; text: string }
  /**
   * For an exhibit with a card: what a visitor standing in front of it sees of the card (`cardView`), in the frame of the part it
   * stands on: the visitor's eyes, points of the card's face and the boxes of the part's pieces (`world.card-covered`, issue 453).
   */
  view?: { eyes: [number, number, number][]; face: [number, number, number][]; boards: QaBox[] }
  /**
   * For a part that stands in a doorway and so is not drawn (`doorway.ts`): the ids of the exhibits it holds, which are not drawn
   * either. Listed so that nothing is hidden silently (`world.in-doorway-holds`).
   */
  inDoorway?: { holds: string[] }
  /** For a part drawn with a foot or stand that stands in mid-air: on no floor, no other part and no wall (`partsInAir`). */
  inAir?: true
  /** A place's or room's name, an exhibit's label. */
  name?: string
  /** For a place: its footprint on the ground, in world meters (its walls stand on the edge: the outer 0.8 m is wall). */
  footprint?: { x0: number; z0: number; x1: number; z1: number }
  /** For a place: its palette's wall colour, which the inside walls must read close to by day (`world.room-wall-colour`). */
  wall?: string
  /** For a place: the colour its outside walls are drawn in, which must keep colour enough to stay coloured in shade (`world.outside-wall-grey`). */
  outsideWall?: string
  /** The words painted on a sign or a title bar. */
  text?: string
  /**
   * For a sign: the boxes of the solid pieces drawn under its board that could hold it up (its posts), as drawn now. A sign with
   * none that stands on the ground and reaches the board floats (issue 427, `world.sign-unsupported`).
   */
  support?: QaBox[]
  /** For a place drawn as wire: every glowing line, its two ends in world meters, as drawn now (inside too when that is drawn; issue 330). */
  wire?: [[number, number, number], [number, number, number]][]
  /** The height of the smallest letters on a sign, in meters (for the readable-label check). */
  letter?: number
  box: QaBox | null
  /** Drawn now. An inside (rooms, exhibits) is drawn only near the visitor (spec 4.6). */
  visible: boolean
  material: 'solid' | 'wireframe' | 'glass' | 'none'
}

/** The corners of the unit shapes (a box, and the boxes around a sphere, cylinder and cone of size 1): all fit in -0.5..0.5. */
const UNIT_CORNERS: [number, number, number][] = [-0.5, 0.5].flatMap((x) => [-0.5, 0.5].flatMap((y) => [-0.5, 0.5].map((z) => [x, y, z] as [number, number, number])))

const round = (n: number) => Math.round(n * 1000) / 1000

/** The box around a list of instances, each a unit shape moved by its matrix. Null for none. */
export function instancesBox(instances: readonly Instance[]): QaBox | null {
  if (instances.length === 0) return null
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const { matrix: m } of instances) {
    for (const [x, y, z] of UNIT_CORNERS) {
      const p = [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!]
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, p[k]!)
        max[k] = Math.max(max[k]!, p[k]!)
      }
    }
  }
  return { min: min.map(round) as QaBox['min'], max: max.map(round) as QaBox['max'] }
}

export interface PlacesSnapshot {
  places: readonly Place[]
  kit: Kit
  heightAt: (x: number, z: number) => number
  /** The places whose insides are drawn now. */
  interiors: ReadonlySet<string>
  nowMs: number
  plots: readonly PlaceRequest[]
  wireAlways?: boolean
  plant?: QaPlant | null
  /** What each screen face shows once it is drawn (`WorkScreens`), by `<place>/<exhibit>`. */
  screens?: ReadonlyMap<string, ScreenShows>
  /** The finished works, newest first: each has a tile on the gallery wall. */
  shelf?: readonly GalleryWork[]
  /** What each gallery wall tile shows as painted (`GalleryWalls`), by `<place>/<exhibit>/<work>`. */
  gallery?: ReadonlyMap<string, ScreenShows>
  /** The souvenir files read so far, by an exhibit's ref, and how many works there are (the gallery's line). */
  souvenirs?: ReadonlyMap<string, Souvenir | null>
  workCount?: number
}

export type ScreenShows = 'picture' | 'title' | 'nothing'

/** The two ends of a wire line from its matrix (its long axis is its first column). */
const lineEnds = (m: readonly number[]): [[number, number, number], [number, number, number]] => [
  [round(m[12]! - m[0]! / 2), round(m[13]! - m[1]! / 2), round(m[14]! - m[2]! / 2)],
  [round(m[12]! + m[0]! / 2), round(m[13]! + m[1]! / 2), round(m[14]! + m[2]! / 2)],
]

/** Every place's entries, worked out the way `sceneInstances` draws them. */
export function placeObjects(s: PlacesSnapshot): QaObject[] {
  const out: QaObject[] = []
  const supports = new Map<string, QaBox[]>()
  const baseOf = (p: Place) => {
    const [x, z] = placeCentre(toLandPlace(p))
    return s.heightAt(x, z)
  }
  for (const raw of s.places) {
    // As drawn: rooms and furniture inside the walls (`insideWalls.ts`).
    const place = settledPlace(raw, s.kit)
    const stands = screenStands(raw, s.kit)
    const baseY = baseOf(place)
    const [px, pz] = placeCentre(toLandPlace(place))
    const inside = s.interiors.has(place.id)
    const wire = wireframeInstances(place, s.kit, baseY, s.nowMs, s.wireAlways, inside ? siteInside(place, s.kit, baseY) : [])
    // The building's box stands on its base: the sign's posts, which reach down a slope to the ground under them, are left out of it.
    const outside = exteriorInstances(place, s.kit, baseY)
    const wired = wire !== null && wire.length > 0
    // What holds the sign up, as drawn: the solid pieces of the outside (or, while it is wire, the sign post drawn solid) under its board.
    const [sx, , sz] = signSpot(place, baseY).position
    supports.set(place.id, (wired ? signPostInstances(place, s.kit, baseY, s.heightAt) : exteriorInstances(place, s.kit, baseY, s.heightAt)).map((i) => instancesBox([i])!).filter((b) => b.max[1] - b.min[1] > 0.5 && b.min[0] >= sx - SIGN_W / 2 - 0.3 && b.max[0] <= sx + SIGN_W / 2 + 0.3 && Math.abs((b.min[2] + b.max[2]) / 2 - sz) < 0.5))
    const colors = (s.kit.palettes.find((p) => p.id === place.exterior.palette) ?? s.kit.palettes[0])?.colors
    const wall = colors?.wall
    // The outside walls as drawn: the commonest colour of the building's body that is not chrome, marble, accent or glow.
    const counts = new Map<string, number>()
    for (const i of buildingModel(place, s.kit, baseY)?.slots.body ?? []) if (colors && ![colors.metal, colors.accent, colors.glow, COLORS.white, COLORS.metal].includes(i.color)) counts.set(i.color, (counts.get(i.color) ?? 0) + 1)
    const drawnWall = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
    const lines = wired ? { wire: wire.map((l) => lineEnds(l.matrix)) } : {}
    out.push({ id: place.id, kind: 'place', name: place.name, ...(wall ? { wall } : {}), ...(drawnWall && !wired ? { outsideWall: drawnWall } : {}), ...lines, footprint: { x0: round(px - place.exterior.footprint[0] / 2), z0: round(pz - place.exterior.footprint[1] / 2), x1: round(px + place.exterior.footprint[0] / 2), z1: round(pz + place.exterior.footprint[1] / 2) }, box: instancesBox(outside), visible: true, material: wired ? 'wireframe' : 'solid' })
    const height = floorHeight(place)
    const door = doorwayBox(place, baseY)
    out.push({ id: `${place.id}/door`, kind: 'door', place: place.id, box: { min: door.min.map(round) as QaBox['min'], max: door.max.map(round) as QaBox['max'] }, visible: true, material: 'none' })
    const inAir = partsInAir(raw, s.kit)
    for (const room of place.rooms) {
      const [w, d, h] = room.size
      const x = px + room.at[0]
      const z = pz + room.at[1]
      const y = baseY + room.floor * height
      out.push({ id: `${place.id}/${room.id}`, kind: 'room', place: place.id, name: room.name, box: { min: [round(x - w / 2), round(y), round(z - d / 2)], max: [round(x + w / 2), round(y + h), round(z + d / 2)] }, visible: inside, material: wired ? 'wireframe' : 'solid' })
      // Each part as `interiorParts` draws it; a part in the doorway is not drawn, and is listed as not drawn with what it holds.
      room.parts.forEach((placed, k) => {
        const box = placedPartBox(place, s.kit, room, placed, baseY)
        if (partInDoorway(place, s.kit, room, placed, baseY)) {
          const holds = place.exhibits.filter((e) => e.slot.startsWith(`${room.id}/${k}/`)).map((e) => e.id)
          out.push({ id: `${place.id}/${room.id}/${k}`, kind: 'part', place: place.id, name: placed.part, box: box ? { min: box.min.map(round) as QaBox['min'], max: box.max.map(round) as QaBox['max'] } : null, visible: false, material: 'none', inDoorway: { holds } })
          return
        }
        // A screen on its tall stand reaches down to its floor (`screenStands`).
        if (box && stands.has(`${room.id}/${k}`)) box.min[1] = y
        if (box) out.push({ id: `${place.id}/${room.id}/${k}`, kind: 'part', place: place.id, name: placed.part, ...(inAir.has(`${room.id}/${k}`) ? { inAir: true as const } : {}), box: { min: box.min.map(round) as QaBox['min'], max: box.max.map(round) as QaBox['max'] }, visible: inside, material: wired ? 'wireframe' : 'solid' })
      })
    }
    const palette = s.kit.palettes.find((p) => p.id === place.exterior.palette) ?? s.kit.palettes[0]!
    for (const spot of exhibitSpots(place, s.kit, baseY)) {
      const e = spot.exhibit
      const id = `${place.id}/${e.id}`
      const onScreen = spot.slotKind === 'screen' && (e.kind === 'work' || e.kind === 'project')
      // In a place being built its pieces are lines and its card is wire (issue 426), as `sceneInstances` and `ExhibitCards` draw them.
      const content = cardContent(e, spot.slotKind, e.ref ? s.souvenirs?.get(e.ref) : null, s.workCount ?? 0)
      const pose = cardPose(spot)
      const card = pose ? cardShows(wired ? wireCard(content) : content) : null
      // A card standing in or on its part (a shelf's board, a case's top) can have a board over it; one on a face (a frame, a plaque, a screen) cannot.
      const view = pose && (spot.slotKind === 'shelf' || spot.slotKind === 'case') ? viewOf(place, s.kit, spot, pose, baseY) : null
      out.push({ id, kind: e.kind === 'work' ? 'work' : 'exhibit', place: place.id, ref: e.ref, exhibitKind: e.kind, slot: spot.slotKind, at: `${place.id}/${e.slot}`, ...(onScreen ? { shows: s.screens?.get(id) ?? 'nothing' } : {}), ...(card ? { card } : {}), ...(view ? { view } : {}), name: e.label, box: instancesBox(exhibitInstances(spot, palette.colors)), visible: inside, material: wired ? 'wireframe' : 'solid' })
    }
    // Every finished work has a tile on the gallery wall, a page at a time: listed at its tile, as the drawing places it.
    if (s.shelf?.length) {
      for (const wall of galleryWalls(place, s.kit, baseY, s.shelf, outside)) {
        wall.works.forEach((work, k) => {
          const slot = slotOf(wall, k)
          const id = `${place.id}/${wall.exhibit.id}/${work.id}`
          out.push({ id, kind: 'work', place: place.id, ref: `works/${work.id}`, exhibitKind: 'gallery', slot: 'gallery-wall', shows: s.gallery?.get(id) ?? 'nothing', name: work.title, box: instancesBox([{ shape: 'box', matrix: compose(slot.position, [0, wall.rotY, 0], [slot.size[0], slot.size[1], 0.01]), color: COLORS.ink }]), visible: inside, material: 'solid' })
        })
      }
    }
    const model = buildingModel(place, s.kit, baseY)
    model?.slots.hero.forEach((piece, k) => out.push({ id: `${place.id}/column-${k}`, kind: 'column', place: place.id, box: instancesBox([piece]), visible: true, material: 'solid' }))
    const bar = model?.titleBar
    if (bar) {
      const [bx, by, bz] = bar.position
      out.push({ id: `${place.id}/title`, kind: 'label', place: place.id, text: bar.text, box: { min: [round(bx - bar.width / 2), round(by - bar.height / 2), round(bz)], max: [round(bx + bar.width / 2), round(by + bar.height / 2), round(bz)] }, visible: true, material: 'solid' })
    }
  }
  for (const board of plantBoards(signBoards(s.places, baseOf, s.kit, s.nowMs), s.plant ?? null)) {
    const [x, y, z] = board.position
    out.push({ id: `${board.id}/sign`, kind: 'sign', place: board.id, support: supports.get(board.id) ?? [], text: [...board.layout.name, ...board.layout.text].join(' '), letter: round((Math.min(...board.layout.ops.map((op) => op.px), SIGN_CELL.h) / SIGN_CELL.h) * SIGN_H), box: { min: [round(x - SIGN_W / 2), round(y - SIGN_H / 2), round(z)], max: [round(x + SIGN_W / 2), round(y + SIGN_H / 2), round(z)] }, visible: true, material: 'solid' })
  }
  for (const plot of s.plots) out.push({ id: `plot/${plot.id}`, kind: 'plot', name: plot.name, box: instancesBox(plotInstances(plot, s.heightAt)), visible: true, material: 'solid' })
  return out
}

/** An entry for a drawn three.js object: its box in the world and whether it and everything above it is shown. */
export function objectEntry(id: string, kind: QaKind, object: THREE.Object3D): QaObject {
  object.updateWorldMatrix(true, true)
  const b = new THREE.Box3().setFromObject(object)
  let visible = true
  for (let o: THREE.Object3D | null = object; o; o = o.parent) visible &&= o.visible
  let material: QaObject['material'] = 'none'
  object.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    if (!m || material === 'wireframe') return
    const list = Array.isArray(m) ? m : [m]
    if (list.some((x) => (x as THREE.MeshBasicMaterial).wireframe)) material = 'wireframe'
    // Blended, faded or not writing depth: what is behind it shows through (issue 455).
    else if (material === 'glass' || list.some((x) => x.transparent || x.opacity < 1 || !x.depthWrite)) material = 'glass'
    else material = 'solid'
  })
  const box: QaBox | null = b.isEmpty() ? null : { min: [round(b.min.x), round(b.min.y), round(b.min.z)], max: [round(b.max.x), round(b.max.y), round(b.max.z)] }
  return { id, kind, box, visible, material }
}

/** What a visitor sees of an exhibit's card (`cardView`), in the frame of the part it stands on; null when its slot is not found. */
function viewOf(place: Place, kit: Kit, spot: ExhibitSpot, pose: CardPose, baseY: number): QaObject['view'] | null {
  const m = /^([a-z0-9][a-z0-9-]*)\/(\d+)\/(\d+)$/.exec(spot.exhibit.slot)
  const room = m ? place.rooms.find((r) => r.id === m[1]) : undefined
  const part = kit.parts.find((p) => p.id === spot.part)
  const slot = part?.slots[Number(m?.[3])]
  if (!room || !part || !slot) return null
  // How high above its floor the part's foot is drawn.
  const foot = spot.partTop - part.size[1] - (baseY + room.floor * floorHeight(place))
  const v = cardView(pose, slot.at, part, foot)
  const r = (p: [number, number, number]) => p.map(round) as [number, number, number]
  return { eyes: v.eyes.map(r), face: v.face.map(r), boards: v.boards.map((b) => ({ min: r(b.min), max: r(b.max) })) }
}
