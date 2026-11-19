import type { CheckResult } from '../report/finding.ts'
import type { SceneObject } from './open.ts'

/**
 * Every tile on a gallery wall shows its own work: its picture or its title (look.md: a screen shows the work on it). The viewer
 * lists each finished work at its tile (`slot: 'gallery-wall'`) and says what the tile is painted with (`shows`); a tile that
 * shows nothing, or a viewer that does not say, is a plain coloured square. Added after the look reviewer blocked a gallery
 * wall of identical blue tiles (issues 291, 307; audit QW.2). One finding a wall, so a wall of 75 blank tiles is one issue.
 */
export function galleryFindings(fixture: string, scene: readonly SceneObject[]): CheckResult[] {
  const blank = new Map<string, SceneObject[]>()
  for (const o of scene) {
    if (!o.visible || o.slot !== 'gallery-wall') continue
    if (o.shows === 'picture' || o.shows === 'title') continue
    const wall = o.id.split('/').slice(0, 2).join('/')
    blank.set(wall, [...(blank.get(wall) ?? []), o])
  }
  return [...blank].map(([wall, tiles]) => ({
    id: 'world.gallery-blank',
    fingerprint: `world.gallery-blank|${fixture}|${wall}`,
    severity: 'major',
    title: `The gallery wall ${wall} shows plain tiles, not its works`,
    what: `${tiles.length} tile${tiles.length === 1 ? '' : 's'} on it show${tiles.length === 1 ? 's' : ''} no picture and no title: ${tiles.slice(0, 5).map((t) => t.ref ?? t.id).join(', ')}${tiles.length > 5 ? ', ...' : ''}.`,
    causes: 'A visitor sees a wall of coloured squares and cannot tell which work is which.',
    evidence: [],
    fixKind: 'look',
    fixture,
    ...(tiles[0]?.place ? { where: `places/${tiles[0].place}.json` } : {}),
  }))
}
