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
