import { z } from 'zod'
import { Vec3 } from './geometry.ts'
import { Intention, Timestamp } from './intention.ts'
import { Material, ObjectProperties } from './properties.ts'
import { NeedId, type SpeciesPack } from './species.ts'

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes')

/** What the forkling has in its paws: a loose material, or a whole object (a ball of yarn). */
export const Holding = z.union([z.object({ material: Material }).strict(), z.object({ objectId: Slug }).strict()])
export type Holding = z.infer<typeof Holding>

function isTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** `forkling.json`: who the forkling is and what it is doing right now. */
export const Forkling = z.object({
  name: z.string().min(1).max(40),
  /** Species pack id, e.g. `cat`. */
  species: Slug,
  /** Fixed at hatching. Makes this forkling's hours, temperament and tie-breaks its own. */
  seed: z.number().int().nonnegative().default(0),
  /** Current need values, 0 to 100. Which needs exist is up to the species pack. */
  needs: z.partialRecord(NeedId, z.number().min(0).max(100)),
  /** Where it is, in meters. y is ignored: the body snaps to the terrain. */
  position: Vec3,
  /** A label for how it feels, derived from `feelings` by appraisal. */
  mood: z.string().min(1).max(40),
  /** How it feels underneath the label: valence from bad (-1) to good (1), arousal from calm (0) to wound up (1). */
  feelings: z.object({ valence: z.number().min(-1).max(1), arousal: z.number().min(0).max(1) }).default({ valence: 0, arousal: 0.3 }),
  intention: Intention,
  /** What it is carrying right now. Paws hold one thing. */
  holding: Holding.optional(),
  /** Materials put away at home. */
  stored: z.partialRecord(Material, z.number().int().nonnegative()).default({}),
  lastTickAt: Timestamp,
  /** True between bedtime and waking, as decided by the mind from the sleep schedule. */
  asleep: z.boolean().default(false),
  /** Local date (`YYYY-MM-DD`) on which the mind chose to stay up late. */
  lateNight: z.iso.date().optional(),
  /** IANA time zone of the forkling's world, so every viewer agrees on the time of day. */
  timezone: z.string().refine(isTimezone, 'not a known IANA time zone').default('UTC'),
})
export type Forkling = z.infer<typeof Forkling>

/** What a forkling can do with an object. Replaced by `properties` and `unlocks`; read until the sim no longer does. */
export const Affordance = z.enum(['sit', 'eat', 'play', 'sleep', 'climb', 'perch'])
export type Affordance = z.infer<typeof Affordance>

/** A model from the engine's shipped asset library, e.g. `nature/rock_largeA`. */
export const AssetModel = z.object({ asset: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9_-]+$/, 'like nature/rock_largeA') }).strict()

/** One primitive of a composed model. Sizes are meters, `at` is relative to the object's origin. */
export const ModelPart = z.object({
  shape: z.enum(['box', 'sphere', 'cylinder', 'cone']),
  size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  at: Vec3,
  rotation: Vec3.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'like #a67c52'),
})
export type ModelPart = z.infer<typeof ModelPart>

/** A model composed of primitives, which is how a forkling's own creations look. */
export const PartsModel = z.object({ parts: z.array(ModelPart).min(1).max(24) }).strict()
export type PartsModel = z.infer<typeof PartsModel>

/** What changes about an object over time. Everything here is a timestamp or a count, so growth can be worked out lazily. */
export const ObjectState = z.object({
  /** Material left in a source, as of `stockAt`. Missing means full. */
  stock: z.number().int().nonnegative().optional(),
  stockAt: Timestamp.optional(),
  plantedAt: Timestamp.optional(),
  wateredAt: Timestamp.optional(),
  paintedAt: Timestamp.optional(),
  cookedAt: Timestamp.optional(),
  open: z.boolean().optional(),
  /** Id of the object this one is tucked behind or inside. */
  hiddenBy: Slug.optional(),
})
export type ObjectState = z.infer<typeof ObjectState>

/** Set on objects the forkling made. A build that needs several sessions appears at once, unfinished, and grows. */
export const MadeInfo = z.object({
  verb: z.string().min(1),
  materials: z.array(Material).min(1).max(12),
  /** Making skill level when it was started: how tidy it is. */
  skill: z.number().int().min(0).max(10),
  /** Sessions worked so far, and how many it takes. */
  sessions: z.number().int().min(1),
  needed: z.number().int().min(1),
  done: z.boolean(),
  at: Timestamp,
})
export type MadeInfo = z.infer<typeof MadeInfo>

/** `objects/<id>.json`: one thing in the world. */
export const WorldObject = z.object({
  id: Slug,
  kind: Slug,
  name: z.string().min(1).max(60),
  position: Vec3,
  /** Radians. */
  rotation: Vec3.default([0, 0, 0]),
  scale: z.number().positive().default(1),
  model: z.union([AssetModel, PartsModel]),
  properties: ObjectProperties.prefault({}),
  /** Verb ids this object makes possible: a workbench unlocks `build`, a plot unlocks `plant`. */
  unlocks: z.array(z.string().min(1)).default([]),
  /** A source of a material (driftwood, a clay bank) that refills slowly. */
  yields: z.object({ material: Material, max: z.number().int().positive(), respawnHours: z.number().positive() }).optional(),
  /** A plant: once watered it ripens after `hours`, then `harvest` gives `gives`. */
  grows: z.object({ hours: z.number().positive(), gives: Material }).optional(),
  /** Food and the like go off this many hours after being made or picked. */
  spoilsAfterHours: z.number().positive().optional(),
  state: ObjectState.default({}),
  made: MadeInfo.optional(),
  affordances: z.array(Affordance).default([]),
  /** Optional sandboxed script for the object (M6). */
  behavior: z.string().regex(/^behaviors\/[a-z0-9-]+\.js$/, 'a file under behaviors/').optional(),
  /** Why the forkling wanted it. */
  reason: z.string().min(1).max(200),
})
export type WorldObject = z.infer<typeof WorldObject>

/** The object id for an `objects/<id>.json` path, or null for anything else. */
export function objectIdFromPath(path: string): string | null {
  return /^objects\/([a-z0-9][a-z0-9-]*)\.json$/.exec(path)?.[1] ?? null
}

/** A visitor action waiting in `events/inbox/`. Untrusted: text is length-limited and never treated as instructions. */
export const VisitorEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('gift'), payload: z.object({ item: z.string().min(1).max(40) }) }),
  z.object({ type: z.literal('plant'), payload: z.object({ plant: z.string().min(1).max(40) }) }),
  z.object({ type: z.literal('bell'), payload: z.object({}).default({}) }),
  z.object({ type: z.literal('message'), payload: z.object({ text: z.string().min(1).max(280) }) }),
]).and(
  z.object({
    visitorId: z.string().regex(/^v_[a-z0-9]{3,32}$/, 'an anonymous visitor id like v_3f9a'),
    createdAt: Timestamp,
  }),
)
export type VisitorEvent = z.infer<typeof VisitorEvent>

/**
 * Problems with a forkling that only show up next to its species pack: a different species, needs the pack doesn't
 * declare, or an intention that isn't one of its actions. Empty when they match.
 */
export function forklingPackIssues(forkling: Forkling, pack: SpeciesPack): string[] {
  const issues: string[] = []
  if (forkling.species !== pack.id) issues.push(`species is "${forkling.species}" but the pack is "${pack.id}"`)
  for (const need of Object.keys(forkling.needs)) {
    if (!(need in pack.needs)) issues.push(`a ${pack.id} has no need called "${need}"`)
  }
  if (!pack.actions.some((a) => a.id === forkling.intention.type)) {
    issues.push(`"${forkling.intention.type}" is not something a ${pack.id} can do (try: ${pack.actions.map((a) => a.id).join(', ')})`)
  }
  return issues
}
