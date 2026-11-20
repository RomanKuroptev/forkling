import type { CheckResult } from '../report/finding.ts'
import { solidParts } from './bump.ts'
import type { SceneObject } from './open.ts'

type Box = NonNullable<SceneObject['box']>
const EPS = 0.01

/**
 * A clear walk in: from each place's door straight in to the middle of the room the door opens into, as wide as the door, no
 * drawn piece of furniture stands in the way (one a visitor bumps into: `solidParts`, so not a rug, not a frame hung overhead).
 * Added after the world explorer stopped 3.6 m short of Merge against Home's bench, set square across the way in a step inside
 * the door (issue 451; audit QW.2). A place drawn as wire (being built) is left out: its walls are lines.
 */
export function doorLaneFindings(fixture: string, scene: readonly SceneObject[]): CheckResult[] {
  const out: CheckResult[] = []
  const wire = new Set(scene.filter((o) => o.kind === 'place' && o.material === 'wireframe').map((o) => o.id))
  const solid = solidParts(scene)
  for (const door of scene.filter((o): o is SceneObject & { box: Box } => o.kind === 'door' && o.box !== null)) {
    const placeId = door.place ?? door.id.split('/')[0]!
    if (wire.has(placeId)) continue
    const lane = laneOf(door.box, placeId, scene)
    for (const part of solid) {
      if (part.place !== placeId) continue
      const b = part.box
      if (!(Math.min(b.max[0], lane.x1) - Math.max(b.min[0], lane.x0) > EPS && Math.min(b.max[2], lane.z1) - Math.max(b.min[2], lane.z0) > EPS)) continue
      out.push({
        id: 'world.door-lane',
        fingerprint: `world.door-lane|${fixture}|${part.id}`,
        severity: 'major',
        title: `The ${part.name ?? 'furniture'} in ${placeId} stands in the way in from the door`,
        what: `${part.id}${part.name ? ` (${part.name})` : ''} is drawn between x ${b.min[0].toFixed(1)} and ${b.max[0].toFixed(1)}, z ${b.min[2].toFixed(1)} and ${b.max[2].toFixed(1)}: in the straight walk from the door of ${placeId} (x ${lane.x0.toFixed(1)} to ${lane.x1.toFixed(1)}) to the middle of its room (z ${lane.z0.toFixed(1)}).`,
        causes: 'A visitor walking in to say hi to Merge bumps into furniture in the doorway and has to go round it.',
        evidence: [],
        fixKind: 'look',
        fixture,
        where: 'apps/viewer/src/world/insideWalls.ts',
      })
    }
  }
  return out
}

/** The lane from a doorway in to the middle of the room behind it (the room holding the point just inside the door), or of the place. */
function laneOf(door: Box, placeId: string, scene: readonly SceneObject[]): { x0: number; x1: number; z0: number; z1: number } {
  const x = (door.min[0] + door.max[0]) / 2
  const inside = door.min[2] - 0.3
  const floor = door.min[1]
  const room = scene
    .filter((o): o is SceneObject & { box: Box } => o.kind === 'room' && o.place === placeId && o.box !== null)
    .filter((r) => r.box.min[1] <= floor && r.box.max[1] > floor && x >= r.box.min[0] && x <= r.box.max[0] && inside >= r.box.min[2] && inside <= r.box.max[2])
    .sort((a, b) => b.box.min[1] - a.box.min[1])[0]
  const place = scene.find((o) => o.kind === 'place' && o.id === placeId)?.box
  const middle = room ? (room.box.min[2] + room.box.max[2]) / 2 : place ? (place.min[2] + place.max[2]) / 2 : inside
  return { x0: door.min[0], x1: door.max[0], z0: Math.min(middle, door.min[2]), z1: door.max[2] }
}
