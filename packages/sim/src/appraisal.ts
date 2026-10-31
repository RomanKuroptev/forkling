import type { TemperamentPools, TemperamentRoll, WorldObject } from '@forkling/schema'
import type { StepEvent } from './effects.ts'

/** How it feels underneath its mood label: valence from bad (-1) to good (1), arousal from calm (0) to wound up (1). */
export interface Feelings {
  valence: number
  arousal: number
}

/** Something that happened, in the engine's vocabulary. `tags` are what it involved: a material, what an object is made of or like. */
export interface AppraisalEvent {
  kind: string
  tags?: readonly string[]
}

/** How an event moves feelings before taste and quirks get a say. Kinds not listed move nothing. */
const IMPACT: Record<string, Feelings> = {
  gathered: { valence: 0.1, arousal: 0.05 },
  pickedUp: { valence: 0.05, arousal: 0.05 },
  stored: { valence: 0.1, arousal: 0.05 },
  placed: { valence: 0.1, arousal: 0.05 },
  opened: { valence: 0.05, arousal: 0.05 },
  started: { valence: 0.15, arousal: 0.1 },
  worked: { valence: 0.1, arousal: 0.05 },
  finished: { valence: 0.35, arousal: 0.15 },
  painted: { valence: 0.2, arousal: 0.1 },
  planted: { valence: 0.2, arousal: 0.1 },
  watered: { valence: 0.1, arousal: 0.05 },
  harvested: { valence: 0.3, arousal: 0.15 },
  cooked: { valence: 0.25, arousal: 0.1 },
  ate: { valence: 0.2, arousal: 0.05 },
  ateSpoiled: { valence: -0.4, arousal: 0.2 },
  stepDone: { valence: 0.05, arousal: 0 },
  blocked: { valence: -0.3, arousal: 0.25 },
  novelty: { valence: 0.1, arousal: 0.3 },
  need: { valence: -0.3, arousal: 0.2 },
}

const LIKED: Feelings = { valence: 0.25, arousal: 0.1 }
const DISLIKED: Feelings = { valence: -0.25, arousal: 0.15 }

const NEUTRAL_AROUSAL = 0.3
/** Hours for a feeling to fade halfway back to calm. */
const VALENCE_HALF_LIFE = 3
const AROUSAL_HALF_LIFE = 2

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Feelings after a run of events. What an event means depends on who it happens to: a liked tag lifts it, a disliked
 * one sours it, and a quirk can make a kind of event weigh more or less. Pure; feelings are clamped to range.
 */
export function appraise(
  feelings: Feelings,
  events: readonly AppraisalEvent[],
  temperament: TemperamentRoll,
  pools: Pick<TemperamentPools, 'quirks'>,
): Feelings {
  if (events.length === 0) return { ...feelings }
  const quirks = temperament.quirks.map((q) => pools.quirks.find((p) => p.id === q.id)).filter((q) => q !== undefined)
  const likes = new Set(temperament.likes.map((t) => t.value))
  const dislikes = new Set(temperament.dislikes.map((t) => t.value))

  let { valence, arousal } = feelings
  for (const event of events) {
    const base = IMPACT[event.kind] ?? { valence: 0, arousal: 0 }
    const weight = quirks.reduce((product, q) => product * (q.appraisal[event.kind] ?? 1), 1)
    let dv = base.valence * weight
    let da = base.arousal * weight
    const tags = event.tags ?? []
    if (tags.some((t) => likes.has(t))) {
      dv += LIKED.valence
      da += LIKED.arousal
    }
    if (tags.some((t) => dislikes.has(t))) {
      dv += DISLIKED.valence
      da += DISLIKED.arousal
    }
    valence = clamp(valence + dv, -1, 1)
    arousal = clamp(arousal + da, 0, 1)
  }
  return { valence, arousal }
}

/** Feelings fade towards calm as hours pass, so a bad morning is not a bad week. */
export function decayFeelings(feelings: Feelings, hours: number): Feelings {
  if (hours <= 0) return { ...feelings }
  return {
    valence: feelings.valence * 0.5 ** (hours / VALENCE_HALF_LIFE),
    arousal: NEUTRAL_AROUSAL + (feelings.arousal - NEUTRAL_AROUSAL) * 0.5 ** (hours / AROUSAL_HALF_LIFE),
  }
}

/** A word for how it feels. Plain words, no species in them. */
export function moodLabel({ valence, arousal }: Feelings): string {
  if (valence > 0.4) return arousal > 0.55 ? 'delighted' : 'content'
  if (valence > 0.15) return arousal > 0.5 ? 'pleased' : 'content'
  if (valence >= -0.15) return arousal > 0.55 ? 'curious' : arousal < 0.2 ? 'sleepy' : 'calm'
  if (valence >= -0.4) return arousal > 0.5 ? 'frustrated' : 'uneasy'
  return arousal > 0.5 ? 'upset' : 'down'
}

/** Appraisal events for what a step did, tagged with the material and what the object involved is made of and like. */
export function eventsFromStep(events: readonly StepEvent[], objects: readonly WorldObject[]): AppraisalEvent[] {
  return events.map((event) => {
    const tags = new Set<string>()
    if (event.material) tags.add(event.material)
    const obj = event.objectId === undefined ? undefined : objects.find((o) => o.id === event.objectId)
    if (obj) {
      tags.add(obj.kind)
      if (obj.properties.material) tags.add(obj.properties.material)
      for (const [flag, tag] of [['soft', 'soft'], ['high', 'high'], ['edible', 'edible'], ['canHide', 'hideaway'], ['diggable', 'diggable']] as const) {
        if (obj.properties[flag]) tags.add(tag)
      }
    }
    return { kind: event.kind, tags: [...tags] }
  })
}
