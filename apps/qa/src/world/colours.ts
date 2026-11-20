import type { Page } from 'playwright'
import type { CheckResult } from '../report/finding.ts'
import { MUDDY, hsv } from './picture.ts'

/**
 * A drawn surface whose colour is judged, as `window.__qa.surfaceColours()` lists it (apps/viewer/src/qa/colours.ts): a piece of a
 * room's furniture, an exhibit, or a lit surface of a building whose lamps are off. Glowing things are not listed.
 */
export interface SurfaceColour {
  place: string
  kind: 'furniture' | 'exhibit' | 'unlit'
  what: string
  color: string
  /** Its biggest face, in square meters. */
  area: number
}

/**
 * A prop with less colour (saturation) than this reads as flat grey under a roof, next to the pastel walls; the day walls keep at
 * least 0.24 for the same reason (`INTERIOR.dayWallColour` in the viewer's theme). Only a prop with a face of at least `greyArea`
 * square meters is judged: a thin lamp pole in a pale metal is not a grey box.
 */
const GREY = { saturation: 0.24, area: 0.15 }

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * A colour that reads brown, khaki, olive or beige where a room's shade or the night dims it: the hues and saturation of the
 * night-muddy picture check (`MUDDY`), whatever its value in the light. A bright orange or lemon is fine on a lit window; on a
 * cat bed, a desk or an unlit screen it turns to mud.
 */
const muddy = (hex: string): boolean => {
  const [h, s] = hsv(...rgb(hex))
  return h >= MUDDY.hue[0] && h <= MUDDY.hue[1] && s >= MUDDY.saturation
}
const grey = (c: SurfaceColour): boolean => hsv(...rgb(c.color))[1] < GREY.saturation && c.area >= GREY.area

const byPlace = (list: readonly SurfaceColour[]): Map<string, SurfaceColour[]> => {
  const out = new Map<string, SurfaceColour[]>()
  for (const c of list) out.set(c.place, [...(out.get(c.place) ?? []), c])
  return out
}

const one = (c: SurfaceColour) => `${c.what} in ${c.color} (${c.area.toFixed(2)} square meters)`

/**
 * Furniture, exhibits and unlit lit surfaces in the look's colours (issues 409, 430; steps QW.2). The explorer and the look reviewer
 * saw a grey plinth with a pink top, a brown-orange cat bed, a khaki cube on the Workshop desk and a tan panel over Grown Place 6's
 * arch; the night-muddy picture check counts pixels only at night and over a whole view, so a few brown things by day slip past it.
 * This reads the colours from the geometry: `world.furniture-muddy` for a brown, khaki, olive or beige one, `world.grey-prop` for
 * a large flat-grey one. One finding of each per place.
 */
export function surfaceColourFindings(list: readonly SurfaceColour[], fixture: string): CheckResult[] {
  const out: CheckResult[] = []
  for (const [place, mud] of byPlace(list.filter((c) => muddy(c.color)))) {
    out.push({
      id: 'world.furniture-muddy',
      fingerprint: `world.furniture-muddy|${fixture}|${place}`,
      severity: 'major',
      title: `Brown, khaki or beige things in ${place}`,
      what: `${mud.length} surface${mud.length === 1 ? '' : 's'} of furniture, exhibits or unlit screens and windows ${mud.length === 1 ? 'is' : 'are'} drawn in a warm or olive colour that reads brown, khaki or beige in shade (look.md rule 3). The first: ${one(mud[0]!)}.`,
      causes: 'Small brown and khaki spots in rooms that are otherwise pastel; the place looks dirty or unfinished.',
      evidence: [],
      where: 'apps/viewer/src/world/theme.ts',
      fixKind: 'look',
      fixture,
    })
  }
  for (const [place, flat] of byPlace(list.filter(grey))) {
    out.push({
      id: 'world.grey-prop',
      fingerprint: `world.grey-prop|${fixture}|${place}`,
      severity: 'major',
      title: `Plain grey props in ${place}`,
      what: `${flat.length} large surface${flat.length === 1 ? '' : 's'} of furniture or exhibits ${flat.length === 1 ? 'has' : 'have'} less than ${GREY.saturation * 100}% colour and read${flat.length === 1 ? 's' : ''} as flat grey next to the pastel walls. The first: ${one(flat[0]!)}.`,
      causes: 'The grey blocks look like placeholders nobody painted, so the room feels half-finished.',
      evidence: [],
      where: 'apps/viewer/src/world/theme.ts',
      fixKind: 'look',
      fixture,
    })
  }
  return out
}

/** The judged surface colours of the world open on the page. */
export const collectSurfaceColours = (page: Page): Promise<SurfaceColour[]> => page.evaluate(() => (globalThis as unknown as { __qa: { surfaceColours(): SurfaceColour[] } }).__qa.surfaceColours())
