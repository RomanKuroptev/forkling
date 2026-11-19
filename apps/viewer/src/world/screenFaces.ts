import type { Kit, Place } from '@forkling/schema'
import { exhibitSpots } from './exhibitGeometry.ts'

/** The picture on a screen slot, in meters: a little inside the lit panel `exhibitInstances` draws (0.8 by 0.5), so its edge shows as a bezel. */
export const SCREEN_FACE = { w: 0.76, h: 0.46 } as const
/** How far in front of the slot the face sits: just past the lit panel's front (it is 0.03 m deep, centred on the slot). */
const OUT = 0.02

/** What one screen shows (look.md: a screen shows the work installed on it). */
export interface ScreenFace {
  /** `<place>/<exhibit>`, the same id the scene list gives the exhibit. */
  key: string
  placeId: string
  exhibitId: string
  position: [number, number, number]
  rotY: number
  size: [number, number]
  /** The work's thumbnail, a path in the world repo, or null when it has none: then the screen shows `title`. */
  picture: string | null
  /** The words shown when there is no picture (and while it loads). */
  title: string
}

/** A work ref the picture path may be made from: `works/<id>`, nothing that climbs out. The refs are data. */
const WORK_REF = /^works\/([a-z0-9][a-z0-9-]*)$/

/** A work's label often starts with its title ("Two Lamps Taking Turns: two lamps in a dark room..."); else the label is the words. */
function titleOf(label: string): string {
  const head = /^([^:]{1,60}):\s/.exec(label)?.[1]?.trim()
  return head || label.trim()
}

/**
 * A face for every work or done project on a screen slot of a place: the work's thumbnail when the repo has one (`thumbs`, ids
 * from `works/<id>/thumb.png`), else its title. Before this a screen was only a lit panel in the palette's glow colour, so the
 * Workshop showed four plain blue boxes (issues 352, 341, 362).
 */
export function screenFaces(places: readonly Place[], kit: Kit, baseOf: (place: Place) => number, thumbs: ReadonlySet<string>): ScreenFace[] {
  const out: ScreenFace[] = []
  for (const place of places) {
    for (const spot of exhibitSpots(place, kit, baseOf(place))) {
      const e = spot.exhibit
      if (spot.slotKind !== 'screen' || (e.kind !== 'work' && e.kind !== 'project')) continue
      const id = e.kind === 'work' && e.ref ? WORK_REF.exec(e.ref)?.[1] : undefined
      const [x, y, z] = spot.position
      out.push({
        key: `${place.id}/${e.id}`,
        placeId: place.id,
        exhibitId: e.id,
        position: [x + Math.sin(spot.rotY) * OUT, y, z + Math.cos(spot.rotY) * OUT],
        rotY: spot.rotY,
        size: [SCREEN_FACE.w, SCREEN_FACE.h],
        picture: id && thumbs.has(id) ? `works/${id}/thumb.png` : null,
        title: titleOf(e.label),
      })
    }
  }
  return out
}

