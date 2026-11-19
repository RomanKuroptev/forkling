// Pure measures of where reading came from (audit spec 9.4): numbers in, numbers out. The harness reads the files;
// these only count.

export interface Share {
  key: string
  count: number
  share: number
}

/** Each key's share of the total, biggest first (ties by name). Keys counted 0 are left out. */
export function shares(counts: Readonly<Record<string, number>>): Share[] {
  const total = Object.values(counts).reduce((n, c) => n + c, 0)
  if (total <= 0) return []
  return Object.entries(counts)
    .filter(([, c]) => c > 0)
    .map(([key, count]) => ({ key, count, share: count / total }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

/** The biggest share, or null when nothing was counted. */
export const topShare = (counts: Readonly<Record<string, number>>): Share | null => shares(counts)[0] ?? null

/** part / whole, or null when the whole is 0 (nothing to measure is not the same as none). */
export const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null)

/** The items of the current list that were in none of the earlier lists, once each, in the current list's order. */
export function newSince(earlier: readonly (readonly string[])[], current: readonly string[]): string[] {
  const seen = new Set(earlier.flat())
  const out: string[] = []
  for (const x of current) {
    if (seen.has(x)) continue
    seen.add(x)
    out.push(x)
  }
  return out
}
