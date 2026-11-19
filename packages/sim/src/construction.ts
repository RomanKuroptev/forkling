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

/**
 * What a place's sign says while it is being built (issue 331): that it is being built and about how long is left, in plain words
 * from its construction's finish time. Null when it is not being built at `nowMs`, and without a clock (nothing to count from).
 */
export function buildingWords(construction: { finishesAt: string } | null, nowMs?: number): string | null {
  if (nowMs === undefined || !isBuilding({ construction }, nowMs)) return null
  const hours = (Date.parse(construction!.finishesAt) - nowMs) / 3_600_000
  if (hours < 1) return 'Building · ready within the hour'
  if (hours < 48) return `Building · ready in about ${Math.round(hours)} h`
  return `Building · ready in about ${Math.round(hours / 24)} days`
}

