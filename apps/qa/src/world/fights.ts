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
 * this reads it from the geometry, outside and in, so ceilings, floors and backs are caught too, and each sign's painted face
 * against its post (issue 406), and the flat top of a round part (a rug) against the floor (issue 432). One finding per place.
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
      // A sign's face against its post is the sign's geometry (issue 406); a room's part against its floor (a rug, issue 432) is where
      // the inside is laid out; everything else is the building's.
      where: /^the sign /.test(worst.a) || /^the sign /.test(worst.b) ? 'apps/viewer/src/world/signGeometry.ts' : [worst.a, worst.b].includes('a floor') && [worst.a, worst.b].some((w) => /^part /.test(w)) ? 'apps/viewer/src/world/kitGeometry.ts' : 'apps/viewer/src/world/building.ts',
      fixKind: 'look',
      fixture,
    })
  }
  return out
}

/** A door part the building covers, as `window.__qa.coveredDoors()` lists it (apps/viewer/src/qa/fights.ts). */
export interface CoveredDoor {
  place: string
  door: string
  by: string
  gap: number
  area: number
  at: [number, number, number]
}

/**
 * No door hidden by its own wall (the second try at issues 370 and 371, steps QW.2): moving the upper walls' face 1 cm out stopped
 * the fight but covered the door the place file had set flush with that face, leaving an empty frame. A door part whose face lies
 * just behind a face of the building looking the same way is a door a visitor should see and does not. One finding per door.
 */
export function coveredDoorFindings(doors: readonly CoveredDoor[], fixture: string): CheckResult[] {
  return doors.map((d) => ({
    id: 'world.door-covered',
    fingerprint: `world.door-covered|${fixture}|${d.place}/${d.door.replace(/^part /, '').replace(/ .*$/, '')}`,
    severity: 'major' as const,
    title: `A door of ${d.place} is hidden behind its own wall`,
    what: `The face of ${d.door} lies ${(d.gap * 100).toFixed(1)} cm behind ${d.by}, over ${d.area.toFixed(2)} square meters at ${m(d.at)}.`,
    causes: 'A visitor sees an empty frame, or bare wall, where the place has a door.',
    evidence: [],
    where: 'apps/viewer/src/world/building.ts',
    fixKind: 'look' as const,
    fixture,
  }))
}

/** The doors the building covers in the world open on the page. */
export const collectCoveredDoors = (page: Page): Promise<CoveredDoor[]> => page.evaluate(() => (globalThis as unknown as { __qa: { coveredDoors(): CoveredDoor[] } }).__qa.coveredDoors())

/** The fights of the world open on the page. */
export const collectFights = (page: Page): Promise<SurfaceFight[]> => page.evaluate(() => (globalThis as unknown as { __qa: { fights(): SurfaceFight[] } }).__qa.fights())
