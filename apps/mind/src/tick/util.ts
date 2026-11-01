import { EPOCH_SECONDS, hourInZone } from '@forkling/sim'

const pad = (n: number) => String(n).padStart(2, '0')
export const clock = (tz: string, ms: number) => {
  const h = hourInZone(tz, ms)
  return `${pad(Math.floor(h))}:${pad(Math.floor((h % 1) * 60))}`
}
export const weekday = (tz: string, ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long' }).format(new Date(ms))
export const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places
export const epochOf = (ms: number) => Math.floor(ms / 1000 / EPOCH_SECONDS)
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** A seed for an intention the mind starts, fixed by the forkling and the second it starts. */
export function intentionSeed(seed: number, ms: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.floor(ms / 1000)) >>> 0
}
