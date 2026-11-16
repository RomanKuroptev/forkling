/**
 * A place keeps the last 50 lines of its history (spec 5.1); older ones stay in git. Some lines are kept past the cut because
 * something reads them later:
 * - every `found` line, which says who had the idea and who built it (spec 10.3): the plain version the fallback made, and the
 *   full one Roman built after it. Without them the honesty line on a place's page would be lost after a few weeks of tending.
 * - the newest `expand` line, which is what the expand gate counts "kept since the place last changed size" from (spec 2.5,
 *   `lastSizeChange`). Cut after 50 tends, the gate would fall back to the founding line and let more souvenirs count.
 * The rest are the newest lines. The list keeps the order it was given, a max of `max` lines is never exceeded, and cutting a
 * cut history changes nothing. Returns a new list and never changes the one it is given.
 */
export function capHistory<T extends { verb: string }>(history: readonly T[], max: number): T[] {
  if (max <= 0) return []
  if (history.length <= max) return [...history]

  const mustKeep = new Set<number>()
  history.forEach((h, i) => {
    if (h.verb === 'found') mustKeep.add(i)
  })
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.verb === 'expand') {
      mustKeep.add(i)
      break
    }
  }
  // More such lines than room: the newest of them stay.
  const chosen = new Set([...mustKeep].sort((a, b) => a - b).slice(-max))
  for (let i = history.length - 1; i >= 0 && chosen.size < max; i--) chosen.add(i)
  return [...chosen].sort((a, b) => a - b).map((i) => history[i]!)
}
