import { kit } from '@forkling/schema/kit'
import { WALL } from '@forkling/sim'
import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'

/**
 * How far in from the footprint's edge the outer face of a building's wall is (the viewer's wall stands 0.4 m in and is 0.4 m
 * thick, `apps/viewer/src/world/building.ts`). Anything reaching past it is seen from outside.
 */
const OUTER_FACE = 0.2
/** A room needs at least this much floor, across and deep, inside the wall ring for a visitor to stand in it. */
const STAND = 0.5

/** The walls' own pieces (windows, doors, wall panels): they belong in the wall line. */
const STRUCTURE = new Set(kit.parts.filter((p) => p.category === 'structure').map((p) => p.id))

/**
 * Two checks on how a building holds its inside (audit QW.2), added after the world explorer saw them on day-7 (issues 339, 373):
 *
 * - `world.through-wall`: a drawn piece of furniture, an exhibit or a work on a screen reaches past the outer face of its building's
 *   walls, so it pokes out where the house is seen from outside (Tiny Patch's screen and the Counter Room's plinth through Home's
 *   east corner). A part only inside the wall is hidden, not leaking, and the walls' own pieces belong in the wall.
 * - `world.room-no-way-in`: a room holding exhibits has less than half a meter of floor, across or deep, inside the 0.8 m wall ring
 *   the visitor cannot walk on (`WALL`), so no one can go in to see them (Home's 1 m Counter Room).
 *
 * Only ground-level footprints are used: the upper floors of a tower stand further in, which this does not count.
 */
export function insideWallsFindings(fixture: string, scene: readonly SceneObject[]): CheckResult[] {
  const out: CheckResult[] = []
  const footprints = new Map(scene.flatMap((o) => (o.kind === 'place' && o.footprint ? [[o.id, o.footprint] as const] : [])))
  const fmt = (b: NonNullable<SceneObject['box']>) => `${b.min.map((n) => n.toFixed(1)).join(', ')} to ${b.max.map((n) => n.toFixed(1)).join(', ')}`

  for (const o of scene) {
    if (!o.visible || !o.box || !o.place) continue
    const f = footprints.get(o.place)
    if (!f) continue
    const piece = (o.kind === 'part' && !STRUCTURE.has(o.name ?? '') && !o.inDoorway) || o.kind === 'exhibit' || (o.kind === 'work' && o.slot !== 'gallery-wall')
    if (!piece) continue
    const b = o.box
    const through = b.min[0] < f.x0 + OUTER_FACE - 1e-3 || b.max[0] > f.x1 - OUTER_FACE + 1e-3 || b.min[2] < f.z0 + OUTER_FACE - 1e-3 || b.max[2] > f.z1 - OUTER_FACE + 1e-3
    if (!through) continue
    const what = o.kind === 'part' ? `The part ${o.id}${o.name ? ` (${o.name})` : ''}` : `The ${o.kind} ${o.id}`
    out.push({
      id: 'world.through-wall',
      fingerprint: `world.through-wall|${fixture}|${o.id}`,
      severity: 'major',
      title: `${o.kind === 'part' ? (o.name ?? o.id) : o.id} pokes out through the wall of ${o.place}`,
      what: `${what} is drawn from ${fmt(b)}, past the outer face of ${o.place}'s walls (its footprint runs from ${f.x0}, ${f.z0} to ${f.x1}, ${f.z1}; the outer face is ${OUTER_FACE} m in).`,
      causes: 'From outside the house looks broken, with furniture leaking through its walls, and from inside the thing is half hidden in the wall.',
      evidence: [],
      fixKind: 'look',
      fixture,
      where: `places/${o.place}.json`,
    })
  }

  for (const room of scene) {
    if (room.kind !== 'room' || !room.box || !room.place) continue
    const f = footprints.get(room.place)
    if (!f) continue
    const prefix = `${room.id}/`
    const held = scene.filter((e) => (e.kind === 'exhibit' || e.kind === 'work') && e.at?.startsWith(prefix)).map((e) => e.id)
    if (held.length === 0) continue
    const b = room.box
    const across = Math.min(b.max[0], f.x1 - WALL) - Math.max(b.min[0], f.x0 + WALL)
    const deep = Math.min(b.max[2], f.z1 - WALL) - Math.max(b.min[2], f.z0 + WALL)
    if (across >= STAND && deep >= STAND) continue
    out.push({
      id: 'world.room-no-way-in',
      fingerprint: `world.room-no-way-in|${fixture}|${room.id}`,
      severity: 'minor',
      title: `${room.name ?? room.id} at ${room.place} has no way in, and ${held.length === 1 ? 'an exhibit is' : `${held.length} exhibits are`} shut inside it`,
      what: `The room ${room.id} is drawn from ${fmt(b)}, but only ${Math.max(0, across).toFixed(2)} m across and ${Math.max(0, deep).toFixed(2)} m deep of it is inside the ${WALL} m wall ring a visitor cannot walk on. It holds ${held.join(', ')}.`,
      causes: 'A room Merge made, and what it put there, cannot be visited at all.',
      evidence: [],
      fixKind: 'data',
      fixture,
      where: `places/${room.place}.json`,
    })
  }
  return out
}
