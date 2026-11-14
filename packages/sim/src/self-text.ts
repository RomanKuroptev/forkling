/** Spec 9.2: `self/about.md` is up to 300 words with up to 8 traits as a list, and a week changes at most 30% of its lines. */
export const ABOUT_MAX_WORDS = 300
export const ABOUT_MAX_TRAITS = 8
export const ABOUT_MAX_CHANGE = 0.3
/** Spec 9.7: `self/page.md` is up to 300 words, with no link and no HTML, and changes at most once a day. */
export const PAGE_MAX_WORDS = 300

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length
const linesOf = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

/**
 * How much of `prev` the new version changes, 0 to 1: the larger of the lines taken out and the lines put in, over the old line
 * count. Blank lines and line endings do not count. A first version has nothing to compare, so any text is a full change.
 */
export function aboutChange(prev: string, next: string): number {
  const a = linesOf(prev)
  const b = linesOf(next)
  if (a.length === 0) return b.length > 0 ? 1 : 0
  const inB = new Set(b)
  const inA = new Set(a)
  const removed = a.filter((l) => !inB.has(l)).length
  const added = b.filter((l) => !inA.has(l)).length
  return Math.max(removed, added) / a.length
}

export interface TextCheck {
  ok: boolean
  reasons: string[]
}

/**
 * The code limits on `about.md` (the claims-human check is separate, in the mind). The first version, written when there is no
 * `about.md`, has nothing to be compared with, so only the word and trait limits apply to it; the 30% limit starts with the second.
 */
export function checkAbout(prev: string, next: string): TextCheck {
  const reasons: string[] = []
  if (!next.trim()) reasons.push('about.md is empty')
  if (wordCount(next) > ABOUT_MAX_WORDS) reasons.push(`about.md is over ${ABOUT_MAX_WORDS} words`)
  const traits = next.split(/\r?\n/).filter((l) => /^\s*[-*]\s+\S/.test(l)).length
  if (traits > ABOUT_MAX_TRAITS) reasons.push(`about.md lists ${traits} traits; up to ${ABOUT_MAX_TRAITS}`)
  if (linesOf(prev).length > 0 && next.trim()) {
    const change = aboutChange(prev, next)
    if (change > ABOUT_MAX_CHANGE + 1e-9) reasons.push(`${Math.round(change * 100)}% of the lines changed; a week may change at most 30%`)
  }
  return { ok: reasons.length === 0, reasons }
}

const TLDS = 'com|org|net|io|dev|app|co|uk|se|de|ai|me|info|xyz|gov|edu|ly|gg|tv|html?'
const LINKS: readonly RegExp[] = [/:\/\//, /\bwww\./i, /\]\(/, /\S@\S+\.\S/, new RegExp(`\\b[a-z0-9-]+\\.(${TLDS})\\b`, 'i')]
const HTML: readonly RegExp[] = [/<\/?[a-z!?][^>]*/i, /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i]

export interface PageCheck extends TextCheck {
  /** Whether the text differs from the page that is there. An unchanged page may be sent again. */
  changed: boolean
}

export function checkPage(text: string, ctx: { prev: string; lastChangeDate: string | null; today: string }): PageCheck {
  const reasons: string[] = []
  const changed = text.trim() !== ctx.prev.trim()
  if (wordCount(text) > PAGE_MAX_WORDS) reasons.push(`the page is over ${PAGE_MAX_WORDS} words`)
  if (LINKS.some((r) => r.test(text))) reasons.push('the page has a link')
  if (HTML.some((r) => r.test(text))) reasons.push('the page has HTML')
  if (changed && ctx.lastChangeDate === ctx.today) reasons.push('the page already changed today; at most one change a day')
  return { ok: reasons.length === 0, reasons, changed }
}
