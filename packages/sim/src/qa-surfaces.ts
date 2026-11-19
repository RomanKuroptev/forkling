/**
 * Surfaces that fight (z-fighting) for the audit harness's world checks: two boxes whose faces lie in the same plane, face the
 * same way and cover the same patch, drawn in different colours. The depth buffer cannot tell which is in front, so a visitor
 * sees stripes and stair steps that shimmer as they move (issues 350, 353, 335, 337, 370, 371). Numbers in, numbers out.
 */

/** A drawn box: the unit cube (-0.5 to 0.5 on each axis) under a 4x4 transform kept column by column, as three.js keeps them. */
export interface DrawnBox {
  matrix: readonly number[]
  color: string
  glow?: boolean
  /** What it is, for the finding (a place id, or `<place>/<what>`). */
  id?: string
  /** Boxes of one group (the primitives of one kit part, as its maker drew them) are not checked against each other. */
  group?: string
}

export interface SurfaceFight {
  a: number
  b: number
  /** The square meters both faces cover. */
  area: number
  /** The middle of the shared patch, in world meters. */
  at: [number, number, number]
  /** The way the faces look (a unit vector). */
  normal: [number, number, number]
  /** The box whose face is the nearer to a viewer looking against `normal` (the one in front), and how far apart the faces are. */
  front: number
  gap: number
}

/** Two faces closer than this (meters) along their normal are in one plane for the depth buffer. */
export const FIGHT_GAP = 0.005
/** A shared patch smaller than this (square meters) is too small to see. */
export const FIGHT_AREA = 0.004

type V = [number, number, number]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V) => Math.hypot(a[0], a[1], a[2])

interface Face {
  box: number
  normal: V
  /** The plane: dot(normal, p) = d. */
  d: number
  corners: V[]
}

function facesOf(m: readonly number[], box: number): Face[] {
  const col = (k: number): V => [m[k * 4]!, m[k * 4 + 1]!, m[k * 4 + 2]!]
  const origin: V = [m[12]!, m[13]!, m[14]!]
  const axes = [col(0), col(1), col(2)]
  const out: Face[] = []
  for (let i = 0; i < 3; i++) {
    const u = axes[(i + 1) % 3]!
    const v = axes[(i + 2) % 3]!
    const n0 = cross(u, v)
    const l = len(n0)
    if (l < 1e-9) continue
    for (const s of [1, -1]) {
      // The face's outward normal points the same way as its own axis from the middle.
      const sign = dot(n0, axes[i]!) >= 0 ? s : -s
      const normal = mul(n0, sign / l)
      const centre = add(origin, mul(axes[i]!, s * 0.5))
      const corners = [add(add(centre, mul(u, 0.5)), mul(v, 0.5)), add(add(centre, mul(u, -0.5)), mul(v, 0.5)), add(add(centre, mul(u, -0.5)), mul(v, -0.5)), add(add(centre, mul(u, 0.5)), mul(v, -0.5))]
      out.push({ box, normal, d: dot(normal, centre), corners })
    }
  }
  return out
}

type P = [number, number]
const area2 = (poly: P[]) => {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}
const ccw = (poly: P[]): P[] => (area2(poly) < 0 ? [...poly].reverse() : poly)

/** The part of convex polygon `subject` inside convex polygon `clip` (both counter-clockwise). */
function clipPolygon(subject: P[], clip: P[]): P[] {
  let out = subject
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i]!
    const b = clip[(i + 1) % clip.length]!
    const inside = (p: P) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0
    const cut = (p: P, q: P): P => {
      const dx = q[0] - p[0]
      const dy = q[1] - p[1]
      const den = (b[0] - a[0]) * dy - (b[1] - a[1]) * dx
      const t = den === 0 ? 0 : ((b[0] - a[0]) * (a[1] - p[1]) - (b[1] - a[1]) * (a[0] - p[0])) / den
      return [p[0] + t * dx, p[1] + t * dy]
    }
    const input = out
    out = []
    for (let k = 0; k < input.length; k++) {
      const p = input[k]!
      const q = input[(k + 1) % input.length]!
      if (inside(q)) {
        if (!inside(p)) out.push(cut(p, q))
        out.push(q)
      } else if (inside(p)) out.push(cut(p, q))
    }
  }
  return out
}

/** Whether a point is inside a box (the unit cube under `m`), more than `margin` meters in. */
function insideBox(m: readonly number[], p: V, margin = 0.002): boolean {
  const col = (k: number): V => [m[k * 4]!, m[k * 4 + 1]!, m[k * 4 + 2]!]
  const axes = [col(0), col(1), col(2)]
  const rel = sub(p, [m[12]!, m[13]!, m[14]!])
  // Solve rel = a0*x + a1*y + a2*z for the box's own coordinates.
  const det = dot(axes[0]!, cross(axes[1]!, axes[2]!))
  if (Math.abs(det) < 1e-12) return false
  const local = [dot(rel, cross(axes[1]!, axes[2]!)) / det, dot(axes[0]!, cross(rel, axes[2]!)) / det, dot(axes[0]!, cross(axes[1]!, rel)) / det]
  return local.every((t, k) => Math.abs(t) < 0.5 - margin / len(axes[k]!))
}

/**
 * Every pair of drawn boxes with faces that fight: in one plane (within `FIGHT_GAP`), facing the same way, sharing more than
 * `FIGHT_AREA` square meters, in different colours (or one glowing and one not), where the shared patch is not hidden inside a
 * third box. Faces of one colour in one plane draw the same pixels whichever wins, so they are left alone, and so are two
 * boxes of one `group`.
 */
export function surfaceFights(boxes: readonly DrawnBox[], opts: { gap?: number; area?: number } = {}): SurfaceFight[] {
  const gap = opts.gap ?? FIGHT_GAP
  const minArea = opts.area ?? FIGHT_AREA
  const faces = boxes.flatMap((b, i) => facesOf(b.matrix, i))
  // Faces grouped by the way they look, rounded; a fight needs the same way within a hair.
  const groups = new Map<string, Face[]>()
  for (const f of faces) {
    const key = f.normal.map((c) => Math.round(c * 1000)).join(',')
    const list = groups.get(key)
    if (list) list.push(f)
    else groups.set(key, [f])
  }
  const out: SurfaceFight[] = []
  const seen = new Set<string>()
  for (const list of groups.values()) {
    list.sort((p, q) => p.d - q.d)
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!
      for (let j = i + 1; j < list.length && list[j]!.d - f.d < gap; j++) {
        const g = list[j]!
        if (f.box === g.box) continue
        const A = boxes[f.box]!
        const B = boxes[g.box]!
        if (A.group !== undefined && A.group === B.group) continue
        if (A.color.toLowerCase() === B.color.toLowerCase() && Boolean(A.glow) === Boolean(B.glow)) continue
        if (dot(f.normal, g.normal) < 0.99999) continue
        // Both faces in the plane's own two directions.
        const n = f.normal
        const u0: V = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
        const u = mul(cross(n, u0), 1 / len(cross(n, u0)))
        const v = cross(n, u)
        const flat = (p: V): P => [dot(p, u), dot(p, v)]
        const shared = clipPolygon(ccw(f.corners.map(flat)), ccw(g.corners.map(flat)))
        if (shared.length < 3) continue
        const area = Math.abs(area2(shared))
        if (area < minArea) continue
        const mid = shared.reduce<P>((s, p) => [s[0] + p[0] / shared.length, s[1] + p[1] / shared.length], [0, 0])
        const at = add(add(mul(u, mid[0]), mul(v, mid[1])), mul(n, (f.d + g.d) / 2))
        // A patch inside a third box (just in front of the faces) is never seen.
        const front = add(at, mul(n, 0.01))
        if (boxes.some((c, k) => k !== f.box && k !== g.box && insideBox(c.matrix, front))) continue
        const key = `${Math.min(f.box, g.box)}:${Math.max(f.box, g.box)}:${n.map((c) => Math.round(c * 100)).join(',')}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ a: Math.min(f.box, g.box), b: Math.max(f.box, g.box), area, at, normal: n, front: g.box, gap: g.d - f.d })
      }
    }
  }
  return out
}
