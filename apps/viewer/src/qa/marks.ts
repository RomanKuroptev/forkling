import { neglectFor, placeCentre, toLandPlace } from '@forkling/sim'
import { neglectInstances } from '../world/exhibitGeometry.ts'
import { wireframeInstances } from '../world/wireframe.ts'
import type { PlacesSnapshot } from './sceneList.ts'

type Vec3 = [number, number, number]

/** A thin mark of neglect that hangs in a room and does not glow, as `window.__qa.thinMarks()` lists it. */
export interface QaThinMark {
  place: string
  /** Its thinnest side, and how far above the floor its underside is, in meters. */
  thickness: number
  up: number
  at: Vec3
}

/** Nothing thinner than this may be drawn unless it is neon (docs/spec/v4/look.md). */
export const THINNEST = 0.15
/** A mark whose underside is this far above the floor hangs in the room (dust and grass lie on the floor). */
export const HANGS_ABOVE = 0.3

type Snapshot = Pick<PlacesSnapshot, 'places' | 'kit' | 'heightAt' | 'nowMs' | 'wireAlways'>

/**
 * The marks of neglect inside every place (spec 4.4), as the drawing makes them at the snapshot's clock, that hang in a room, are
 * thinner than 0.15 m and do not glow: a pale slab under the ceiling, which reads as a plank floating with nothing holding it
 * (issue 336). A place drawn as cyan lines (being built) shows no neglect.
 */
export function thinMarks(s: Snapshot): QaThinMark[] {
  const out: QaThinMark[] = []
  for (const place of s.places) {
    const [px, pz] = placeCentre(toLandPlace(place))
    const baseY = s.heightAt(px, pz)
    const wire = wireframeInstances(place, s.kit, baseY, s.nowMs, s.wireAlways)
    if (wire && wire.length > 0) continue
    const level = neglectFor({ id: place.id, lastCareAt: place.state.lastCareAt, founded: place.founded, closed: place.state.closed !== null }, s.nowMs)
    for (const i of neglectInstances(place, s.kit, baseY, level, 'interior')) {
      if (i.glow) continue
      const m = i.matrix
      const size = [Math.hypot(m[0]!, m[1]!, m[2]!), Math.hypot(m[4]!, m[5]!, m[6]!), Math.hypot(m[8]!, m[9]!, m[10]!)]
      const up = m[13]! - size[1]! / 2 - baseY
      const thickness = Math.min(...size)
      if (up > HANGS_ABOVE && thickness < THINNEST) out.push({ place: place.id, thickness, up, at: [m[12]!, m[13]!, m[14]!] })
    }
  }
  return out
}
