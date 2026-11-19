import { newSince } from '@forkling/sim'
import type { CheckResult } from '../report/finding.ts'

// Imgflip freshness (audit spec 9.4): get_memes is close to an all-time top list, so the harness counts how many formats
// are new against earlier lists. The history comes from earlier runs (an Actions artefact) and, where those are missing,
// from Merge's own record (each morning's starting points hold the top formats it was offered that day).

export interface HistoryEntry {
  date: string
  /** Format ids in rank order: all 100 from a run, the top few from a back-filled morning list. */
  ids: string[]
  /** Rebuilt from Merge's morning list, not measured by a run. */
  backfilled?: true
}

export interface ImgflipHistory {
  version: 1
  /** One per day, oldest first, the last 30 days kept. */
  entries: HistoryEntry[]
}

const KEEP_DAYS = 30
export const STALE_DAYS = 14

export const daysBefore = (date: string, n: number): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10)
}

const IMGFLIP_PAGE = /^https:\/\/imgflip\.com\/meme\/(\d{1,20})$/

/**
 * History rebuilt from Merge's morning lists (`mind/state.json` over git history), one entry per day with the Imgflip
 * formats it was offered, in rank order. A day with none (Imgflip not read that morning, or no list kept) is left out,
 * never guessed.
 */
export function backfillImgflip(offered: readonly { date: string; urls: readonly string[] }[] | null): HistoryEntry[] {
  return (offered ?? []).flatMap((o) => {
    const ids = o.urls.flatMap((u) => IMGFLIP_PAGE.exec(u)?.[1] ?? [])
    return ids.length > 0 ? [{ date: o.date, ids, backfilled: true as const }] : []
  })
}

/** The artefact's history and the back-fill together, one entry per date: a run's own list wins over a back-filled one. */
export function mergeHistory(artefact: ImgflipHistory | null, backfill: readonly HistoryEntry[]): ImgflipHistory | null {
  const byDate = new Map<string, HistoryEntry>()
  for (const e of backfill) byDate.set(e.date, e)
  for (const e of artefact?.entries ?? []) byDate.set(e.date, e)
  if (byDate.size === 0) return null
  return { version: 1, entries: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) }
}

// Like with like: a back-filled entry holds only the top few, so today's list is cut to as many.
const newAgainst = (entry: HistoryEntry, ids: readonly string[]) => newSince([entry.ids], ids.slice(0, entry.ids.length))
const topOf = (entry: HistoryEntry, ids: readonly string[]) => Math.min(entry.ids.length, ids.length)
const describe = (e: HistoryEntry) => (e.backfilled ? `${e.date} (back-filled from Merge's morning list, top ${e.ids.length})` : e.date)

/**
 * How many of today's formats are new since the last entry (info), and whether nothing is new against the list of two
 * weeks ago or more (major: Merge's memes cannot follow the pulse with it). No history yet is info, never a pass.
 */
export function checkImgflipFreshness(history: ImgflipHistory | null, today: string, ids: readonly string[]): { findings: CheckResult[]; history: ImgflipHistory } {
  const earlier = (history?.entries ?? []).filter((e) => e.date < today)
  const next: ImgflipHistory = { version: 1, entries: [...earlier, { date: today, ids: [...ids] }].filter((e) => e.date > daysBefore(today, KEEP_DAYS)) }
  const base = { evidence: ['qa-out/imgflip-history.json'], where: 'apps/mind/src/web/sources/records.ts' }
  const last = earlier.at(-1)
  if (!last)
    return {
      history: next,
      findings: [
        {
          ...base,
          id: 'sources.imgflip-freshness',
          fingerprint: 'sources.imgflip-freshness',
          severity: 'info',
          title: 'Imgflip freshness: no history yet',
          what: `There is no history yet (no earlier run's list, and no Imgflip formats in Merge's morning lists), so freshness is not known. Measured from today: the first two-week verdict is due on ${daysBefore(today, -STALE_DAYS)}.`,
          causes: 'Nothing is known about whether the list moves until later runs.',
          fixKind: 'code',
        },
      ],
    }
  const ref = earlier.filter((e) => e.date <= daysBefore(today, STALE_DAYS)).at(-1)
  const due = ref ? '' : ` The history starts on ${earlier[0]!.date}, so the first two-week verdict is due on ${daysBefore(earlier[0]!.date, -STALE_DAYS)}.`
  const fresh = newAgainst(last, ids)
  const findings: CheckResult[] = [
    {
      ...base,
      id: 'sources.imgflip-freshness',
      fingerprint: 'sources.imgflip-freshness',
      severity: 'info',
      title: `Imgflip freshness: ${fresh.length} new formats since ${last.date}`,
      what: `${fresh.length} of the top ${topOf(last, ids)} formats in today's ranking were not in the list of ${describe(last)}.${due}`,
      causes: 'Measured for the report.',
      fixKind: 'code',
    },
  ]
  if (ref && newAgainst(ref, ids).length === 0)
    findings.push({
      ...base,
      id: 'sources.imgflip-stale',
      fingerprint: 'sources.imgflip-stale',
      severity: 'major',
      title: "Imgflip's meme list has not changed in two weeks",
      what: `No format in today's top ${topOf(ref, ids)} is new since ${describe(ref)}. get_memes is close to an all-time top list. Recommended: Roman picks a pulse source that moves (see the promised-missing findings: Lemmy memes needs a new trial, Mastodon and Show HN are best dropped).`,
      causes: "Merge's memes cannot follow what is going round now: the same formats every morning.",
      fixKind: 'roman',
    })
  return { findings, history: next }
}
