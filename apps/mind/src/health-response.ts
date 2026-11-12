import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Forkling, MindState } from '@forkling/schema'
import { isAsleepAt, localDate, sleepWindow } from '@forkling/sim'
import { readHealth } from './ticklog.ts'

/** Merge should be thinking this long after it wakes. Until then the last thought is from last night, and that is no alarm. */
export const WATCHDOG_WAKE_GRACE_MS = 20 * 60_000

/** What `GET /health` says (spec 14.3). The watchdog fails when the last thought is over 20 minutes old while `shouldBeAwake`. */
export interface HealthResponse {
  /** The server answered, which is all this means. The rest is for the watchdog and for Roman. */
  up: true
  now: string
  asleep: boolean
  /** Awake, and past the wake-up grace. */
  shouldBeAwake: boolean
  lastThoughtAt: string | null
  lastTickAt: string | null
  warnings: string[]
}

const readState = (dir: string): MindState | null => {
  try {
    const parsed = MindState.safeParse(JSON.parse(readFileSync(join(dir, 'mind/state.json'), 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Read from the world on disk, which the loop keeps current, so it works without reaching into the loop. */
export function buildHealthResponse(dir: string, nowMs: number): HealthResponse {
  const forkling = Forkling.parse(JSON.parse(readFileSync(join(dir, 'forkling.json'), 'utf8')))
  const today = localDate(forkling.timezone, nowMs)
  const asleep = isAsleepAt(nowMs, { seed: forkling.seed, timezone: forkling.timezone, lateNight: forkling.lateNight })
  const { wakeMs } = sleepWindow(today, forkling.seed, forkling.timezone, forkling.lateNight === today)
  const health = readHealth(dir)
  return {
    up: true,
    now: new Date(nowMs).toISOString(),
    asleep,
    shouldBeAwake: !asleep && nowMs >= wakeMs + WATCHDOG_WAKE_GRACE_MS,
    lastThoughtAt: readState(dir)?.thought?.lastAt ?? null,
    lastTickAt: health?.lastTick.at ?? null,
    warnings: health?.warnings ?? [],
  }
}
