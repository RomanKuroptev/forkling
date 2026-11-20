import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'

type V = readonly number[]

/** Whether the straight line from `a` to `b` runs through the inside of a box, a millimetre in from its faces (touching is not covering). */
export function lineThroughBox(a: V, b: V, box: { min: V; max: V }): boolean {
  let t0 = 0
  let t1 = 1
  for (let k = 0; k < 3; k++) {
    const d = b[k]! - a[k]!
    const lo = box.min[k]! + 1e-3
    const hi = box.max[k]! - 1e-3
    if (Math.abs(d) < 1e-12) {
      if (a[k]! <= lo || a[k]! >= hi) return false
      continue
    }
    const u = (lo - a[k]!) / d
    const v = (hi - a[k]!) / d
    t0 = Math.max(t0, Math.min(u, v))
    t1 = Math.min(t1, Math.max(u, v))
  }
  return t0 < t1
}

/**
 * A card's whole face shows: from a visitor's eyes in front of the part it stands on (up against it, a step back, further), no piece
 * of that part stands between the eyes and any point of the card (its corners and the middle of its top edge). Read from the scene
 * list's `view` of each drawn exhibit, in the part's own frame. Added after the world explorer saw the first line of Home's two cards
 * hidden under the low shelf's top board (issue 453; audit QW.2).
 */
export function cardCoveredFindings(fixture: string, scene: readonly SceneObject[]): CheckResult[] {
  const out: CheckResult[] = []
  for (const o of scene) {
    if (!o.visible || !o.view) continue
    const { eyes, face, boards } = o.view
    // The face's points from the top down: the corners at the top and the middle of the top edge are what goes first.
    const hidden = face.filter((p) => eyes.some((e) => boards.some((b) => lineThroughBox(e, p, b))))
    if (hidden.length === 0) continue
    const top = Math.max(...face.map((p) => p[1]))
    const onTop = hidden.some((p) => p[1] > top - 0.02)
    out.push({
      id: 'world.card-covered',
      fingerprint: `world.card-covered|${fixture}|${o.id}`,
      severity: 'major',
      title: `The card of ${o.id} is partly hidden by the ${o.slot ?? 'part'} it stands in`,
      what: `From a visitor's eyes in front of it, ${hidden.length} of ${face.length} points of the card of ${o.id} (at ${o.at ?? '?'}) are behind a piece of the part it stands on${onTop ? ': its top edge, where the first line is' : ''}.`,
      causes: 'A visitor cannot read the first line of the card without crouching, and the card looks pushed in under the shelf.',
      evidence: [],
      fixKind: 'look',
      fixture,
      where: 'apps/viewer/src/world/exhibitCards.ts',
    })
  }
  return out
}
