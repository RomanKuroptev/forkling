import type { Browser } from 'playwright'
import type { CheckResult } from '../report/finding.ts'
import { openWorld, type SceneObject } from './open.ts'

type Vec3 = [number, number, number]

/** Points spread over a box: its middle and four points a quarter in from its sides, at half height. */
export function samplePoints(box: { min: Vec3; max: Vec3 }): Vec3[] {
  const at = (fx: number, fy: number, fz: number): Vec3 => [box.min[0] + (box.max[0] - box.min[0]) * fx, box.min[1] + (box.max[1] - box.min[1]) * fy, box.min[2] + (box.max[2] - box.min[2]) * fz]
  return [at(0.5, 0.5, 0.5), at(0.25, 0.5, 0.5), at(0.75, 0.5, 0.5), at(0.5, 0.25, 0.5), at(0.5, 0.75, 0.5)]
}

/** The share of Merge's points on the picture that an overlay (the stick, a button, a panel) covers; null when Merge is not on the picture. */
export function coveredShare(hits: { visible: boolean; covered: boolean }[]): number | null {
  const seen = hits.filter((h) => h.visible)
  return seen.length === 0 ? null : seen.filter((h) => h.covered).length / seen.length
}

/** More than this share of Merge under the overlay is a finding. */
export const COVER_LEVEL = 0.4

/**
 * On a phone (390x844, touch controls on) at the arrival view, the overlay must not cover Merge (audit spec 7.4). What is
 * on top at each of Merge's points is asked from the page: anything but the 3D canvas covers it (the centre cursor and
 * labels let clicks through and do not count).
 */
export async function phoneCoversMerge(browser: Browser, url: string, opts: { fixture: string; now: string }): Promise<CheckResult[]> {
  const page = await openWorld(browser, url, { now: opts.now, phone: true })
  try {
    const hits = await page.evaluate(async (pointsOf) => {
      const g = globalThis as unknown as {
        __qa: { step(ms: number): Promise<void>; scene(): SceneObject[]; project(p: Vec3[]): { x: number; y: number; visible: boolean }[] }
        document: { elementFromPoint(x: number, y: number): { tagName: string } | null }
      }
      await g.__qa.step(1000)
      const merge = g.__qa.scene().find((o) => o.kind === 'merge')
      if (!merge?.box) return []
      const points = (0, eval)(`(${pointsOf})`)(merge.box) as Vec3[]
      return g.__qa.project(points).map((p) => ({ visible: p.visible, covered: p.visible && g.document.elementFromPoint(p.x, p.y)?.tagName !== 'CANVAS' }))
    }, samplePoints.toString())
    const share = coveredShare(hits)
    if (share === null || share <= COVER_LEVEL) return []
    const shot = `${opts.fixture}-phone.png`
    return [
      {
        id: 'world.phone-covers-merge',
        fingerprint: `world.phone-covers-merge|${opts.fixture}`,
        severity: 'major',
        title: 'On a phone, the controls cover Merge',
        what: `At the arrival view on a 390x844 phone, ${(share * 100).toFixed(0)}% of Merge is under the overlay (the stick, a button or a panel). Picture: ${shot}.`,
        causes: 'A visitor on a phone arrives and sees the controls where Merge should be.',
        evidence: [],
        fixKind: 'look',
        fixture: opts.fixture,
      },
    ]
  } finally {
    await page.close()
  }
}
