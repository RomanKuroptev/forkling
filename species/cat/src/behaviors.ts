import type { MicroBehavior } from '@forkling/schema'

/**
 * A cat's signature micro-behaviors. Clip-driven ones just name a slot. `animate` hooks run after the
 * animation mixer each frame and *add* to the current pose, so they layer over whatever clip is playing.
 * Zoomies at dusk are an action in `species.json`, since they take the cat somewhere.
 */
export const behaviors: MicroBehavior[] = [
  {
    id: 'groom',
    when: 'idle',
    chance: 0.2,
    durationSec: 3.2,
    slot: 'groom',
  },
  {
    id: 'stretch',
    when: 'afterWake',
    chance: 0.9,
    durationSec: 2.6,
    slot: 'stretch',
  },
  {
    // Kneading the ground before curling up to sleep.
    id: 'knead',
    when: 'beforeSleep',
    chance: 0.85,
    durationSec: 2.4,
    slot: 'knead',
  },
  {
    // A sitting cat whose tail tip has opinions.
    id: 'tail_flick',
    when: 'idle',
    chance: 0.3,
    durationSec: 1.4,
    slot: 'sit',
    animate: ({ bones, t, progress }) => {
      const envelope = Math.sin(Math.PI * progress)
      const flick = Math.sin(t * 22) * 0.7 * envelope
      const weights = { tail2: 0.3, tail3: 0.7, tail4: 1 } as const
      for (const [name, weight] of Object.entries(weights)) {
        const bone = bones[name]
        if (bone) bone.rotation.y += flick * weight
      }
    },
  },
]
