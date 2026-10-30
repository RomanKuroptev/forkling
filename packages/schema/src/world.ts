import { z } from 'zod'
import { Vec3 } from './geometry.ts'
import { Intention, Timestamp } from './intention.ts'
import { NeedId } from './species.ts'

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes')

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
  /** Current need values, 0 to 100. Which needs exist is up to the species pack. */
  needs: z.partialRecord(NeedId, z.number().min(0).max(100)),
  /** Where it is, in meters. y is ignored: the body snaps to the terrain. */
  position: Vec3,
  mood: z.string().min(1).max(40),
  intention: Intention,
  lastTickAt: Timestamp,
  /** IANA time zone of the forkling's world, so every viewer agrees on the time of day. */
  timezone: z.string().refine(isTimezone, 'not a known IANA time zone').default('UTC'),
})
export type Forkling = z.infer<typeof Forkling>

/** What a forkling can do with an object. Species packs decide which of these they can use. */
export const Affordance = z.enum(['sit', 'eat', 'play', 'sleep', 'climb', 'perch'])
export type Affordance = z.infer<typeof Affordance>

/** A model from the engine's shipped asset library, e.g. `nature/rock_largeA`. Primitive compositions arrive in M5. */
export const AssetModel = z.object({ asset: z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9_-]+$/, 'like nature/rock_largeA') }).strict()

/** `objects/<id>.json`: one thing in the world. */
export const WorldObject = z.object({
  id: Slug,
  kind: Slug,
  name: z.string().min(1).max(60),
  position: Vec3,
  /** Radians. */
  rotation: Vec3.default([0, 0, 0]),
  scale: z.number().positive().default(1),
  model: AssetModel,
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
