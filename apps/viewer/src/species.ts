import { AnimationMap, SpeciesPack, type AnimationSlot } from '@forkling/schema'
import { behaviors } from '@forkling/species-cat/behaviors'
import animationsJson from '@forkling/species-cat/animations.json'
import speciesJson from '@forkling/species-cat/species.json'
import modelUrl from '@forkling/species-cat/model.glb?url'

/** The one species the viewer knows in M2. From M3 on the pack is chosen by the world's `forkling.json`. */
export const pack = SpeciesPack.parse(speciesJson)
export const animations = AnimationMap.parse(animationsJson)
export { behaviors, modelUrl }

/** M2 hardcodes the forkling's name. It moves into `forkling.json` in M3. */
export const forklingName = 'Merge'

export const animationSlots = Object.keys(animations) as AnimationSlot[]
