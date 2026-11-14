import { sunDirection } from '@forkling/sim'

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * How night it is at an hour of the day: 0 once the sun is well up, 1 in the dark, rising through dusk. It follows the same sun as the
 * sky does (`Environment`), so lit windows and the glow of the paths come on as the light goes.
 */
export const nightFactor = (hour: number): number => 1 - smoothstep(0.02, 0.3, sunDirection(hour)[1])
