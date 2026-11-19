import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'

/** Exhibits that are shown on a screen: the work screens say what they show themselves. */
const ON_SCREENS = new Set(['work', 'project'])

/**
 * No blank exhibits (issues 347, 355, steps QW.2): every exhibit in the scene list that is not a work on a screen must say what its
 * card shows, and show something: a picture, or words. A card that shows nothing, or an exhibit with no card at all, is the blank
 * box the world explorer found, where a visitor cannot see what Merge chose to keep.
 */
export function exhibitFindings(scene: readonly SceneObject[], fixture: string): CheckResult[] {
  const out: CheckResult[] = []
  for (const o of scene) {
    if (o.kind !== 'exhibit' || ON_SCREENS.has(o.exhibitKind ?? '')) continue
    const blank = !o.card || o.card.shows === 'nothing' || (o.card.shows !== 'picture' && o.card.text.trim() === '')
    if (!blank) continue
    out.push({
      id: 'world.exhibit-blank',
      fingerprint: `world.exhibit-blank|${fixture}|${o.id}`,
      severity: 'major',
      title: `The exhibit ${o.id} shows nothing: no words and no picture`,
      what: o.card ? `Its card shows nothing (${o.exhibitKind ?? 'exhibit'} "${(o.name ?? '').slice(0, 60)}").` : `The scene list gives it no card, so it is drawn as a plain box (${o.exhibitKind ?? 'exhibit'}).`,
      causes: 'A visitor sees a blank box where Merge put something it chose to keep.',
      evidence: [],
      ...(o.place ? { where: `places/${o.place}.json` } : {}),
      fixKind: 'look',
      fixture,
    })
  }
  return out
}
