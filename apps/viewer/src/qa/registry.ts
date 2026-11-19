import type { Object3D } from 'three'
import type { QaPlant } from './plant.ts'
import type { PlacesSnapshot, QaKind, ScreenShows } from './sceneList.ts'

export type Vec3 = [number, number, number]

/** A camera the harness puts in place of the visitor's eyes: where it stands and what it looks at. */
export interface QaPose {
  position: Vec3
  target: Vec3
}

/**
 * What the drawing components hand the harness under `?qa=1` (and only then): the places as last drawn, the objects that stand
 * for Merge and the visitor, the visitor's body, and a camera that replaces the visitor's eyes while it is set.
 */
export const qaRegistry = {
  places: null as PlacesSnapshot | null,
  /** Kit model files that have loaded or failed, and how many there are to wait for. */
  models: { settled: 0, total: 0, drawn: 0 },
  objects: new Map<string, { kind: QaKind; object: Object3D }>(),
  /** What each work screen shows as drawn (`WorkScreens`), by `<place>/<exhibit>`: its picture once loaded, else its title. */
  screens: new Map<string, ScreenShows>(),
  player: null as null | {
    position(): Vec3
    look(): { yaw: number; pitch: number }
    setLook(yaw: number, pitch: number): void
    teleport(x: number, z: number, yaw?: number): void
  },
  camera: null as QaPose | null,
  /** A planted flaw from the fixture's qa.json (audit QW.7); null in normal mode. */
  plant: null as QaPlant | null,
}
