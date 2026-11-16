export type Vec3Tuple = [number, number, number]

/** Highest the sun climbs, in degrees above the horizon. Keeps shadows from vanishing at noon. */
const MAX_ELEVATION_DEG = 70

const SUNRISE = 6
const SUNSET = 20

/** Unit vector from the ground towards the sun. +x is east, y is up. Rises at 6:00, peaks at 13:00, sets at 20:00. */
export function sunDirection(hour: number): Vec3Tuple {
  const angle = (Math.PI * (hour - SUNRISE)) / (SUNSET - SUNRISE)
  const elevation = Math.sin(angle) * MAX_ELEVATION_DEG * (Math.PI / 180)
  const azimuth = Math.cos(angle)
  const horizontal = Math.cos(elevation)
  // A slight tilt to the south keeps noon shadows pointing somewhere.
  const x = azimuth * horizontal
  const z = 0.35 * horizontal
  const y = Math.sin(elevation)
  const n = Math.hypot(x, y, z)
  return [x / n, y / n, z / n]
}
