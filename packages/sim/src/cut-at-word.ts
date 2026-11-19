/**
 * A text cut to at most `max` characters at the last space that fits, so a word is never cut in half and a limit is never a reason to
 * turn something down. A comma, semicolon, colon or dash left hanging by the cut is dropped. A single word longer than `max` is cut at
 * `max`. A text that fits comes back with only the spaces at its ends removed. Pure.
 */
export function cutAtWord(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  const head = trimmed.slice(0, max)
  // The cut falls between two words when the next character is a space; otherwise go back to the last space inside the head.
  const at = trimmed[max] === ' ' ? max : head.lastIndexOf(' ')
  const cut = at > 0 ? trimmed.slice(0, at) : head
  return cut.replace(/[\s,;:\-–—]+$/, '')
}

/**
 * A text cut to at most `max` characters so it never ends in the middle of a sentence (issue #378): at the last sentence end that fits
 * (a `.`, `!` or `?`, with any closing quote or bracket, followed by a space), when that keeps at least half of `max`; otherwise at the
 * last whole word with an ellipsis, the ellipsis counted in `max`. A text that fits comes back with only the spaces at its ends removed.
 * Pure.
 */
export function cutAtSentence(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  const ends = /[.!?]["'”’)\]]*(?=\s)/g
  let best = -1
  for (let m = ends.exec(trimmed); m && m.index + m[0].length <= max; m = ends.exec(trimmed)) best = m.index + m[0].length
  if (best >= max / 2) return trimmed.slice(0, best)
  return `${cutAtWord(trimmed, max - 1).replace(/[.!?]+$/, '')}…`
}
