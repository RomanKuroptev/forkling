import { cutAtWord } from './cut-at-word.ts'
/** Spec v4 6: `self/about.md` is up to 80 words with up to 8 traits as a list, and it changes at most once a week: at least 6 days since the last change, so a review that ran a day late last week does not block this Sunday's (the 30% rule cannot work on 80 words). */
export const ABOUT_MAX_WORDS = 80
export const ABOUT_MAX_TRAITS = 8
export const ABOUT_CHANGE_DAYS = 6
/** Spec v4 6: a caption is up to 40 words (asked for, and cut at a word beyond it); a write whose target is a place, a work or a project. */
export const CAPTION_WORDS = 40
/** Spec v4 6: a reply is asked for at this many words and kept up to the second number (cut at a word beyond it). */
export const REPLY_WORDS = 50
export const REPLY_WORDS_KEPT = 60
/** Spec v4 6: the diary is up to this many lines of up to this many characters, after an optional title line. */
export const DIARY_LINES = 3
export const DIARY_LINE_CHARS = 140
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
 * `about.md`, has no earlier change, so only the word and trait limits apply to it; after that, one change a week (spec v4 6).
 */
export function checkAbout(prev: string, next: string, ctx?: { lastChangeDate: string | null; today: string }): TextCheck {
  const reasons: string[] = []
  if (!next.trim()) reasons.push('about.md is empty')
  if (wordCount(next) > ABOUT_MAX_WORDS) reasons.push(`about.md is over ${ABOUT_MAX_WORDS} words`)
  const traits = next.split(/\r?\n/).filter((l) => /^\s*[-*]\s+\S/.test(l)).length
  if (traits > ABOUT_MAX_TRAITS) reasons.push(`about.md lists ${traits} traits; up to ${ABOUT_MAX_TRAITS}`)
  if (ctx?.lastChangeDate && linesOf(prev).length > 0 && next.trim() && next.trim() !== prev.trim()) {
    const days = (Date.parse(`${ctx.today}T00:00:00Z`) - Date.parse(`${ctx.lastChangeDate}T00:00:00Z`)) / 86_400_000
    if (days < ABOUT_CHANGE_DAYS) reasons.push(`about.md already changed on ${ctx.lastChangeDate}; at most one change a week (at least ${ABOUT_CHANGE_DAYS} days apart)`)
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

/**
 * The diary as it is kept (spec v4 6): the first 3 lines, each cut at a word to 140 characters. A diary that breaks the limits is
 * cut, not thrown away. Empty lines are not lines. Pure.
 */
export function fitDiaryLines(lines: readonly string[]): { lines: string[]; cut: boolean } {
  const kept = lines.map((l) => l.trim()).filter(Boolean)
  const out = kept.slice(0, DIARY_LINES).map((l) => cutAtWord(l, DIARY_LINE_CHARS))
  return { lines: out, cut: kept.length > DIARY_LINES || out.some((l, i) => l !== kept[i]) }
}

/** A text of up to `max` words as it is kept: untouched (line breaks and all) when it fits, cut at the last whole word otherwise. */
export function cutWords(text: string, max: number): { text: string; cut: boolean } {
  const trimmed = text.trim()
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length <= max) return { text: trimmed, cut: false }
  return { text: words.slice(0, max).join(' '), cut: true }
}

/** A caption as it is kept: up to 40 words, cut at a word beyond that (spec v4 6). */
export function fitCaption(text: string): { text: string; cut: boolean } {
  return cutWords(text, CAPTION_WORDS)
}

/** A reply as it is kept: up to 60 words, cut at a word beyond that, with its line breaks kept when it is not cut (spec v4 6). */
export function fitReply(text: string): string {
  return cutWords(text, REPLY_WORDS_KEPT).text
}
