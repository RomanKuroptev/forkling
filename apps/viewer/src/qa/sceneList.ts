import type { Kit, Place, PlaceRequest } from '@forkling/schema'
import { placeCentre, toLandPlace } from '@forkling/sim'
import * as THREE from 'three'
import { buildingModel } from '../world/building.ts'
import { SIGN_H, SIGN_W, exhibitInstances, exhibitSpots } from '../world/exhibitGeometry.ts'
import { exteriorInstances, floorHeight, type Instance } from '../world/kitGeometry.ts'
import { plotInstances } from '../world/plotGeometry.ts'
import { SIGN_CELL, signBoards } from '../world/signGeometry.ts'
import { wireframeInstances } from '../world/wireframe.ts'
import { plantBoards, type QaPlant } from './plant.ts'

/**
 * What `window.__qa.scene()` lists (docs/spec/audit/spec.md 7.1): every place, room, exhibit, sign, label and plot, Merge and
 * the visitor, each with an id, a kind, a box in world meters and whether it is drawn. Places are drawn as a few instanced
 * meshes, so their entries come from the same geometry functions the drawing uses; Merge and the visitor come from their
 * three.js objects.
 */
export interface QaBox {
  min: [number, number, number]
  max: [number, number, number]
}

export type QaKind = 'place' | 'room' | 'work' | 'exhibit' | 'sign' | 'label' | 'plot' | 'merge' | 'visitor'

export interface QaObject {
  id: string
  kind: QaKind
  /** The place it belongs to, for rooms, exhibits, signs and labels. */
  place?: string
  /** The file an exhibit shows (`works/<id>` and so on). */
  ref?: string | null
  /** The exhibit's kind in the place file. */
  exhibitKind?: string
  /** A place's or room's name, an exhibit's label. */
  name?: string
  /** The words painted on a sign or a title bar. */
  text?: string
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
}

/** Every place's entries, worked out the way `sceneInstances` draws them. */
export function placeObjects(s: PlacesSnapshot): QaObject[] {
  const out: QaObject[] = []
  const baseOf = (p: Place) => {
    const [x, z] = placeCentre(toLandPlace(p))
    return s.heightAt(x, z)
  }
  for (const place of s.places) {
    const baseY = baseOf(place)
    const [px, pz] = placeCentre(toLandPlace(place))
    const wire = wireframeInstances(place, s.kit, baseY, s.nowMs, s.wireAlways)
    const outside = exteriorInstances(place, s.kit, baseY)
    out.push({ id: place.id, kind: 'place', name: place.name, box: instancesBox(outside), visible: true, material: wire && wire.length > 0 ? 'wireframe' : 'solid' })
    const inside = s.interiors.has(place.id)
    const height = floorHeight(place)
    for (const room of place.rooms) {
      const [w, d, h] = room.size
      const x = px + room.at[0]
      const z = pz + room.at[1]
      const y = baseY + room.floor * height
      out.push({ id: `${place.id}/${room.id}`, kind: 'room', place: place.id, name: room.name, box: { min: [round(x - w / 2), round(y), round(z - d / 2)], max: [round(x + w / 2), round(y + h), round(z + d / 2)] }, visible: inside, material: 'solid' })
    }
    const palette = s.kit.palettes.find((p) => p.id === place.exterior.palette) ?? s.kit.palettes[0]!
    for (const spot of exhibitSpots(place, s.kit, baseY)) {
      const e = spot.exhibit
      out.push({ id: `${place.id}/${e.id}`, kind: e.kind === 'work' ? 'work' : 'exhibit', place: place.id, ref: e.ref, exhibitKind: e.kind, name: e.label, box: instancesBox(exhibitInstances(spot, palette.colors)), visible: inside, material: 'solid' })
    }
    const bar = buildingModel(place, s.kit, baseY)?.titleBar
    if (bar) {
      const [bx, by, bz] = bar.position
      out.push({ id: `${place.id}/title`, kind: 'label', place: place.id, text: bar.text, box: { min: [round(bx - bar.width / 2), round(by - bar.height / 2), round(bz)], max: [round(bx + bar.width / 2), round(by + bar.height / 2), round(bz)] }, visible: true, material: 'solid' })
    }
  }
  for (const board of plantBoards(signBoards(s.places, baseOf, s.kit), s.plant ?? null)) {
    const [x, y, z] = board.position
    out.push({ id: `${board.id}/sign`, kind: 'sign', place: board.id, text: [...board.layout.name, ...board.layout.text].join(' '), letter: round((Math.min(...board.layout.ops.map((op) => op.px), SIGN_CELL.h) / SIGN_CELL.h) * SIGN_H), box: { min: [round(x - SIGN_W / 2), round(y - SIGN_H / 2), round(z)], max: [round(x + SIGN_W / 2), round(y + SIGN_H / 2), round(z)] }, visible: true, material: 'solid' })
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
    material = list.some((x) => (x as THREE.MeshBasicMaterial).wireframe) ? 'wireframe' : 'solid'
  })
  const box: QaBox | null = b.isEmpty() ? null : { min: [round(b.min.x), round(b.min.y), round(b.min.z)], max: [round(b.max.x), round(b.max.y), round(b.max.z)] }
  return { id, kind, box, visible, material }
}
