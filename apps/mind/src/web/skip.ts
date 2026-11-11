import type { Item } from './item.ts'
import { wordCount } from './clean.ts'

export const MIN_PAGE_WORDS = 300
/** A thread on a voices site is short but has a lot in it (the W0 voice test), so its floor is lower. */
export const MIN_VOICES_WORDS = 120
export const MIN_RECORD_WORDS = 40

/**
 * Why an item is not worth a read call, or null (spec 6.6). Decided in code before any model call, and a skipped item does
 * not count against the day's reads. `readRecently` says whether a URL was read in the last 30 days.
 */
export function skipReason(item: Item, readRecently: (url: string) => boolean = () => false): string | null {
  if (readRecently(item.url)) return 'read in the last 30 days'
  if (/\(disambiguation\)\s*$/i.test(item.title) || /\b(may|can) (also )?refer to:?/i.test(item.text.slice(0, 300))) return 'a disambiguation page'
  if (/^lists? of /i.test(item.title)) return 'a list page'
  if (!readable(item)) {
    const words = wordCount(item.text)
    if (item.kind === 'record') return `a record with no image and under ${MIN_RECORD_WORDS} words (${words})`
    const floor = item.tier === 'voices' ? MIN_VOICES_WORDS : MIN_PAGE_WORDS
    return `a page under ${floor} words (${words})`
  }
  return null
}

/** Enough to react to: a page has its word floor, a record has a picture or 40 words (spec 6.5 and 6.6). */
export function readable(item: Item): boolean {
  const words = wordCount(item.text)
  if (item.kind === 'page') return words >= (item.tier === 'voices' ? MIN_VOICES_WORDS : MIN_PAGE_WORDS)
  return item.images.length > 0 || words >= MIN_RECORD_WORDS
}
