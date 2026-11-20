import type { Page } from 'playwright'
import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'

type V3 = [number, number, number]
export type ViewKind = 'sky' | 'land' | 'thing'

/** The viewer's field of view, top to bottom (apps/viewer/src/App.tsx). */
const FOV_Y = 70
/** The rays across the arrival view: this many across and down. */
const COLS = 11
const ROWS = 9
/** How far a ray looks (meters): past this it has met nothing, and sees the sky. */
const FAR = 2000
/** Each of sky and land must fill at least this share of the arrival view (look.md: the sky, the sun and the grid carry the look). */
export const START_VIEW_SHARE = 0.1
/** A ray that meets something no higher than this above the ground under it has met the ground. */
const ON_GROUND = 0.15

/** The directions of the rays across a view from `yaw` and `pitch` (radians; forward is [sin yaw, 0, cos yaw]), corner to corner. */
export function viewRays(yaw: number, pitch: number, aspect: number, cols = COLS, rows = ROWS): V3[] {
  const ty = Math.tan(((FOV_Y / 2) * Math.PI) / 180)
  const tx = ty * aspect
  const f: V3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]
  const up: V3 = [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch)]
  const right: V3 = [-Math.cos(yaw), 0, Math.sin(yaw)]
  const out: V3[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = (2 * (c + 0.5)) / cols - 1
      const v = 1 - (2 * (r + 0.5)) / rows
      const d: V3 = [0, 1, 2].map((k) => f[k]! + right[k]! * u * tx + up[k]! * v * ty) as V3
      const n = Math.hypot(...d)
      out.push(d.map((x) => x / n) as V3)
    }
  }
  return out
}

/**
 * What each ray of the arrival view sees: the sky (it meets nothing), the land (it meets the ground, or the grid below the land,
 * outside every place's footprint) or a thing (a building, a column, a roof, furniture).
 */
export function classifyRays(eye: V3, rays: { dir: V3; hit: { distance: number } | null }[], groundAt: (x: number, z: number) => number, footprints: { x0: number; z0: number; x1: number; z1: number }[]): ViewKind[] {
  return rays.map(({ dir, hit }) => {
    if (!hit) return 'sky'
    const p = [0, 1, 2].map((k) => eye[k]! + dir[k]! * hit.distance) as V3
    const inPlace = footprints.some((f) => p[0] > f.x0 && p[0] < f.x1 && p[2] > f.z0 && p[2] < f.z1)
    return !inPlace && p[1] <= groundAt(p[0], p[2]) + ON_GROUND ? 'land' : 'thing'
  })
}

/**
 * The arrival view shows the world: the sky and the land each fill at least `START_VIEW_SHARE` of the first picture. Added after the
 * world explorer saw the visitor arrive under Home's porch roof, the picture all ceiling, columns and wall (issue 452; audit QW.2).
 */
export function startViewFindings(fixture: string, kinds: readonly ViewKind[], eye: readonly number[]): CheckResult[] {
  if (kinds.length === 0) return []
  const share = (k: ViewKind) => kinds.filter((x) => x === k).length / kinds.length
  const sky = share('sky')
  const land = share('land')
  if (sky >= START_VIEW_SHARE && land >= START_VIEW_SHARE) return []
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const missing = [sky < START_VIEW_SHARE ? 'sky' : null, land < START_VIEW_SHARE ? 'land' : null].filter(Boolean).join(' and ')
  return [
    {
      id: 'world.start-view',
      fingerprint: `world.start-view|${fixture}`,
      severity: 'major',
      title: `The arrival view shows almost no ${missing}`,
      what: `From the start (${eye.map((n) => n.toFixed(1)).join(', ')}) the sky fills ${pct(sky)} of the view and the land ${pct(land)}; the rest is buildings and things close by. Each should fill at least ${pct(START_VIEW_SHARE)}.`,
      causes: "The first look at Merge's world is a close-up of a wall or a ceiling instead of the place under its sky.",
      evidence: [],
      fixKind: 'look',
      fixture,
      where: 'packages/sim/src/body-world.ts',
    },
  ]
}

type Qa = { ray(origin: V3, dir: V3, far: number): { distance: number } | null; ground(points: [number, number][]): { y: number }[] }

/** Casts the arrival view's rays in the opened world (before anything moves) and judges them. */
export async function collectStartView(page: Page, fixture: string, start: { eye: V3; yaw: number; pitch: number; aspect: number }, scene: readonly SceneObject[]): Promise<CheckResult[]> {
  const dirs = viewRays(start.yaw, start.pitch, start.aspect)
  const hits = await page.evaluate(({ eye, dirs, far }) => dirs.map((d) => (globalThis as unknown as { __qa: Qa }).__qa.ray(eye, d, far)), { eye: start.eye, dirs, far: FAR })
  const points = hits.flatMap((h, i) => (h ? [[start.eye[0] + dirs[i]![0] * h.distance, start.eye[2] + dirs[i]![2] * h.distance] as [number, number]] : []))
  const heights = await page.evaluate((pts) => (globalThis as unknown as { __qa: Qa }).__qa.ground(pts), points)
  const at = new Map(points.map((p, i) => [`${p[0]},${p[1]}`, heights[i]!.y]))
  const footprints = scene.flatMap((o) => (o.kind === 'place' && o.footprint ? [o.footprint] : []))
  const kinds = classifyRays(start.eye, dirs.map((dir, i) => ({ dir, hit: hits[i] ?? null })), (x, z) => at.get(`${x},${z}`) ?? -Infinity, footprints)
  return startViewFindings(fixture, kinds, start.eye)
}
