import { parseHour } from './parseHour.ts'

const params = new URLSearchParams(location.search)

const now = new Date()
const startHour = parseHour(params.get('time')) ?? now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
const timescale = Number(params.get('timescale')) || 1
const startedAt = performance.now()

/**
 * Time of day for the world. By default this follows the browser's local clock. `?time=18:30` starts at that hour
 * and `?timescale=60` makes the day run that many times faster, to check dusk and moving sunbeams.
 */
export const clock = {
  hour: () => (startHour + (((performance.now() - startedAt) / 1000) * timescale) / 3600) % 24,
}

/** `?simspeed=10` runs the forkling's brain that many times faster than real time, for testing. */
export const simSpeed = Math.max(1, Number(params.get('simspeed')) || 1)
