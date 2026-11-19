import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'

/** Two boxes share more than this in every axis (meters) before one counts as standing in the other: touching is not in the way. */
const EPS = 0.01

/** What can stand in a doorway; places, rooms, plots, the doorways themselves, Merge and the visitor walk through or hold it. */
const THINGS: readonly SceneObject['kind'][] = ['part', 'exhibit', 'work', 'sign', 'label']

/**
 * Nothing in the scene stands in a door opening: a doorway (`kind: 'door'`, the gap in the front wall up to the lintel and a step
 * inside, `apps/viewer/src/world/doorway.ts`) is clear of every drawn part, exhibit, work, sign and label. Added after the world
 * explorer saw a frame hanging in Home's door and a door leaf standing in the Hillside Room's (issues 342, 345, 354; audit QW.2).
 */
export function doorwayFindings(fixture: string, scene: readonly SceneObject[]): CheckResult[] {
  const out: CheckResult[] = []
  const doors = scene.filter((o) => o.kind === 'door' && o.box)
  for (const door of doors) {
    for (const o of scene) {
      if (!o.visible || !o.box || !THINGS.includes(o.kind)) continue
      const a = o.box
      const b = door.box!
      if (![0, 1, 2].every((k) => Math.min(a.max[k]!, b.max[k]!) - Math.max(a.min[k]!, b.min[k]!) > EPS)) continue
      const placeId = door.place ?? door.id.split('/')[0]!
      out.push({
        id: 'world.in-doorway',
        fingerprint: `world.in-doorway|${fixture}|${o.id}`,
        severity: 'major',
        title: `${o.name ?? o.id} stands in the doorway of ${placeId}`,
        what: `The ${o.kind} ${o.id}${o.name ? ` (${o.name})` : ''} is drawn inside the door opening of ${placeId}, between ${b.min.map((n) => n.toFixed(1)).join(', ')} and ${b.max.map((n) => n.toFixed(1)).join(', ')}.`,
        causes: 'The door looks blocked or shut, and the thing looks dropped there.',
        evidence: [],
        fixKind: 'look',
        fixture,
        where: `places/${placeId}.json`,
      })
    }
  }
  return out
}
