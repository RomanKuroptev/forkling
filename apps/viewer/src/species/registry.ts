import { AnimationMap, SpeciesPack, TemperamentPools, type AnimationSlot, type MicroBehavior, type MoodPose } from '@forkling/schema'
import { behaviors as catBehaviors, moodPose as catMoodPose } from '@forkling/species-cat/behaviors'
import catAnimations from '@forkling/species-cat/animations.json'
import catSpecies from '@forkling/species-cat/species.json'
import catTemperament from '@forkling/species-cat/temperament.json'
import catModelUrl from '@forkling/species-cat/model.glb?url'

/** Everything the viewer needs to bring a species to life. All species knowledge sits behind this registry. */
export interface SpeciesEntry {
  pack: SpeciesPack
  animations: AnimationMap
  /** Slots this species has clips for. */
  slots: AnimationSlot[]
  behaviors: MicroBehavior[]
  /** Where its likes, dislikes and quirks are rolled from. */
  pools: TemperamentPools
  /** How its feelings show in its body, if the species has a way. */
  moodPose?: MoodPose
  modelUrl: string
}

interface EntryInput {
  species: unknown
  animations: unknown
  temperament: unknown
  behaviors: MicroBehavior[]
  moodPose?: MoodPose
  modelUrl: string
}

function entry({ species, animations, temperament, behaviors, moodPose, modelUrl }: EntryInput): SpeciesEntry {
  const map = AnimationMap.parse(animations)
  return {
    pack: SpeciesPack.parse(species),
    animations: map,
    slots: Object.keys(map) as AnimationSlot[],
    behaviors,
    pools: TemperamentPools.parse(temperament),
    ...(moodPose ? { moodPose } : {}),
    modelUrl,
  }
}

/** Species packs shipped with this viewer, by id. A world's `forkling.json` picks one. */
export const species: Record<string, SpeciesEntry> = {
  cat: entry({ species: catSpecies, animations: catAnimations, temperament: catTemperament, behaviors: catBehaviors, moodPose: catMoodPose, modelUrl: catModelUrl }),
}

export const speciesPacks: Record<string, SpeciesPack> = Object.fromEntries(Object.entries(species).map(([id, e]) => [id, e.pack]))
