import type { BubbleLine } from './thoughts.ts'

/** The pop-up over Merge (merge.exe): at most about this many characters a line, and this many lines, longer text cut with `...`. */
export const POPUP_CHARS = 30
export const POPUP_LINES = 4

const cut = (text: string, max: number): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(0, max - 3)).trimEnd()}...`
}

/**
 * The lines of the pop-up fitted to 4 lines of about 30 characters: what it wants, what it is doing now and why get one line each, and
 * what is left over (a missing line) goes to the step and the reason. Asleep it shows `zzz`. Plain text only.
 */
export function fitPopup(lines: readonly BubbleLine[]): BubbleLine[] {
  if (lines.some((l) => l.kind === 'sleep')) return [{ kind: 'sleep', text: 'zzz' }]
  // The room each line may take, in lines: more for the step and the reason when there is no goal.
  const has = (k: BubbleLine['kind']) => lines.some((l) => l.kind === k)
  const room: Record<BubbleLine['kind'], number> = { goal: 1, step: has('step') ? 2 : 0, reason: 1, sleep: 0 }
  if (!has('goal')) room.step += 1
  else if (!has('step')) room.reason += 1
  return lines.map((l) => ({ kind: l.kind, text: cut(l.text, POPUP_CHARS * Math.max(1, room[l.kind])) }))
}

export interface Box {
  width: number
  height: number
}

/**
 * Where to put the pop-up so it stays on the screen: `x` is the middle of the pop-up and `y` its bottom edge, in pixels from the top left
 * of the viewport (what the projection of the anchor gives). It never goes past the left, right or top edge, and keeps clear of the
 * taskbar along the bottom.
 */
export function clampPopup(x: number, y: number, popup: Box, viewport: Box, margin = 8, bottomBar = 40): [number, number] {
  const minX = popup.width / 2 + margin
  const maxX = Math.max(minX, viewport.width - popup.width / 2 - margin)
  const minY = popup.height + margin
  const maxY = Math.max(minY, viewport.height - bottomBar - margin)
  return [Math.min(maxX, Math.max(minX, x)), Math.min(maxY, Math.max(minY, y))]
}
