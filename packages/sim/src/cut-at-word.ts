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
