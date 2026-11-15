import { Place } from '@forkling/schema'
import homeFile from '../../../templates/forkling-world/places/home.json' with { type: 'json' }
import workshopFile from '../../../templates/forkling-world/places/workshop.json' with { type: 'json' }

/**
 * Home and the Workshop, the two places every forkling starts with (the same files `migrate-w5` copies into a world). A world
 * with no `places/` folder is walked and drawn as these two, so the mind and every viewer make the same choice from here.
 * The import attribute is needed because the mind runs on plain Node, which refuses a JSON module without it.
 */
let cached: readonly Place[] | undefined

export function starterPlaces(): Place[] {
  cached ??= [Place.parse(homeFile), Place.parse(workshopFile)]
  return [...cached]
}
