import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Place, repairPlaceJson, WorkMeta } from '@forkling/schema'
import type { Page } from 'playwright'
import type { GeometryInput } from './geometry.ts'
import type { SceneObject } from './open.ts'

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** The places and works of a world folder as the readers see them (a file that does not fit is left out, as the viewer does). */
export function worldFilesFor(dir: string): Pick<GeometryInput, 'places' | 'works'> {
  const placesDir = join(dir, 'places')
  const worksDir = join(dir, 'works')
  const places = existsSync(placesDir)
    ? readdirSync(placesDir)
        .filter((f) => f.endsWith('.json'))
        .flatMap((f) => {
          const p = Place.safeParse(repairPlaceJson(readJson(join(placesDir, f))))
          return p.success ? [p.data] : []
        })
    : []
  const works = existsSync(worksDir)
    ? readdirSync(worksDir).flatMap((d) => {
        const w = WorkMeta.safeParse(readJson(join(worksDir, d, 'meta.json')))
        return w.success ? [w.data] : []
      })
    : []
  return { places, works }
}

type Qa = {
  scene(): SceneObject[]
  visitor(): { x: number; y: number; z: number; yaw: number; pitch: number } | null
  ground(points: [number, number][]): { y: number; chunk: string }[]
}

/** Everything the geometry checks need from a world that has just opened (before any step, so `start` is the arrival view). */
export async function collectGeometry(page: Page, dir: string, fixture: string, now: number): Promise<GeometryInput> {
  const { scene, visitor, viewport } = await page.evaluate(() => {
    const qa = (globalThis as unknown as { __qa: Qa }).__qa
    const g = globalThis as unknown as { innerWidth: number; innerHeight: number }
    return { scene: qa.scene(), visitor: qa.visitor(), viewport: [g.innerWidth, g.innerHeight] }
  })
  if (!visitor) throw new Error('the visitor is not in the world')
  // Every point the checks ask the ground about: the middles and corners of everything boxed.
  const points: [number, number][] = []
  for (const o of scene) {
    if (!o.box) continue
    const { min, max } = o.box
    points.push([(min[0] + max[0]) / 2, (min[2] + max[2]) / 2], [min[0], min[2]], [max[0], min[2]], [min[0], max[2]], [max[0], max[2]])
  }
  const heights = await page.evaluate((pts) => (globalThis as unknown as { __qa: Qa }).__qa.ground(pts), points)
  const at = new Map(points.map((p, i) => [`${p[0]},${p[1]}`, heights[i]!]))
  // The eyes sit 0.7 m above the capsule's middle (apps/viewer/src/player/Player.tsx).
  const start = { eye: [visitor.x, visitor.y + 0.7, visitor.z] as [number, number, number], yaw: visitor.yaw, pitch: visitor.pitch, aspect: viewport[0]! / viewport[1]! }
  return {
    fixture,
    now,
    ...worldFilesFor(dir),
    scene,
    ground: (x, z) => {
      const g = at.get(`${x},${z}`)
      if (!g) throw new Error(`no ground height asked for ${x}, ${z}`)
      return g
    },
    start,
  }
}
