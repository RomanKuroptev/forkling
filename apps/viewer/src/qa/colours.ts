import { placeCentre, toLandPlace } from '@forkling/sim'
import { exhibitInstances, exhibitSpots } from '../world/exhibitGeometry.ts'
import { exteriorInstances, interiorParts, placeLight, unlit, type Instance } from '../world/kitGeometry.ts'
import { wireframeInstances } from '../world/wireframe.ts'
import type { PlacesSnapshot } from './sceneList.ts'

/**
 * One drawn surface whose colour the audit judges (issues 409, 430), as `window.__qa.surfaceColours()` lists it: a piece of a room's
 * furniture, plinth, stand or lamp; a piece of an exhibit; or a lit surface of a building whose lamps are off (it is drawn in its
 * colour without the glow, so it can read tan in shade). Glowing things are left out: they are their own colour.
 */
export interface QaSurfaceColour {
  place: string
  kind: 'furniture' | 'exhibit' | 'unlit'
  /** What it is: `part <room>/<index> (<kit part>)`, `exhibit <id>`, or `the outside`. */
  what: string
  color: string
  /** Its biggest face, in square meters. */
  area: number
}

type Snapshot = Pick<PlacesSnapshot, 'places' | 'kit' | 'heightAt' | 'nowMs' | 'wireAlways'>

/** The biggest face of a unit shape scaled by the instance's matrix (a box's; near enough for the round shapes). */
const biggestFace = (i: Instance): number => {
  const m = i.matrix
  const [x, y, z] = [Math.hypot(m[0]!, m[1]!, m[2]!), Math.hypot(m[4]!, m[5]!, m[6]!), Math.hypot(m[8]!, m[9]!, m[10]!)]
  return Math.max(x * y, y * z, x * z)
}

/** The surfaces of every place whose colour the audit judges, as drawn now: a place drawn as cyan lines (being built) has none. */
export function surfaceColours(s: Snapshot): QaSurfaceColour[] {
  const out: QaSurfaceColour[] = []
  for (const place of s.places) {
    const [px, pz] = placeCentre(toLandPlace(place))
    const baseY = s.heightAt(px, pz)
    const wire = wireframeInstances(place, s.kit, baseY, s.nowMs, s.wireAlways)
    if (wire && wire.length > 0) continue
    const palette = s.kit.palettes.find((p) => p.id === place.exterior.palette) ?? s.kit.palettes[0]!
    const { lampsOn } = placeLight(place, { nowMs: s.nowMs })
    const add = (kind: QaSurfaceColour['kind'], what: string, i: Instance) => {
      if (!i.glow) out.push({ place: place.id, kind, what, color: i.color, area: biggestFace(i) })
    }
    if (!lampsOn) for (const i of exteriorInstances(place, s.kit, baseY)) if (i.glow) add('unlit', 'the outside', unlit(i, palette.colors))
    const partOf = (group: string) => place.rooms.find((r) => r.id === group.split('/')[0])?.parts[Number(group.split('/')[1])]?.part
    for (const i of interiorParts(place, s.kit, baseY, new Set(), { lampsOn }).instances) {
      const part = i.group ? partOf(i.group) : undefined
      const category = s.kit.parts.find((p) => p.id === part)?.category
      if (!part || category === 'structure' || category === 'nature') continue
      add('furniture', `part ${i.group} (${part})`, i)
    }
    for (const spot of exhibitSpots(place, s.kit, baseY)) for (const i of exhibitInstances(spot, palette.colors)) add('exhibit', `exhibit ${spot.exhibit.id}`, lampsOn ? i : unlit(i, palette.colors))
  }
  return out
}
