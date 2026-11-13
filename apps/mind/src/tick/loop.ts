import type { NowJson, Place } from '@forkling/schema'
import { placesRev } from '@forkling/sim'
import { runTick } from '../tick.ts'
import type { TickDeps, TickOutcome } from './context.ts'
import { commitAndPush, type GitRunner } from './git.ts'

/** The reflex tick comes every 10 seconds while awake and every 60 seconds asleep (spec 2.2). */
export const REFLEX_AWAKE_MS = 10_000
export const REFLEX_ASLEEP_MS = 60_000
/** The world is committed this often (spec 2.2), and at once when a step produces a file. */
export const COMMIT_EVERY_MS = 15 * 60_000
/** The tick log and health are written this often unless something happened. */
export const LOG_EVERY_MS = 60_000

/** Where what Merge makes lands. The stream, tick log, health and state change all the time and wait for the 15 minutes. */
const PRODUCT_PREFIXES = ['souvenirs/', 'trails/', 'notebook/', 'works/', 'places/', 'wishes/', 'requests/', 'self/']
export const isProduct = (written: readonly string[]): boolean => written.some((p) => PRODUCT_PREFIXES.some((prefix) => p.startsWith(prefix)))

export interface LoopOptions {
  dir: string
  /** Milliseconds since the epoch. Injected so a test can run an hour in a moment. */
  clock: () => number
  /** What every tick shares. The loop adds `now`, the thought tick, the log throttle and the push warning. */
  deps: Omit<TickDeps, 'now' | 'thoughts' | 'logEveryMs' | 'pushFailing'>
  /** Null never commits (a test, or a world that is not a repository). */
  git: GitRunner | null
  commitEveryMs?: number
  logEveryMs?: number
}

export interface RunOptions {
  /** Waits that long. Injected, like the clock. */
  sleep: (ms: number) => Promise<void>
  /** Set `aborted` to stop after the tick in progress. */
  signal: { aborted: boolean }
  /** A tick that throws (a world file that does not parse) is reported and the loop goes on. */
  onError: (error: unknown) => void
}

export interface Loop {
  /** One reflex tick. Two calls never run at the same time: the second waits for the first. */
  tickOnce(): Promise<TickOutcome>
  /** How long to wait before the next one: 10 s awake, 60 s asleep. */
  nextDelayMs(): number
  /** `now.json` as the last tick left it, or null before the first. Held in memory and never committed. */
  now(): NowJson | null
  /** The places as the last tick left them, with their `placesRev`, or null before the first tick. */
  places(): { rev: string; places: Place[] } | null
  /** The last push failed 3 times. */
  readonly pushFailing: boolean
  run(opts: RunOptions): Promise<void>
}

/**
 * The always-on loop (spec 2.2): a reflex tick every 10 seconds, the thought tick when it is due, the world committed
 * every 15 minutes. Each reflex tick is the same `runTick` the Actions workflow runs, so the disk is always the current
 * state and a crash loses nothing; only the writing of the tick log and the git work are spaced out.
 */
export function createLoop(opts: LoopOptions): Loop {
  const commitEveryMs = opts.commitEveryMs ?? COMMIT_EVERY_MS
  const logEveryMs = opts.logEveryMs ?? LOG_EVERY_MS
  let lastCommitMs = opts.clock()
  let pushFailing = false
  let latest: NowJson | null = null
  let latestPlaces: { rev: string; places: Place[] } | null = null
  let queue: Promise<unknown> = Promise.resolve()

  async function tick(): Promise<TickOutcome> {
    const nowMs = opts.clock()
    const outcome = await runTick(opts.dir, { ...opts.deps, now: new Date(nowMs), thoughts: true, logEveryMs, pushFailing })
    latest = outcome.now
    latestPlaces = { rev: outcome.now.placesRev ?? placesRev(outcome.places), places: outcome.places }
    if (opts.git && (isProduct(outcome.written) || nowMs - lastCommitMs >= commitEveryMs)) {
      const message = `${outcome.changed ? 'chore(mind)' : 'tick'}: ${outcome.summary || 'sync'}`
      pushFailing = (await commitAndPush(opts.git, message, { retryPush: pushFailing })) === 'push-failed'
      lastCommitMs = nowMs
    }
    return outcome
  }

  return {
    tickOnce() {
      const next = queue.then(tick)
      queue = next.catch(() => undefined)
      return next
    },
    nextDelayMs: () => (latest?.asleep ? REFLEX_ASLEEP_MS : REFLEX_AWAKE_MS),
    now: () => latest,
    places: () => latestPlaces,
    get pushFailing() {
      return pushFailing
    },
    async run({ sleep, signal, onError }) {
      while (!signal.aborted) {
        try {
          await this.tickOnce()
        } catch (e) {
          onError(e)
        }
        if (signal.aborted) break
        await sleep(this.nextDelayMs())
      }
    },
  }
}
