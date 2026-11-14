/**
 * A place keeps the last 50 lines of its history (spec 5.1); older ones stay in git. The one exception is the line that says who had
 * the idea and who built it (spec 10.3), the oldest `found` line: without it the honesty line on a place's page and its history would
 * lose it after a few weeks of tending. Returns a new list and never changes the one it is given.
 */
export function capHistory<T extends { verb: string }>(history: readonly T[], max: number): T[] {
  if (history.length <= max) return [...history]
  const newest = history.slice(-max)
  const founding = history.find((h) => h.verb === 'found')
  if (!founding || newest.includes(founding)) return newest
  return [founding, ...history.slice(-(max - 1))]
}
