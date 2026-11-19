/**
 * The second line of a place's sign, under its name (issues 359, 363, 366). It is the sign text Merge wrote (`exterior.sign`) when
 * that says something of its own. A sign text that only repeats the place's name (a found writes the name there), or that names
 * another place, is not shown: the line then says what the place is for, from the start of Merge's own `purpose`, and when that
 * does not work either, the day it was founded. A closed place says why it is closed. The viewer paints this line and the audit
 * harness checks it, so both read it from here. Pure.
 */
export interface SignLinePlace {
  id: string
  name: string
  purpose: string
  founded: string
  exterior: { sign: string }
  state: { closed: { reason: string } | null }
}

/** The room the line has on a sign: two lines of this many characters (the sign's smallest text, `apps/viewer` signGeometry). */
export const SIGN_LINE = { perLine: 28, lines: 2 } as const

const squash = (s: string) => s.trim().replace(/\s+/g, ' ')
/** Lower case, letters and digits only, one space between words. */
const words = (s: string) => squash(s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' '))
const containsWords = (text: string, part: string) => part !== '' && ` ${text} `.includes(` ${part} `)

/** Words onto lines of at most `max` characters; a word longer than a line is broken. The same wrap the sign's painter uses. */
export function wrapWords(text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (let word of squash(text).split(' ')) {
    if (word === '') continue
    while (word.length > max) {
      if (line) lines.push(line)
      line = ''
      lines.push(word.slice(0, max))
      word = word.slice(max)
    }
    if (line === '') line = word
    else if (line.length + 1 + word.length <= max) line += ` ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

const fits = (text: string) => text !== '' && wrapWords(text, SIGN_LINE.perLine).length <= SIGN_LINE.lines

/**
 * What is wrong with a line shown under a place's name: it repeats the name (the whole name, or the name cut short), or it names
 * another place. Null when it is neither.
 */
export function signLineProblem(line: string, place: Pick<SignLinePlace, 'id' | 'name'>, places: readonly Pick<SignLinePlace, 'id' | 'name'>[]): 'repeats-name' | { names: string } | null {
  const s = words(line)
  if (s === '') return null
  const name = words(place.name)
  if (containsWords(s, name) || (s.length >= 3 && name.startsWith(s))) return 'repeats-name'
  for (const other of places) if (other.id !== place.id && containsWords(s, words(other.name))) return { names: other.id }
  return null
}

/** Small words a phrase can stop before and still read whole ("a room for the toy | and its lamps"). Grammar, not topics. */
const JOINERS = new Set(['and', 'or', 'but', 'with', 'where', 'which', 'that', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'so', 'as', 'when', 'while', 'from'])

/** The start of a purpose that fits the sign: its first sentence, else its first clauses, else a phrase cut before a small joining word. */
function purposeLine(purpose: string): string {
  const sentence = squash(purpose).split(/(?<=[.!?])\s/)[0] ?? ''
  const clean = (s: string) => s.replace(/[\s.!?,;:\-–—]+$/, '')
  if (fits(clean(sentence))) return clean(sentence)
  // Clauses: the longest run of whole clauses from the start that fits.
  const bounds = [...sentence.matchAll(/[:;,–—](?=\s)|\s-(?=\s)/g)].map((m) => m.index!)
  for (let k = bounds.length - 1; k >= 0; k--) {
    const head = clean(sentence.slice(0, bounds[k]))
    if (fits(head) && head.split(' ').length >= 2) return head
  }
  // A phrase: whole words, stopping before a joining word when one is in reach.
  const all = sentence.split(' ')
  let best = ''
  let plain = ''
  for (let n = 1; n <= all.length; n++) {
    const head = clean(all.slice(0, n).join(' '))
    if (!fits(head)) break
    plain = head
    const next = all[n]?.toLowerCase()
    if (n >= 3 && next !== undefined && JOINERS.has(next)) best = head
  }
  return best || plain
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const foundedLine = (founded: string) => {
  const [y, m, d] = founded.split('-').map(Number)
  return `Founded ${d} ${MONTHS[(m ?? 1) - 1] ?? ''} ${y}`
}

/** The line under a place's name on its sign. Never the name again, never another place's name, always within two sign lines. */
export function signLine(place: SignLinePlace, places: readonly Pick<SignLinePlace, 'id' | 'name'>[]): string {
  if (place.state.closed) return squash(`Closed: ${place.state.closed.reason}`)
  const own = squash(place.exterior.sign)
  if (own !== '' && fits(own) && signLineProblem(own, place, places) === null) return own
  const purpose = purposeLine(place.purpose)
  if (purpose !== '' && signLineProblem(purpose, place, places) === null) return purpose
  return foundedLine(place.founded)
}
