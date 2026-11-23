/**
 * The site follows Merge (issue: the page was hours behind). Pushes from the server use a token whose pushes start no
 * workflow, and GitHub runs the `*\/30` schedule of `pages.yml` only every few hours, so the server asks GitHub to rebuild
 * the site itself after it pushed something Merge made: at once the first time, then at most once every 30 minutes, with
 * whatever came in between sent when the 30 minutes are up.
 */
export const PAGES_EVERY_MS = 30 * 60_000

export type PagesTick = 'idle' | 'waiting' | 'dispatched' | 'failed'

export interface PagesDispatcher {
  /** Something Merge made went out in a push. */
  changed(): void
  /** Called once a minute: rebuilds the site when something changed and the last try is 30 minutes back. */
  tick(): Promise<PagesTick>
}

export function createPagesDispatcher(opts: { dispatch: () => Promise<void>; now: () => number; log: (line: string) => void; everyMs?: number }): PagesDispatcher {
  const everyMs = opts.everyMs ?? PAGES_EVERY_MS
  let pending = false
  let lastTry = Number.NEGATIVE_INFINITY
  return {
    changed() {
      pending = true
    },
    async tick() {
      if (!pending) return 'idle'
      const now = opts.now()
      if (now - lastTry < everyMs) return 'waiting'
      // A refusal (a token without Actions: write) waits the same 30 minutes, so it is tried and logged twice an hour at most.
      lastTry = now
      try {
        await opts.dispatch()
        pending = false
        return 'dispatched'
      } catch (e) {
        opts.log(`site rebuild not started: ${e instanceof Error ? e.message : String(e)}`)
        return 'failed'
      }
    },
  }
}
