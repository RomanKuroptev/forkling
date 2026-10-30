import { hourInZone } from '@forkling/sim'
import { parseHour } from './parseHour.ts'

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
 * hour in the world's time zone and `?timescale=60` runs the world (sun and forkling alike) that many times faster.
 */
export function createWorldClock(timezone: string, search: string): WorldClock {
  const params = new URLSearchParams(search)
  const target = parseHour(params.get('time'))
  const timescale = Math.max(0.01, Number(params.get('timescale')) || 1)
  const synced = target === null && timescale === 1

  const realStart = Date.now()
  const perfStart = performance.now()
  const start = target === null ? realStart : realStart + ((((target - hourInZone(timezone, realStart)) % 24) + 24) % 24) * 3_600_000
  const now = synced ? () => Date.now() : () => start + (performance.now() - perfStart) * timescale

  return { now, hour: () => hourInZone(timezone, now()), timezone, synced }
}
