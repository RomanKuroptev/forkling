import { z } from 'zod'
import { Vec3 } from './geometry.ts'
import { Intention, Timestamp } from './intention.ts'
import type { SpeciesPack } from './species.ts'

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
const ForklingShape = z.object({
  name: z.string().min(1).max(40),
  /** Species pack id, e.g. `cat`. */
  species: Slug,
  /** Fixed at hatching. Makes this forkling's hours, temperament and tie-breaks its own. */
  seed: z.number().int().nonnegative().default(0),
  /** Where it is, in meters. y is ignored: the body snaps to the terrain. */
  position: Vec3,
  /** How it feels, from low (-1) to good (1). Changed only by the events in spec 3.2 (`packages/sim/src/mood.ts`). */
  mood: z.number().min(-1).max(1).default(0),
  /** How much it has in it, from spent (-1) to full (1). Set to +0.5 at wake. */
  energy: z.number().min(-1).max(1).default(0.5),
  intention: Intention,
  lastTickAt: Timestamp,
  /** True between bedtime and waking, as decided by the mind from the sleep schedule. */
  asleep: z.boolean().default(false),
  /** Local date (`YYYY-MM-DD`) on which the mind chose to stay up late. */
  lateNight: z.iso.date().optional(),
  /** IANA time zone of the forkling's world, so every viewer agrees on the time of day. */
  timezone: z.string().refine(isTimezone, 'not a known IANA time zone').default('UTC'),
})

/**
 * A `forkling.json` written before mood and energy were numbers has `needs`, `feelings` and a mood word. Those are
 * dropped on read (the next write leaves them out): the mood becomes the old valence, or steady without one, and
 * energy starts rested.
 */
function fromPetEra(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const { needs: _needs, feelings, mood, energy, ...rest } = raw as Record<string, unknown>
  const valence = (feelings as { valence?: unknown } | undefined)?.valence
  return {
    ...rest,
    ...(typeof mood === 'number' ? { mood } : typeof valence === 'number' ? { mood: Math.max(-1, Math.min(1, valence)) } : {}),
    ...(energy !== undefined && energy !== null ? { energy } : {}),
  }
}

export const Forkling = z.preprocess(fromPetEra, ForklingShape) as unknown as z.ZodType<z.output<typeof ForklingShape>, z.input<typeof ForklingShape>>
export type Forkling = z.infer<typeof Forkling>

/** One primitive of a composed model. Sizes are meters, `at` is relative to the object's origin. */
export const ModelPart = z.object({
  shape: z.enum(['box', 'sphere', 'cylinder', 'cone']),
  size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
  at: Vec3,
  rotation: Vec3.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'like #a67c52'),
})
export type ModelPart = z.infer<typeof ModelPart>

/**
 * Problems with a forkling that only show up next to its species pack: a different species or an intention that isn't one of its actions. Empty when they match.
 */
export function forklingPackIssues(forkling: Forkling, pack: SpeciesPack): string[] {
  const issues: string[] = []
  if (forkling.species !== pack.id) issues.push(`species is "${forkling.species}" but the pack is "${pack.id}"`)
  // A need the pack does not declare is not a problem: a world written by an older version keeps one the pack later dropped
  // (Merge's affection). The sim ignores it and the next write leaves it out.
  if (!pack.actions.some((a) => a.id === forkling.intention.type)) {
    issues.push(`"${forkling.intention.type}" is not something a ${pack.id} can do (try: ${pack.actions.map((a) => a.id).join(', ')})`)
  }
  return issues
}
