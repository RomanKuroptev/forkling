import { z } from 'zod'

/** Shared need vocabulary. A pack declares the subset its species has. Values run 0 (empty) to 100 (satisfied). */
export const NeedId = z.enum(['hunger', 'energy', 'curiosity', 'affection', 'fun', 'social'])
export type NeedId = z.infer<typeof NeedId>

/** Engine animation slots. A pack maps the ones it can play to clips, and missing slots fall back. */
export const AnimationSlot = z.enum([
  'idle',
  'walk',
  'run',
  'sit',
  'sleep',
  'jump',
  'happy',
  'eat',
  'groom',
  'stretch',
  'knead',
  'climb',
])
export type AnimationSlot = z.infer<typeof AnimationSlot>

export const AnimationMap = z.partialRecord(AnimationSlot, z.string().min(1))
export type AnimationMap = z.infer<typeof AnimationMap>

export const ActionRequirement = z.enum(['visitorNearby', 'night', 'day', 'dusk'])
export type ActionRequirement = z.infer<typeof ActionRequirement>

/** Where an action takes place. `spot` kinds (`sunbeam`, `perch`, `food`...) are resolved by the world. */
export const ActionTarget = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('wander'), radius: z.number().positive().default(15) }),
  z.object({ type: z.literal('visitor') }),
  z.object({ type: z.literal('spot'), kind: z.string().min(1) }),
])
export type ActionTarget = z.infer<typeof ActionTarget>

export const SpeciesAction = z.object({
  id: z.string().min(1),
  /** Need change over a full run of the action, e.g. `{ hunger: 60 }` raises hunger by 60. */
  satisfies: z.partialRecord(NeedId, z.number()),
  /** Min and max duration in seconds once the forkling has arrived. */
  durationSec: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  target: ActionTarget,
  slot: AnimationSlot,
  gait: z.enum(['walk', 'run']).default('walk'),
  requires: z.array(ActionRequirement).default([]),
  /** One sentence in the forkling's voice, used as the intention `reason` until the mind (M4) writes its own. */
  reason: z.string().min(1).max(200),
})
export type SpeciesAction = z.infer<typeof SpeciesAction>

export const SpeciesPack = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    needs: z
      .partialRecord(
        NeedId,
        z.object({
          initial: z.number().min(0).max(100),
          decayPerHour: z.number().min(0),
        }),
      )
      .refine((n) => Object.keys(n).length > 0, { message: 'a pack needs at least one need' }),
    actions: z.array(SpeciesAction).min(1),
    perception: z.object({
      /** Distance in meters at which the forkling notices a visitor. */
      noticeRadius: z.number().positive(),
      /** Eye height in meters, used by the eye cam in M8. */
      eyeHeight: z.number().positive(),
    }),
    locomotion: z.object({
      walkSpeed: z.number().positive(),
      runSpeed: z.number().positive(),
    }),
    /** Utility multipliers per action id. This is where personality lives. Missing means 1. */
    weights: z.record(z.string(), z.number().min(0)).default({}),
    /** Placeholder spots offset from the spawn point, until objects arrive in M5. */
    starterSpots: z
      .array(z.object({ kind: z.string().min(1), offset: z.tuple([z.number(), z.number()]) }))
      .default([]),
  })
  .superRefine((pack, ctx) => {
    const ids = new Set<string>()
    pack.actions.forEach((action, i) => {
      if (ids.has(action.id)) ctx.addIssue({ code: 'custom', path: ['actions', i, 'id'], message: `duplicate action id ${action.id}` })
      ids.add(action.id)
      if (action.durationSec[0] > action.durationSec[1]) {
        ctx.addIssue({ code: 'custom', path: ['actions', i, 'durationSec'], message: 'min duration is above max' })
      }
      for (const need of Object.keys(action.satisfies)) {
        if (!(need in pack.needs)) {
          ctx.addIssue({ code: 'custom', path: ['actions', i, 'satisfies', need], message: `pack has no need ${need}` })
        }
      }
    })
    for (const id of Object.keys(pack.weights)) {
      if (!ids.has(id)) ctx.addIssue({ code: 'custom', path: ['weights', id], message: `no action ${id}` })
    }
  })
export type SpeciesPack = z.infer<typeof SpeciesPack>
