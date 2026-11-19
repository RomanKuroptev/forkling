/**
 * `?qa=1&now=<iso>&seed=<n>`: the audit harness's mode (docs/spec/audit/spec.md 7.1). It only changes what tests need, never
 * the look: the clock stands still at `now` until the harness steps it, frames are drawn only when it steps, and anything
 * random comes from `seed`. Without `qa=1` nothing here is used.
 */
export interface QaParams {
  /** Unix milliseconds the world stands at. */
  now: number
  seed: number
}

/** The moment a `?qa=1` address without a good `now` stands at, so a run never depends on the real date. */
export const QA_DEFAULT_NOW = Date.parse('2026-11-26T13:00:00Z')

export function qaParams(search: string): QaParams | null {
  const params = new URLSearchParams(search)
  if (params.get('qa') !== '1') return null
  const now = Date.parse(params.get('now') ?? '')
  const seed = Number(params.get('seed'))
  return { now: Number.isFinite(now) ? now : QA_DEFAULT_NOW, seed: Number.isInteger(seed) && params.has('seed') ? seed : 1 }
}

/** How far the harness has stepped the world since the page opened. Only `__qa.step` moves it. */
export const qaTime = { elapsedMs: 0 }

/** The address's harness mode, read once when the page loads. Null in normal mode and where there is no browser (tests). */
export const qaMode: QaParams | null = typeof window === 'undefined' ? null : qaParams(window.location.search)
