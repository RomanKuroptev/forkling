import { AnimationMap, SpeciesPack, type AnimationSlot, type MicroBehavior } from '@forkling/schema'
import { behaviors as catBehaviors } from '@forkling/species-cat/behaviors'
import catAnimations from '@forkling/species-cat/animations.json'
import catSpecies from '@forkling/species-cat/species.json'
import catModelUrl from '@forkling/species-cat/model.glb?url'

/** Everything the viewer needs to bring a species to life. All species knowledge sits behind this registry. */
export interface SpeciesEntry {
  pack: SpeciesPack
  animations: AnimationMap
  /** Slots this species has clips for. */
  slots: AnimationSlot[]
  behaviors: MicroBehavior[]
  modelUrl: string
}

function entry(species: unknown, animations: unknown, behaviors: MicroBehavior[], modelUrl: string): SpeciesEntry {
  const map = AnimationMap.parse(animations)
  return { pack: SpeciesPack.parse(species), animations: map, slots: Object.keys(map) as AnimationSlot[], behaviors, modelUrl }
}

/** Species packs shipped with this viewer, by id. A world's `forkling.json` picks one. */
export const species: Record<string, SpeciesEntry> = {
  cat: entry(catSpecies, catAnimations, catBehaviors, catModelUrl),
}

export const speciesPacks: Record<string, SpeciesPack> = Object.fromEntries(Object.entries(species).map(([id, e]) => [id, e.pack]))
