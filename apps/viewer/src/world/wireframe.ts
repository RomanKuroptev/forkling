import type { Kit, Place } from '@forkling/schema'
import { isBuilding } from '@forkling/sim'
import { buildingModel } from './building.ts'
import type { Instance } from './kitBase.ts'
import { compose } from './matrix.ts'
import { WIREFRAME } from './theme.ts'

/** How thick the glowing lines are, in meters. They are neon, so the thin-part rule does not apply. */
export const WIRE_THICKNESS = 0.14

interface Box {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

/** The box round some instances, from their matrices (a tilted box counts as its axis-aligned reach). */
function boundsOf(list: readonly Instance[]): Box | null {
  if (list.length === 0) return null
  const b: Box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity }
  for (const i of list) {
    const m = i.matrix
    const hx = 0.5 * (Math.abs(m[0]!) + Math.abs(m[4]!) + Math.abs(m[8]!))
    const hy = 0.5 * (Math.abs(m[1]!) + Math.abs(m[5]!) + Math.abs(m[9]!))
    const hz = 0.5 * (Math.abs(m[2]!) + Math.abs(m[6]!) + Math.abs(m[10]!))
    b.x0 = Math.min(b.x0, m[12]! - hx)
    b.x1 = Math.max(b.x1, m[12]! + hx)
    b.y0 = Math.min(b.y0, m[13]! - hy)
    b.y1 = Math.max(b.y1, m[13]! + hy)
    b.z0 = Math.min(b.z0, m[14]! - hz)
    b.z1 = Math.max(b.z1, m[14]! + hz)
  }
  return b
}

/** The edges of a box as thin glowing lines. The bottom edge along the front is left out, so nothing crosses the way in at the door. */
function edges(b: Box, skipFrontBottom: boolean): Instance[] {
  const t = WIRE_THICKNESS
  const out: Instance[] = []
  const line = (at: [number, number, number], size: [number, number, number]) =>
    out.push({ shape: 'box', matrix: compose(at, [0, 0, 0], size), color: WIREFRAME.pole, glow: true })
  const [cx, cy, cz] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2]
  const [w, h, d] = [b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0]
  for (const y of [b.y0, b.y1]) {
    for (const z of [b.z0, b.z1]) if (!(skipFrontBottom && y === b.y0 && z === b.z1)) line([cx, y, z], [w, t, t])
    for (const x of [b.x0, b.x1]) line([x, y, cz], [t, t, d])
  }
  for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) line([x, cy, z], [t, h, t])
  return out
}

/**
 * A place that is being built (spec 4.5) is its finished model drawn as glowing cyan lines: the body, the front and the crown as boxes
 * of lines, becoming solid when it is done. Nothing is drawn for a place that is not being built (`nowMs` is the world clock; without
 * one a construction written in the file counts as going on). A few dozen lines for each place, and the way in stays clear: the front
 * has no line on the ground across the door, and the lines above it are higher than a visitor.
 */
export function wireframeInstances(place: Place, kit: Kit, baseY: number, nowMs?: number, force = false): Instance[] | null {
  if (!force && !isBuilding(place.state, nowMs)) return []
  const model = buildingModel(place, kit, baseY)
  if (!model) return null
  const out: Instance[] = []
  const body = boundsOf(model.slots.body.filter((i) => !i.glow))
  if (body) out.push(...edges(body, true))
  const front = boundsOf(model.slots.front)
  if (front) out.push(...edges(front, false))
  const crown = boundsOf(model.slots.crown)
  if (crown) out.push(...edges(crown, false))
  return out
}
