import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'

/**
 * Every work or project on a screen shows something of it: its picture or its title (look.md: a screen shows the work installed
 * on it). The viewer says what each drawn screen shows (`shows` in `__qa.scene()`); a screen that shows nothing, or a viewer that
 * does not say, is a plain lit panel. Added for the explorer's finding that the Workshop's four screens were plain blue (issues
 * 352, 341, 362; audit QW.2).
 */
export function screenFindings(fixture: string, scene: readonly SceneObject[]): CheckResult[] {
  const out: CheckResult[] = []
  for (const o of scene) {
    if (!o.visible || o.slot !== 'screen' || (o.exhibitKind !== 'work' && o.exhibitKind !== 'project')) continue
    if (o.shows === 'picture' || o.shows === 'title') continue
    out.push({
      id: 'world.screen-blank',
      fingerprint: `world.screen-blank|${fixture}|${o.id}`,
      severity: 'major',
      title: `The screen ${o.id} shows a plain panel, not its work`,
      what: `${o.ref ?? 'Its work'} is installed on this screen, but the screen is drawn ${o.shows === 'nothing' ? 'with no picture and no title' : 'without saying what it shows'}.`,
      causes: 'A visitor sees a coloured box and cannot tell which work it is or what it does.',
      evidence: [],
      fixKind: 'look',
      fixture,
      ...(o.place ? { where: `places/${o.place}.json` } : {}),
    })
  }
  return out
}

/** A work screen's panel centre must be at least this high above its room's floor (meters): a visitor reads it without looking down. */
export const SCREEN_LOW = 1.1

/**
 * Every work or project on a screen is drawn at a height a standing visitor reads it (look.md: the works are on show), its panel's
 * centre at least `SCREEN_LOW` above its room's floor. Added for the explorer's finding that the Workshop's four screens stood on
 * the floor at knee height, below the window sills (issue 431; audit QW.2). The room's floor is the bottom of its box in the scene.
 */
export function screenHeightFindings(fixture: string, scene: readonly SceneObject[]): CheckResult[] {
  const out: CheckResult[] = []
  const rooms = new Map(scene.flatMap((o) => (o.kind === 'room' && o.box ? [[o.id, o.box.min[1]] as const] : [])))
  for (const o of scene) {
    if (!o.visible || !o.box || !o.at || o.slot !== 'screen' || (o.exhibitKind !== 'work' && o.exhibitKind !== 'project')) continue
    const floor = rooms.get(o.at.split('/').slice(0, 2).join('/'))
    if (floor === undefined) continue
    const up = (o.box.min[1] + o.box.max[1]) / 2 - floor
    if (up >= SCREEN_LOW - 1e-3) continue
    out.push({
      id: 'world.screen-low',
      fingerprint: `world.screen-low|${fixture}|${o.id}`,
      severity: 'major',
      title: `The screen ${o.id} stands at knee height`,
      what: `${o.ref ?? 'Its work'} is on a screen whose middle is ${up.toFixed(2)} m above the floor of its room; a work screen should be at least ${SCREEN_LOW} m up.`,
      causes: "A visitor has to look down at the floor to see Merge's works.",
      evidence: [],
      fixKind: 'look',
      fixture,
      ...(o.place ? { where: `places/${o.place}.json` } : {}),
    })
  }
  return out
}
