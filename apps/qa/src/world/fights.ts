import type { Page } from 'playwright'
import type { CheckResult } from '../report/finding.ts'

/** Two box surfaces of a place that fight, as `window.__qa.fights()` lists them (apps/viewer/src/qa/fights.ts). */
export interface SurfaceFight {
  place: string
  a: string
  b: string
  area: number
  at: [number, number, number]
  normal: [number, number, number]
}

/** A fight over at least this many square meters is plain to see from where a visitor walks: major, else minor. */
const MAJOR_AREA = 0.25

const m = (v: readonly number[]) => v.map((n) => n.toFixed(1)).join(', ')
const facing = (n: readonly number[]) => (n[1]! > 0.5 ? 'facing up' : n[1]! < -0.5 ? 'facing down (a ceiling or an underside)' : 'standing upright')

/**
 * No surfaces that fight (issues 350, 353, 335, 337, 364, 370, 371; steps QW.2): two faces of a place's boxes in one plane,
 * facing the same way, in different colours. The depth buffer cannot tell which is in front, so a visitor sees stripes, stair
 * steps or bits of pattern that shimmer as they move. The 1 mm flicker picture (`world.flicker`) sees this only at the fronts;
 * this reads it from the geometry, outside and in, so ceilings, floors and backs are caught too. One finding per place.
 */
export function fightFindings(fights: readonly SurfaceFight[], fixture: string): CheckResult[] {
  const byPlace = new Map<string, SurfaceFight[]>()
  for (const f of fights) byPlace.set(f.place, [...(byPlace.get(f.place) ?? []), f])
  const out: CheckResult[] = []
  for (const [place, list] of byPlace) {
    const worst = [...list].sort((p, q) => q.area - p.area)[0]!
    const total = list.reduce((s, f) => s + f.area, 0)
    out.push({
      id: 'world.surfaces-fight',
      fingerprint: `world.surfaces-fight|${fixture}|${place}`,
      severity: worst.area >= MAJOR_AREA ? 'major' : 'minor',
      title: `Surfaces fight in ${place}: two faces drawn in one plane`,
      what: `${list.length} pair${list.length === 1 ? '' : 's'} of faces share a plane (${total.toFixed(2)} square meters in all). The biggest: ${worst.a} and ${worst.b}, ${facing(worst.normal)}, ${worst.area.toFixed(2)} square meters at ${m(worst.at)}.`,
      causes: 'Two surfaces fight: a visitor sees stripes or stair steps that shimmer as they move.',
      evidence: [],
      where: 'apps/viewer/src/world/building.ts',
      fixKind: 'look',
      fixture,
    })
  }
  return out
}

/** The fights of the world open on the page. */
export const collectFights = (page: Page): Promise<SurfaceFight[]> => page.evaluate(() => (globalThis as unknown as { __qa: { fights(): SurfaceFight[] } }).__qa.fights())
