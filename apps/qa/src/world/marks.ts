import type { Page } from 'playwright'
import type { CheckResult } from '../report/finding.ts'

/** A thin mark of neglect hanging in a room that does not glow, as `window.__qa.thinMarks()` lists it (apps/viewer/src/qa/marks.ts). */
export interface ThinMark {
  place: string
  thickness: number
  up: number
  at: [number, number, number]
}

const m = (v: readonly number[]) => v.map((n) => n.toFixed(1)).join(', ')

/**
 * No thin, unlit marks hanging in a room (issue 336; steps QW.2): a mark of neglect (spec 4.4) that hangs above the floor and is
 * thinner than 0.15 m must be a neon line (look.md). A pale slab 2 cm thick under the ceiling reads as a plank floating with
 * nothing holding it; the explorer saw it, this reads it from the geometry. One finding per place.
 */
export function thinMarkFindings(marks: readonly ThinMark[], fixture: string): CheckResult[] {
  const byPlace = new Map<string, ThinMark[]>()
  for (const mark of marks) byPlace.set(mark.place, [...(byPlace.get(mark.place) ?? []), mark])
  return [...byPlace].map(([place, list]) => ({
    id: 'world.thin-mark-hangs',
    fingerprint: `world.thin-mark-hangs|${fixture}|${place}`,
    severity: 'major' as const,
    title: `Thin pale pieces hang in the air in ${place}`,
    what: `${list.length} mark${list.length === 1 ? '' : 's'} of neglect hang${list.length === 1 ? 's' : ''} in a room, thinner than 0.15 m and not glowing. The first: ${list[0]!.thickness.toFixed(2)} m thick, ${list[0]!.up.toFixed(1)} m above the floor, at ${m(list[0]!.at)}.`,
    causes: 'A visitor sees planks floating under the ceiling with nothing holding them, and the room reads as broken.',
    evidence: [],
    where: 'apps/viewer/src/world/exhibitGeometry.ts',
    fixKind: 'look' as const,
    fixture,
  }))
}

/** The thin hanging marks of the world open on the page. */
export const collectThinMarks = (page: Page): Promise<ThinMark[]> => page.evaluate(() => (globalThis as unknown as { __qa: { thinMarks(): ThinMark[] } }).__qa.thinMarks())
