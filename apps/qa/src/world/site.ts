import type { CheckResult } from '../report/finding.ts'
import type { GeometryInput } from './geometry.ts'
import type { SceneObject } from './open.ts'

/**
 * The construction site, second pass (issues 426, 427, 330; audit QW.2), from `__qa.scene()`:
 * - `world.site-exhibit-solid`: in a place being built, an exhibit drawn solid, or whose card shows its picture. Being built is the
 *   finished model in cyan wire (look.md); a solid card in a wire bookcase reads as things moved into a room that is not there yet.
 * - `world.sign-unsupported`: a sign with no post under it that stands on the ground and reaches its board. It hovers.
 * - `world.wire-doubled`: two wire lines of one place that run side by side closer than 5 cm: one edge drawn twice, a thick bar.
 */

/** Two lines closer than this, side by side, are one edge drawn twice (meters). */
const DOUBLE_GAP = 0.05
/** ... when they run side by side along more than this (meters): lines that only meet at a corner are not doubled. */
const DOUBLE_ALONG = 0.05
/** A post stands on the ground within this, and reaches up to the board's lower edge within this (meters). */
const REACH = 0.1

type V3 = [number, number, number]

/** Pairs of lines (by index) that run side by side closer than `DOUBLE_GAP` along more than `DOUBLE_ALONG`. */
export function doubledLines(lines: readonly [V3, V3][]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < lines.length; i++) {
    const [a, b] = lines[i]!
    const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const lu = Math.hypot(...u)
    if (lu < 1e-6) continue
    const dir: V3 = [u[0] / lu, u[1] / lu, u[2] / lu]
    const t = (p: V3) => (p[0] - a[0]) * dir[0] + (p[1] - a[1]) * dir[1] + (p[2] - a[2]) * dir[2]
    const off = (p: V3) => Math.hypot(p[0] - a[0] - t(p) * dir[0], p[1] - a[1] - t(p) * dir[1], p[2] - a[2] - t(p) * dir[2])
    for (let j = i + 1; j < lines.length; j++) {
      const [c, d] = lines[j]!
      const v: V3 = [d[0] - c[0], d[1] - c[1], d[2] - c[2]]
      const lv = Math.hypot(...v)
      if (lv < 1e-6 || Math.abs((dir[0] * v[0] + dir[1] * v[1] + dir[2] * v[2]) / lv) < 0.999) continue
      const overlap = Math.min(lu, Math.max(t(c), t(d))) - Math.max(0, Math.min(t(c), t(d)))
      if (overlap > DOUBLE_ALONG && Math.max(off(c), off(d)) < DOUBLE_GAP) out.push([i, j])
    }
  }
  return out
}

export function siteFindings(input: GeometryInput): CheckResult[] {
  const { fixture } = input
  const out: CheckResult[] = []
  const add = (id: string, key: string, title: string, what: string, causes: string, fixKind: CheckResult['fixKind'], where?: string) =>
    out.push({ id, fingerprint: `${id}|${fixture}|${key}`, severity: 'major', title, what, causes, evidence: [], fixKind, fixture, ...(where ? { where } : {}) })
  const files = new Map(input.places.map((p) => [p.id, p]))
  const building = (id: string | undefined) => {
    const file = files.get(id ?? '')
    return !!file && file.state.construction !== null && Date.parse(file.state.construction.finishesAt) > input.now
  }
  const boxed = input.scene.filter((o): o is SceneObject & { box: NonNullable<SceneObject['box']> } => o.box !== null)

  for (const e of boxed) {
    if (e.kind !== 'exhibit' || !building(e.place)) continue
    if (e.material === 'wireframe' && e.card?.shows !== 'picture') continue
    add('world.site-exhibit-solid', e.id, `A solid exhibit stands inside ${e.place}, which is being built`, e.material !== 'wireframe' ? `${e.id} is drawn ${e.material} while its place is cyan wire.` : `${e.id}'s card shows its picture while its place is cyan wire.`, 'Things look already moved into a room that is not built yet, and float in the wire.', 'look', `places/${e.place}.json`)
  }

  for (const s of boxed) {
    if (s.kind !== 'sign') continue
    const [x, z] = [(s.box.min[0] + s.box.max[0]) / 2, (s.box.min[2] + s.box.max[2]) / 2]
    const ground = input.ground(x, z).y
    const holds = (s.support ?? []).some((p) => p.min[1] <= ground + REACH && p.max[1] >= s.box.min[1] - REACH && p.max[0] >= s.box.min[0] - 0.3 && p.min[0] <= s.box.max[0] + 0.3)
    if (holds) continue
    const what = s.support === undefined ? 'The scene list gives it nothing under its board.' : s.support.length === 0 ? 'Nothing is drawn under its board: no post.' : `Its posts do not reach from the ground (${ground.toFixed(2)} m) to its board (${s.box.min[1].toFixed(2)} m).`
    add('world.sign-unsupported', s.id, `The sign ${s.id} has nothing holding it up`, what, 'The sign hovers in the air, stuck on rather than standing in the world.', 'look', s.place ? `places/${s.place}.json` : undefined)
  }

  for (const p of boxed) {
    if (p.kind !== 'place' || !p.wire?.length) continue
    const pairs = doubledLines(p.wire)
    if (!pairs.length) continue
    const [i] = pairs[0]!
    const at = p.wire[i]![0].map((n) => n.toFixed(2)).join(', ')
    add('world.wire-doubled', p.id, `Wire edges of ${p.id} are drawn twice side by side`, `${pairs.length} pairs of its wire lines run parallel closer than ${DOUBLE_GAP * 100} cm (the first at ${at}).`, 'Each such edge is a doubled, thick, glaring bar instead of one thin line.', 'look', `places/${p.id}.json`)
  }
  return out
}
