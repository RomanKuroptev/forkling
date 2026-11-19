import type { SignBoard } from '../world/signGeometry.ts'
import type { QaParams } from './params.ts'

/**
 * Planted world flaws for the harness's own tests (audit QW.7), read from the fixture's `qa.json` (`plant`) and only under
 * `?qa=1` with a local world. Only flaws the world files cannot say: an object lifted off its place, a texture that fails to
 * load. Everything else is planted by editing the world files, so it takes the real path.
 */
export interface QaPlant {
  /** Lift a scene object (`<place>/sign`) by `dy` meters. */
  raise: { id: string; dy: number }[]
  /** Draw these with a texture that never loaded (`signs`). */
  missingTexture: 'signs'[]
}

const TEXTURES = new Set(['signs'])

/** The plant to apply, or null: always null in normal mode, and when `qa.json` plants nothing it knows. */
export function plantFrom(qa: QaParams | null, raw: unknown): QaPlant | null {
  if (!qa || typeof raw !== 'object' || raw === null) return null
  const r = raw as { raise?: unknown; missingTexture?: unknown }
  const raise = Array.isArray(r.raise)
    ? r.raise.flatMap((x: unknown) => {
        const { id, dy } = (x ?? {}) as { id?: unknown; dy?: unknown }
        return typeof id === 'string' && typeof dy === 'number' && Number.isFinite(dy) && Math.abs(dy) <= 20 ? [{ id: id.slice(0, 100), dy }] : []
      })
    : []
  const missingTexture = Array.isArray(r.missingTexture) ? r.missingTexture.filter((t: unknown): t is 'signs' => typeof t === 'string' && TEXTURES.has(t)) : []
  return raise.length || missingTexture.length ? { raise, missingTexture } : null
}

/** The sign boards with any planted lift applied. The same boards when nothing is planted. */
export function plantBoards(boards: readonly SignBoard[], plant: QaPlant | null): readonly SignBoard[] {
  if (!plant || plant.raise.length === 0) return boards
  return boards.map((b) => {
    const lift = plant.raise.find((x) => x.id === `${b.id}/sign`)
    return lift ? { ...b, position: [b.position[0], b.position[1] + lift.dy, b.position[2]] as [number, number, number] } : b
  })
}
