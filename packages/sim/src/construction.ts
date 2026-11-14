/** Spec 4.5: an accepted expand or found sets a construction with a finish time; until then the place shows scaffolding. */
interface Building {
  construction: { finishesAt: string } | null
}

/**
 * Whether a place is still being built at a moment (`nowMs`, Unix ms): its construction has a finish time that has not come. Without
 * a clock it goes by the file, so a construction that is written down counts as going on.
 */
export function isBuilding(state: Building, nowMs?: number): boolean {
  if (!state.construction) return false
  return nowMs === undefined || Date.parse(state.construction.finishesAt) > nowMs
}

/** The places whose construction has ended by `nowMs`: the mind clears it from their files. */
export function finishedBuildings<T extends { state: Building }>(places: readonly T[], nowMs: number): T[] {
  return places.filter((p) => p.state.construction !== null && !isBuilding(p.state, nowMs))
}
