export type Vec3 = [number, number, number]
export interface EyeCamShot {
  eye: Vec3
  look: Vec3
}

const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))

/** The address that makes the viewer see through the forkling's eyes: from `eye`, looking at `look`, at moment `at`. */
export function eyeCamUrl(shot: EyeCamShot, at?: string): string {
  const params = new URLSearchParams({ world: 'local', eyecam: JSON.stringify({ eye: shot.eye, look: shot.look }) })
  if (at) params.set('at', at)
  return `?${params.toString()}`
}

/** The shot asked for in the address, or null when there isn't one or it isn't a shot. */
export function parseEyeCam(search: string): EyeCamShot | null {
  const raw = new URLSearchParams(search).get('eyecam')
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as { eye?: unknown; look?: unknown } | null
    return parsed && isVec3(parsed.eye) && isVec3(parsed.look) ? { eye: parsed.eye, look: parsed.look } : null
  } catch {
    return null
  }
}
