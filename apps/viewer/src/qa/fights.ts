import { placeCentre, surfaceFights, toLandPlace, type DrawnBox } from '@forkling/sim'
import { buildingModel } from '../world/building.ts'
import { exhibitInstances, exhibitSpots, signSpot } from '../world/exhibitGeometry.ts'
import { signFaceInstance } from '../world/signGeometry.ts'
import { galleryWalls, wallInstances } from '../world/galleryWall.ts'
import { exteriorInstances, interiorParts, partInstances, type Instance } from '../world/kitGeometry.ts'
import { wireframeInstances } from '../world/wireframe.ts'
import type { PlacesSnapshot } from './sceneList.ts'

type Vec3 = [number, number, number]

/** Two drawn surfaces of a place that fight (z-fighting), as `window.__qa.fights()` lists them. */
export interface QaFight {
  place: string
  /** What the two shapes are: a slot of the building model, a floor, a room's part, an exhibit or the gallery wall. */
  a: string
  b: string
  /** The square meters both faces cover. */
  area: number
  at: Vec3
  normal: Vec3
}

type Snapshot = Pick<PlacesSnapshot, 'places' | 'kit' | 'heightAt' | 'nowMs' | 'wireAlways' | 'shelf'>

/** A drawn box of a place, with what it is: the building's slot, a floor, a room's part (and its kit id), an exhibit. */
type PlaceBox = DrawnBox & { what: string; part?: string; building?: boolean }

/**
 * The sign of a place: its post's boxes (one group, left to the kit's maker) and the painted face in front of them, which `Signs.tsx`
 * draws as a flat quad lit by its own picture (issue 406: the face lay in the plane of the posts' fronts and shimmered).
 */
export function signFightBoxes(place: Snapshot['places'][number], kit: Snapshot['kit'], baseY: number): PlaceBox[] {
  const palette = kit.palettes.find((p) => p.id === place.exterior.palette) ?? kit.palettes[0]!
  const post = kit.parts.find((p) => p.id === 'sign-post')
  const out: PlaceBox[] = []
  for (const i of post ? partInstances(post, signSpot(place, baseY).position, 0, palette) : []) if (i.shape === 'box') out.push({ matrix: i.matrix, color: i.color, group: 'sign-post', what: 'the sign post' })
  const face = signFaceInstance(place, baseY)
  out.push({ matrix: face.matrix, color: face.color, glow: true, what: 'the sign board' })
  return out
}

/** Every drawn box of a place, outside and in, and the ground under it; null for a place drawn as cyan lines (being built). */
function placeBoxes(place: Snapshot['places'][number], s: Snapshot): { boxes: PlaceBox[]; baseY: number } | null {
  const [px, pz] = placeCentre(toLandPlace(place))
  const baseY = s.heightAt(px, pz)
  const wire = wireframeInstances(place, s.kit, baseY, s.nowMs, s.wireAlways)
  if (wire && wire.length > 0) return null
  const boxes: PlaceBox[] = []
  const push = (list: readonly Instance[], what: (i: Instance) => string, extra: (i: Instance) => { group?: string; part?: string; building?: boolean } = () => ({})) => {
    for (const i of list) {
      if (i.shape !== 'box') continue
      const e = extra(i)
      const g = e.group ?? i.group
      boxes.push({ matrix: i.matrix, color: i.color, ...(i.glow ? { glow: true } : {}), ...(g ? { group: g } : {}), ...(e.part ? { part: e.part } : {}), ...(e.building ? { building: true } : {}), what: what(i) })
    }
  }
  const palette = s.kit.palettes.find((p) => p.id === place.exterior.palette) ?? s.kit.palettes[0]!
  const model = buildingModel(place, s.kit, baseY)
  if (model) {
    for (const [slot, list] of Object.entries(model.slots)) push(list, () => `the ${slot} of the building`, () => ({ building: true }))
    boxes.push(...signFightBoxes(place, s.kit, baseY))
  } else {
    push(exteriorInstances(place, s.kit, baseY), () => 'the outside', () => ({ building: true }))
    boxes.push(...signFightBoxes(place, s.kit, baseY).filter((b) => b.what === 'the sign board'))
  }
  const partOf = (group: string) => place.rooms.find((r) => r.id === group.split('/')[0])?.parts[Number(group.split('/')[1])]?.part
  push(interiorParts(place, s.kit, baseY).instances, (i) => (i.group ? `part ${i.group} (${partOf(i.group) ?? 'part'})` : 'a floor'), (i) => {
    const part = i.group ? partOf(i.group) : undefined
    return part ? { part } : {}
  })
  for (const spot of exhibitSpots(place, s.kit, baseY)) {
    // An exhibit belongs with the part it stands on (`<room>/<part>/<slot>`).
    const group = spot.exhibit.slot.split('/').slice(0, 2).join('/')
    push(exhibitInstances(spot, palette.colors), () => `exhibit ${spot.exhibit.id}`, () => ({ group }))
  }
  if (s.shelf?.length) for (const wall of galleryWalls(place, s.kit, baseY, s.shelf, exteriorInstances(place, s.kit, baseY))) push(wallInstances(wall, palette.colors), () => 'the gallery wall')
  return { boxes, baseY }
}

/**
 * Every pair of box surfaces that fight in the places of a world, outside and in (every inside, whether the visitor is near or
 * not), worked out from the same geometry the drawing uses (docs/spec/audit/spec.md 7.2). One kit part's own primitives are left
 * to its maker, and so is an exhibit against the part it stands on; undersides lying on the ground under a place are never seen.
 */
export function placeFights(s: Snapshot): QaFight[] {
  const out: QaFight[] = []
  for (const place of s.places) {
    const drawn = placeBoxes(place, s)
    if (!drawn) continue
    const { boxes, baseY } = drawn
    for (const f of surfaceFights(boxes)) {
      // An underside lying on the ground under the place is never seen.
      if (f.normal[1] < -0.5 && f.at[1] <= baseY + 0.001) continue
      out.push({ place: place.id, a: boxes[f.a]!.what, b: boxes[f.b]!.what, area: f.area, at: f.at, normal: f.normal })
    }
  }
  return out
}

/** A door part of a room whose face lies just behind a face of the building, so the building covers it, as `__qa.coveredDoors()` lists them. */
export interface QaCoveredDoor {
  place: string
  /** The part as placed (`<room>/<index>`) and the building's piece in front of it. */
  door: string
  by: string
  /** How far behind the building's face the door's face lies (meters), and how much of it is covered (square meters). */
  gap: number
  area: number
  at: Vec3
}

/** A door face this close behind a face of the building is a door the place file put on the wall that the wall now hides. */
export const COVER_GAP = 0.05
/** Covered patches smaller than this (square meters) are the edges of a frame, not the door. */
const COVER_AREA = 0.05

/**
 * Doors covered by the building (issue 370's second try: moving a wall's face 1 cm out hid an upper floor's door): a face of a door
 * part that looks out of the building (not up or down) and lies at most `COVER_GAP` behind a face of the building looking the same
 * way, over at least `COVER_AREA`. A door the building stands in front of by more than that is inside the wall on purpose.
 */
export function coveredDoors(s: Snapshot): QaCoveredDoor[] {
  const out: QaCoveredDoor[] = []
  for (const place of s.places) {
    const drawn = placeBoxes(place, s)
    if (!drawn) continue
    const boxes = drawn.boxes.filter((b) => b.building || /^door/.test(b.part ?? ''))
    for (const f of surfaceFights(boxes, { gap: COVER_GAP, area: COVER_AREA })) {
      if (Math.abs(f.normal[1]) > 0.5) continue
      const front = boxes[f.front]!
      const back = boxes[f.front === f.a ? f.b : f.a]!
      if (!front.building || !back.part || f.gap < 1e-4) continue
      out.push({ place: place.id, door: back.what, by: front.what, gap: f.gap, area: f.area, at: f.at })
    }
  }
  return out
}
