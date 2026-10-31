import type { MicroBehavior, MoodPose } from '@forkling/schema'

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

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * How a cat's feelings show: tail up and a little quiver when pleased, ears back and tail low when uneasy, and a
 * restless tail tip when wound up.
 */
export const moodPose: MoodPose = ({ bones, t, feelings }) => {
  const pleased = clamp01(feelings.valence)
  const uneasy = clamp01(-feelings.valence)
  const wound = clamp01((feelings.arousal - 0.6) / 0.4)

  if (bones.tail1) bones.tail1.rotation.x += pleased * 0.5 - uneasy * 0.5
  if (bones.tail4) bones.tail4.rotation.y += Math.sin(t * 7) * 0.15 * wound
  if (bones.earL) bones.earL.rotation.z -= uneasy * 0.4
  if (bones.earR) bones.earR.rotation.z += uneasy * 0.4
}
