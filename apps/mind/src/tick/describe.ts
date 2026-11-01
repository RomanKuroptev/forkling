import type { WorldObject } from '@forkling/schema'
import type { Feelings, StepEvent } from '@forkling/sim'

export const PAST: Record<StepEvent['kind'], string> = {
  gathered: 'gathered',
  pickedUp: 'picked up',
  stored: 'put away',
  placed: 'put down',
  dropped: 'dropped',
  opened: 'opened',
  closed: 'closed',
  started: 'started',
  worked: 'worked on',
  finished: 'finished',
  painted: 'painted',
  planted: 'planted',
  watered: 'watered',
  harvested: 'harvested',
  cooked: 'cooked',
  ate: 'ate',
  ateSpoiled: 'ate (it had gone off)',
  read: 'read at',
  created: 'made something at',
}

/** What a step did, in a line the model can read. Names come from the objects, which may hold the forkling's own words. */
export function describeEvent(event: StepEvent, objects: readonly WorldObject[]): string {
  const name = event.objectId ? (objects.find((o) => o.id === event.objectId)?.name ?? event.objectId) : ''
  return [PAST[event.kind], event.material && event.kind !== 'planted' ? `${event.material} from` : '', name].filter(Boolean).join(' ')
}

export function describeFeelings({ valence, arousal }: Feelings): string {
  const how = valence > 0.15 ? 'feeling good' : valence < -0.15 ? 'feeling bad' : 'feeling neutral'
  const energy = arousal > 0.55 ? 'wound up' : arousal < 0.2 ? 'drowsy' : 'calm'
  return `${how}, ${energy}`
}
