/**
 * Who had a place's idea and who built it (spec 10.3). The engine writes one `found` line when a place is founded, in one of these
 * three phrasings, and the site shows the newest `found` line of a place: the build that stands now. A place file that arrives
 * with a `found` line of its own does not get to say who built it: the engine drops it and writes its own.
 */
export const ROMAN_BUILT_LINE = 'Asked for by Merge, built by Roman with Claude Code.'
export const KIT_BUILT_LINE = 'Founded by Merge, built by Merge from the kit.'
/** The kit line before spec v4, when a found was a request to Roman; places that carry it still count as kit-built. */
export const LEGACY_KIT_BUILT_LINE = 'Asked for by Merge, built by Merge from the kit.'
export const GIFT_LINE = 'A gift from Roman.'

interface HistoryLine {
  at: string
  verb: string
  summary: string
}

/** The newest `found` line of a place's history, whatever the order of the list, or nothing when no one wrote it down. */
export function latestFound<T extends HistoryLine>(history: readonly T[]): T | undefined {
  let newest: T | undefined
  for (const h of history) if (h.verb === 'found' && (!newest || Date.parse(h.at) >= Date.parse(newest.at))) newest = h
  return newest
}
