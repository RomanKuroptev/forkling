import type { HostWeek, SourceStats } from '@forkling/schema'
import type { HostStat } from './trip.ts'

/** The weeks of numbers `mind/sources.json` keeps. */
const KEEP_WEEKS = 8
/** A share of the week's reads says little with fewer reads than this. */
const MIN_READS_FOR_SHARE = 10

/** The ISO week of a date `YYYY-MM-DD`, like `2026-W47`. */
export function isoWeek(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const day = new Date(Date.UTC(y, m - 1, d))
  // The Thursday of this week decides which year the week belongs to.
  day.setUTCDate(day.getUTCDate() + 3 - ((day.getUTCDay() + 6) % 7))
  const thursday = day.getTime()
  const first = new Date(Date.UTC(day.getUTCFullYear(), 0, 1))
  if (first.getUTCDay() !== 4) first.setUTCMonth(0, 1 + ((4 - first.getUTCDay() + 7) % 7))
  const week = 1 + Math.ceil((thursday - first.getTime()) / 604_800_000)
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** A trip's numbers added to its week and host. Pure. Only the latest 8 weeks are kept. */
export function addStats(stats: SourceStats, date: string, trip: readonly HostStat[]): SourceStats {
  const weeks: SourceStats['weeks'] = structuredClone(stats.weeks)
  const week = isoWeek(date)
  const hosts = (weeks[week] ??= {})
  for (const s of trip) {
    const old: HostWeek = hosts[s.host] ?? { reads: 0, souvenirs: 0, placed: 0, boring: 0, failures: 0 }
    hosts[s.host] = { reads: old.reads + s.reads, souvenirs: old.souvenirs + s.souvenirs, placed: old.placed, boring: old.boring + s.boring, failures: old.failures + s.failures }
  }
  const keep = Object.keys(weeks).sort().slice(-KEEP_WEEKS)
  return { weeks: Object.fromEntries(keep.map((k) => [k, weeks[k]!])) }
}

/** The host that gave the most of a week's reads and its share, or null when the week has too few reads to say (spec 12.3, "one host"). */
export function topHostShare(stats: SourceStats, date: string): { host: string; share: number } | null {
  const hosts = stats.weeks[isoWeek(date)] ?? {}
  const total = Object.values(hosts).reduce((n, h) => n + h.reads, 0)
  if (total < MIN_READS_FOR_SHARE) return null
  const [host, h] = Object.entries(hosts).sort((a, b) => b[1].reads - a[1].reads)[0]!
  return { host, share: Math.round((h.reads / total) * 1000) / 1000 }
}
