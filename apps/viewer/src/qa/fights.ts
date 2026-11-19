import { placeCentre, surfaceFights, toLandPlace, type DrawnBox } from '@forkling/sim'
import { buildingModel } from '../world/building.ts'
import { exhibitInstances, exhibitSpots, signSpot } from '../world/exhibitGeometry.ts'
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

/**
 * Every pair of box surfaces that fight in the places of a world, outside and in (every inside, whether the visitor is near or
 * not), worked out from the same geometry the drawing uses (docs/spec/audit/spec.md 7.2). One kit part's own primitives are left
 * to its maker, and so is an exhibit against the part it stands on; undersides lying on the ground under a place are never seen.
 */
export function placeFights(s: Pick<PlacesSnapshot, 'places' | 'kit' | 'heightAt' | 'nowMs' | 'wireAlways' | 'shelf'>): QaFight[] {
  const out: QaFight[] = []
  for (const place of s.places) {
    const [px, pz] = placeCentre(toLandPlace(place))
    const baseY = s.heightAt(px, pz)
    // A place being built is drawn as cyan lines, not surfaces.
    const wire = wireframeInstances(place, s.kit, baseY, s.nowMs, s.wireAlways)
    if (wire && wire.length > 0) continue
    const boxes: (DrawnBox & { what: string })[] = []
    const push = (list: readonly Instance[], what: (i: Instance, k: number) => string, group?: (i: Instance) => string | undefined) => {
      list.forEach((i, k) => {
        if (i.shape !== 'box') return
        const g = group?.(i) ?? i.group
        boxes.push({ matrix: i.matrix, color: i.color, ...(i.glow ? { glow: true } : {}), ...(g ? { group: g } : {}), what: what(i, k) })
      })
    }
    const model = buildingModel(place, s.kit, baseY)
    if (model) {
      for (const [slot, list] of Object.entries(model.slots)) push(list, () => `the ${slot} of the building`)
      const post = s.kit.parts.find((p) => p.id === 'sign-post')
      const palette = s.kit.palettes.find((p) => p.id === place.exterior.palette) ?? s.kit.palettes[0]!
      if (post) push(partInstances(post, signSpot(place, baseY).position, 0, palette), () => 'the sign post', () => 'sign-post')
    } else {
      push(exteriorInstances(place, s.kit, baseY), () => 'the outside')
    }
    const inside = interiorParts(place, s.kit, baseY)
    push(inside.instances, (i) => (i.group ? `part ${i.group} (${place.rooms.find((r) => r.id === i.group!.split('/')[0])?.parts[Number(i.group.split('/')[1])]?.part ?? 'part'})` : 'a floor'))
    const palette = s.kit.palettes.find((p) => p.id === place.exterior.palette) ?? s.kit.palettes[0]!
    for (const spot of exhibitSpots(place, s.kit, baseY)) {
      // An exhibit belongs with the part it stands on (`<room>/<part>/<slot>`).
      const group = spot.exhibit.slot.split('/').slice(0, 2).join('/')
      push(exhibitInstances(spot, palette.colors), () => `exhibit ${spot.exhibit.id}`, () => group)
    }
    if (s.shelf?.length) for (const wall of galleryWalls(place, s.kit, baseY, s.shelf, exteriorInstances(place, s.kit, baseY))) push(wallInstances(wall, palette.colors), () => 'the gallery wall')
    for (const f of surfaceFights(boxes)) {
      // An underside lying on the ground under the place is never seen.
      if (f.normal[1] < -0.5 && f.at[1] <= baseY + 0.001) continue
      out.push({ place: place.id, a: boxes[f.a]!.what, b: boxes[f.b]!.what, area: f.area, at: f.at, normal: f.normal })
    }
  }
  return out
}
