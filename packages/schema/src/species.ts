import { z } from 'zod'
import { ArtifactKind } from './art.ts'

/** How a body gets about: on four legs, or upright with paws free. A pack may offer both. */
export const BodyPlan = z.enum(['quadruped', 'upright'])
export type BodyPlan = z.infer<typeof BodyPlan>

/** Verb groups from MILESTONES.md. A body plan decides which groups it can do. */
export const VerbGroup = z.enum(['body', 'hands', 'making', 'growing', 'mind'])
export type VerbGroup = z.infer<typeof VerbGroup>

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

/** Where an action takes place. `spot` kinds (a place's id, a kind of furniture) are resolved by the world. */
export const ActionTarget = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('wander'), radius: z.number().positive().default(15) }),
  z.object({ type: z.literal('visitor') }),
  z.object({ type: z.literal('spot'), kind: z.string().min(1) }),
])
export type ActionTarget = z.infer<typeof ActionTarget>

export const SpeciesAction = z.object({
  id: z.string().min(1),
  /** Min and max duration in seconds once the forkling has arrived. */
  durationSec: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
  target: ActionTarget,
  slot: AnimationSlot,
  gait: z.enum(['walk', 'run']).default('walk'),
  requires: z.array(ActionRequirement).default([]),
  /** One sentence in the forkling's voice, used as the intention `reason` until the mind (M4) writes its own. */
  reason: z.string().min(1).max(200),
  group: VerbGroup.default('body'),
  /** The posture it is done in. Missing means the first body plan that allows its group. */
  body: BodyPlan.optional(),
  /** The kind of thing a finished step leaves behind in `art/`: a poem, a drawing, a tune. Every creative act leaves one. */
  artifact: ArtifactKind.optional(),
})
export type SpeciesAction = z.infer<typeof SpeciesAction>

export const SpeciesPack = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    actions: z.array(SpeciesAction).min(1),
    /**
     * How the body shows each mind verb (spec 2.7): the id of one of its own actions. The sim never names a species or a
     * mind verb; the pack says `rest` is a sit. A verb with no entry is left to the body's own choice.
     */
    mindPoses: z.record(z.string(), z.string()).default({}),
    /** Body plans the species has, and the verb groups each allows. A cat stands up to work and drops to four legs to run. */
    bodyPlans: z.partialRecord(BodyPlan, z.array(VerbGroup).min(1)).default({ quadruped: ['body'] }),
    perception: z.object({
      /** Distance in meters at which the forkling notices a visitor. */
      noticeRadius: z.number().positive(),
      /** Eye height in meters, used by the eye cam. */
      eyeHeight: z.number().positive(),
      /** Vertical field of view of the eye cam, in degrees. */
      fovDeg: z.number().min(20).max(120).default(70),
    }),
    locomotion: z.object({
      walkSpeed: z.number().positive(),
      runSpeed: z.number().positive(),
    }),
    /** Utility multipliers per action id. This is where personality lives. Missing means 1. */
    weights: z.record(z.string(), z.number().min(0)).default({}),
  })
  .superRefine((pack, ctx) => {
    const ids = new Set<string>()
    pack.actions.forEach((action, i) => {
      if (ids.has(action.id)) ctx.addIssue({ code: 'custom', path: ['actions', i, 'id'], message: `duplicate action id ${action.id}` })
      ids.add(action.id)
      if (action.durationSec[0] > action.durationSec[1]) {
        ctx.addIssue({ code: 'custom', path: ['actions', i, 'durationSec'], message: 'min duration is above max' })
      }
      const plans = action.body ? [pack.bodyPlans[action.body] ?? []] : Object.values(pack.bodyPlans)
      if (!plans.some((groups) => groups.includes(action.group))) {
        const where = action.body ? `the ${action.body} body plan` : 'any body plan'
        ctx.addIssue({ code: 'custom', path: ['actions', i, 'group'], message: `${action.id} is a ${action.group} verb, which ${where} does not allow` })
      }
    })
    for (const [verb, action] of Object.entries(pack.mindPoses)) {
      if (!ids.has(action)) ctx.addIssue({ code: 'custom', path: ['mindPoses', verb], message: `no action ${action}` })
    }
    for (const id of Object.keys(pack.weights)) {
      if (!ids.has(id)) ctx.addIssue({ code: 'custom', path: ['weights', id], message: `no action ${id}` })
    }
  })
export type SpeciesPack = z.infer<typeof SpeciesPack>

