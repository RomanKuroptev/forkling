import { z } from 'zod'
import { Timestamp } from './intention.ts'
import { InspiredBy } from './work.ts'
import { JobRequest } from './job.ts'

/**
 * A project (spec-v4 3.1): something Merge builds over more than one sitting, in `projects/<id>/` of the world repo:
 * `project.json`, `src/` (its static web files) and `shots/` (one screenshot per session). Merge writes the name, the aim, the
 * captions and the reasons; code sets the id, the dates, the costs and the status changes it is asked for. The engine never
 * suggests, assigns or lists a project.
 */

/** Spec-v4 3.1: at most 40 files, 500 KB a file, 2 MB in total in `src/`. A storage rail. */
export const PROJECT_LIMITS = { files: 40, fileBytes: 500 * 1024, totalBytes: 2 * 1024 * 1024 } as const
/** The kinds of file a project's `src/` may hold (spec-v4 3.1). */
export const PROJECT_EXTENSIONS: readonly string[] = ['.html', '.js', '.css', '.json', '.svg', '.txt', '.md']
/** At most this many projects are `building` at once (spec-v4 3.1): a storage rail, not a quota. */
export const MAX_BUILDING = 3
/** A session's turns end at 25 (spec-v4 3.3). */
export const MAX_SESSION_TURNS = 25

export const ProjectId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, 'lowercase words with dashes')
export type ProjectId = z.infer<typeof ProjectId>

export const ProjectStatus = z.enum(['building', 'done', 'abandoned'])
export type ProjectStatus = z.infer<typeof ProjectStatus>

/** One sitting (spec-v4 3.3). `engine` marks a caption the engine wrote itself (a session stopped by a limit), which stays out of the diary's input. */
export const ProjectSession = z.object({
  at: Timestamp,
  caption: z.string().min(1).max(140),
  usd: z.number().min(0),
  turns: z.number().int().min(0).max(MAX_SESSION_TURNS),
  /** The screenshot of its last run, `shots/<n>.png`, or null when there was none. */
  shot: z.string().regex(/^shots\/\d{1,5}\.png$/).nullable(),
  /** The last run showed an uncaught error or a blank screen. Work in progress may be broken. */
  broken: z.boolean(),
  engine: z.boolean().default(false),
})
export type ProjectSession = z.infer<typeof ProjectSession>

export const Project = z
  .object({
    id: ProjectId,
    name: z.string().min(3).max(40),
    aim: z.string().min(1).max(140),
    started: Timestamp,
    status: ProjectStatus,
    /** Why it was finished or dropped: required for `done` and `abandoned`, null while `building`. */
    reason: z.string().min(1).max(140).nullable().default(null),
    sessions: z.array(ProjectSession).default([]),
    /** A visitor note that gave the idea (spec v4 7), shared with a work's meta, or null. */
    inspiredBy: InspiredBy.nullable().default(null),
    /** The place slot that shows it, when a tend put it on a screen (spec-v4 3.4). */
    installedIn: z.string().max(80).nullable().default(null),
  })
  .superRefine((p, ctx) => {
    if (p.status !== 'building' && !p.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: `a project that is ${p.status} says why (a reason up to 140 characters)` })
    if (p.status === 'building' && p.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'a project that is still building has no reason yet' })
  })
export type Project = z.infer<typeof Project>

/** Whether a new project may start beside these (spec-v4 3.1): fewer than `MAX_BUILDING` are building. */
export function canStartProject(projects: readonly Pick<Project, 'status'>[]): { ok: true } | { ok: false; reason: string } {
  const building = projects.filter((p) => p.status === 'building').length
  if (building >= MAX_BUILDING) return { ok: false, reason: `${building} projects are building, and ${MAX_BUILDING} projects is the most at once: finish or drop one first` }
  return { ok: true }
}

/** The id of a new project: a slug of its first name, never one that is taken. Never changes after. */
export function projectIdFor(name: string, taken: readonly string[]): string {
  const slug =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'project'
  if (!taken.includes(slug)) return slug
  for (let n = 2; ; n++) if (!taken.includes(`${slug}-${n}`)) return `${slug}-${n}`
}

/**
 * A build session the mind asks the worker for (spec-v4 3.2, 3.3): the step's target (a project's id, or the name of a new one) and
 * its reason, Merge's own words, and the points in hand when the step started, which the session may not pass.
 */
export const SessionJob = JobRequest.extend({
  kind: z.literal('session'),
  target: z.string().min(1).max(60),
  reason: z.string().min(1).max(200),
  pointsInHand: z.number().int().nonnegative(),
})
export type SessionJob = z.infer<typeof SessionJob>

/** The id of the session job a build step asks for: from when the step started, so the step can find its own result. */
export const sessionJobId = (startedAt: string): string => `session-${startedAt.slice(0, 19).replace(/[-:T]/g, '')}`
