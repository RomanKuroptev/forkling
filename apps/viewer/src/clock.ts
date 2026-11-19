import { hourInZone } from '@forkling/sim'
import { parseHour } from './parseHour.ts'
import { qaParams, qaTime } from './qa/params.ts'

export interface WorldClock {
  /** Unix milliseconds in the world. */
  now(): number
  /** Hours since midnight in the world's time zone. */
  hour(): number
  timezone: string
  /** False when `?time=` or `?timescale=` is set: this browser then sees its own version of the world. */
  synced: boolean
}

/**
 * The world's clock. By default it is the real time, so every viewer sees the same moment. `?time=18:30` jumps to that
 * hour in the world's time zone, `?at=` stops it at an exact moment, and `?timescale=60` runs the world (sun and forkling alike) that many times faster.
 * `?qa=1&now=` (the audit harness) stands at `now` and moves only as far as the harness has stepped it (`time`).
 */
export function createWorldClock(timezone: string, search: string, time: { elapsedMs: number } = qaTime): WorldClock {
  const qa = qaParams(search)
  if (qa) {
    // Shown as the world really is at that moment, so Merge's face is its own face and not "no signal".
    const now = () => qa.now + time.elapsedMs
    return { now, hour: () => hourInZone(timezone, now()), timezone, synced: true }
  }
  const params = new URLSearchParams(search)
  // `?at=<ISO time>` holds the world at that exact moment: the eye cam uses it to see the light a photo was taken in.
  const at = Date.parse(params.get('at') ?? '')
  if (Number.isFinite(at)) return { now: () => at, hour: () => hourInZone(timezone, at), timezone, synced: false }
  const target = parseHour(params.get('time'))
  const timescale = Math.max(0.01, Number(params.get('timescale')) || 1)
  const synced = target === null && timescale === 1

  const realStart = Date.now()
  const perfStart = performance.now()
  const start = target === null ? realStart : realStart + ((((target - hourInZone(timezone, realStart)) % 24) + 24) % 24) * 3_600_000
  const now = synced ? () => Date.now() : () => start + (performance.now() - perfStart) * timescale

  return { now, hour: () => hourInZone(timezone, now()), timezone, synced }
}
