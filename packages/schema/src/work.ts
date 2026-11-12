import { z } from 'zod'
import { Timestamp } from './intention.ts'
import { JobId } from './job.ts'

/** `index.html` is at most 150 KB (spec 7.1), and a sketch at most 4 KB (7.6). */
export const MAX_WORK_BYTES = 150 * 1024
export const MAX_SKETCH_BYTES = 4 * 1024

export const WorkKind = z.enum(['art', 'game', 'tool', 'sound', 'zine', 'meme'])
export type WorkKind = z.infer<typeof WorkKind>

/** `shelf` is shown, `scrap` failed its check (the scrap bin shows why), `retired` was put away by Merge (spec 9.9) and can be brought back. */
export const WorkStatus = z.enum(['shelf', 'scrap', 'retired'])
export type WorkStatus = z.infer<typeof WorkStatus>

/** The libraries the site serves from `lib/` (spec 7.1). */
export const WorkLibrary = z.enum(['p5', 'tone', 'three'])
export type WorkLibrary = z.infer<typeof WorkLibrary>

/** What a meme is drawn from (spec 7.7): a format it looked at, and a page it read about it. */
export const WorkSource = z.object({ role: z.enum(['looked', 'read']), url: z.url().max(500) })
export type WorkSource = z.infer<typeof WorkSource>

/**
 * `works/<id>/meta.json` (spec 7.1). The model writes the title, kind, about, interest, libraries and sources; code sets the
 * id, the date, the size and the status. `constraint` stays null until the constraint draw arrives in W6, and `installedIn`
 * until places arrive in W5.
 */
export const WorkMeta = z
  .object({
    id: JobId,
    title: z.string().min(1).max(40),
    kind: WorkKind,
    about: z.string().min(1).max(200),
    interest: z.string().max(60).nullable(),
    made: Timestamp,
    /** An earlier work this one remixes (spec 7.5). */
    remixOf: JobId.nullable().default(null),
    constraint: z.string().max(200).nullable().default(null),
    status: WorkStatus,
    scrapReason: z.string().min(1).max(300).optional(),
    size: z.enum(['full', 'sketch']),
    installedIn: z.string().max(80).nullable().default(null),
    libraries: z.array(WorkLibrary).max(3).default([]),
    sources: z.array(WorkSource).max(6).default([]),
  })
  .superRefine((meta, ctx) => {
    if (meta.status === 'scrap' && !meta.scrapReason) ctx.addIssue({ code: 'custom', path: ['scrapReason'], message: 'a scrap says why' })
    if (meta.status !== 'scrap' && meta.scrapReason) ctx.addIssue({ code: 'custom', path: ['scrapReason'], message: 'only a scrap has a scrap reason' })
    if (meta.kind === 'meme') {
      for (const role of ['looked', 'read'] as const) {
        if (!meta.sources.some((s) => s.role === role)) ctx.addIssue({ code: 'custom', path: ['sources'], message: `a meme names a format it ${role === 'looked' ? 'looked at' : 'read about'}` })
      }
    }
  })
export type WorkMeta = z.infer<typeof WorkMeta>
