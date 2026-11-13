/**
 * `?stand=x,z` or `?stand=x,z,yaw` (yaw in degrees, 0 facing +z): where the visitor starts, for looking at a part of the world.
 * Nothing if it is not given or not two or three numbers. (`?at=` is the clock's own, an ISO time.)
 */
export function parseStand(search: string): { x: number; z: number; yaw: number } | null {
  const raw = new URLSearchParams(search).get('stand')
  if (!raw) return null
  const parts = raw.split(',').map((s) => (s.trim() === '' ? Number.NaN : Number(s)))
  if (parts.length < 2 || parts.length > 3 || !parts.every(Number.isFinite)) return null
  return { x: parts[0]!, z: parts[1]!, yaw: ((parts[2] ?? 0) * Math.PI) / 180 }
}
