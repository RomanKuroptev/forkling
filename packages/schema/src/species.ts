import { z } from 'zod'
import { Material, PropertyFilter } from './properties.ts'

/** How a body gets about: on four legs, or upright with paws free. A pack may offer both. */
export const BodyPlan = z.enum(['quadruped', 'upright'])
export type BodyPlan = z.infer<typeof BodyPlan>

/** Verb groups from MILESTONES.md. A body plan decides which groups it can do. */
export const VerbGroup = z.enum(['body', 'hands', 'making', 'growing', 'mind'])
export type VerbGroup = z.infer<typeof VerbGroup>

/** What a verb does to the world when its step completes. Engine vocabulary: packs pick from it, never extend it. */
export const VerbEffect = z.enum([
  'none',
  'pickUp',
  'drop',
  'putOn',
  'give',
  'open',
  'close',
  'hide',
  'cut',
  'make',
  'paint',
  'plant',
  'water',
  'harvest',
  'cook',
  'eat',
])
export type VerbEffect = z.infer<typeof VerbEffect>

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
  'stand',
  'walkUpright',
  'work',
  'useTool',
  'holdUp',
  'carry',
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
  /** An object in the world: one whose properties match `where`, or (with `unlocked`) one that unlocks this verb. */
  z.object({ type: z.literal('object'), where: PropertyFilter.default({}), unlocked: z.boolean().default(false) }),
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
  /**
   * How much of the action's appeal survives when the needs it raises are already met, 0 to 1. Low for eating (a
   * full cat doesn't eat), high for things done for fun, like exploring. Actions that raise nothing are unaffected.
   */
  spontaneous: z.number().min(0).max(1).default(0.05),
  /** One sentence in the forkling's voice, used as the intention `reason` until the mind (M4) writes its own. */
  reason: z.string().min(1).max(200),
  group: VerbGroup.default('body'),
  /** The posture it is done in. Missing means the first body plan that allows its group. */
  body: BodyPlan.optional(),
  /** What it changes in the world when a planned step of it completes. */
  effect: VerbEffect.default('none'),
  /** Whether the paws must be empty or full to do it. */
  hands: z.enum(['any', 'empty', 'full']).default('any'),
  /** Materials it works with. Empty means any. */
  accepts: z.array(Material).default([]),
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
    /** Body plans the species has, and the verb groups each allows. A cat stands up to work and drops to four legs to run. */
    bodyPlans: z.partialRecord(BodyPlan, z.array(VerbGroup).min(1)).default({ quadruped: ['body'] }),
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
      const plans = action.body ? [pack.bodyPlans[action.body] ?? []] : Object.values(pack.bodyPlans)
      if (!plans.some((groups) => groups.includes(action.group))) {
        const where = action.body ? `the ${action.body} body plan` : 'any body plan'
        ctx.addIssue({ code: 'custom', path: ['actions', i, 'group'], message: `${action.id} is a ${action.group} verb, which ${where} does not allow` })
      }
    })
    for (const id of Object.keys(pack.weights)) {
      if (!ids.has(id)) ctx.addIssue({ code: 'custom', path: ['weights', id], message: `no action ${id}` })
    }
  })
export type SpeciesPack = z.infer<typeof SpeciesPack>

/** A quirk a forkling may roll at birth. `weights` multiply verb utility, so a hoarder picks things up more. */
export const Quirk = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes'),
  /** How it shows, in a sentence. Shown to the mind and on the site. */
  text: z.string().min(1).max(200),
  weights: z.record(z.string(), z.number().min(0)).default({}),
  /** Multipliers on how strongly an event kind (`finished`, `blocked`...) moves its feelings: a perfectionist minds a blocked step more. */
  appraisal: z.record(z.string(), z.number().min(0)).default({}),
})
export type Quirk = z.infer<typeof Quirk>

/** `species/<id>/temperament.json`: the pools a forkling's likes, dislikes and quirks are rolled from, once, from its seed. */
export const TemperamentPools = z
  .object({
    /** Categories of taste (colours, textures, places, weather, sounds) and the values in each. */
    traits: z
      .record(z.string().min(1), z.array(z.string().min(1)).min(2))
      .refine((t) => Object.keys(t).length > 0, { message: 'at least one trait category' }),
    likes: z.number().int().min(0).max(6).default(3),
    dislikes: z.number().int().min(0).max(6).default(2),
    quirks: z.array(Quirk).min(2),
    /** Fewest and most quirks to roll. */
    quirkCount: z.tuple([z.number().int().min(0), z.number().int().min(0)]).default([2, 3]),
  })
  .superRefine((pools, ctx) => {
    const ids = new Set<string>()
    pools.quirks.forEach((q, i) => {
      if (ids.has(q.id)) ctx.addIssue({ code: 'custom', path: ['quirks', i, 'id'], message: `duplicate quirk id ${q.id}` })
      ids.add(q.id)
    })
    if (pools.quirkCount[0] > pools.quirkCount[1]) ctx.addIssue({ code: 'custom', path: ['quirkCount'], message: 'min is above max' })
  })
export type TemperamentPools = z.infer<typeof TemperamentPools>
