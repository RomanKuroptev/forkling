import { z } from 'zod'

/** Spec v4 8: at most this many entries in `mind/tools.json`. */
export const MAX_TOOLS = 40

/** `read` brings something in; `act` would send something out. The schema accepts `act` so the engine can refuse it in plain words (see `actTools`). */
export const ToolClass = z.enum(['read', 'act'])
export type ToolClass = z.infer<typeof ToolClass>

/** One thing Merge has been given, written as a plain ability. Only Roman edits `mind/tools.json`. */
export const Tool = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, 'lowercase words with dashes'),
    name: z.string().min(1).max(40),
    /** In plain words, up to 160 characters: what Merge can now do. Shown to Merge as "things you can do". */
    what: z.string().min(1).max(160),
    since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'like 2026-11-22'),
    class: ToolClass,
    /** True when Merge never asked for it. */
    gift: z.boolean().default(false),
  })
  .strict()
export type Tool = z.infer<typeof Tool>

/** `mind/tools.json` (spec v4 8): what Merge can do, as a list. */
export const Tools = z
  .object({ tools: z.array(Tool).max(MAX_TOOLS).default([]) })
  .strict()
  .refine((f) => new Set(f.tools.map((t) => t.id)).size === f.tools.length, { path: ['tools'], message: 'a tool id is used once' })
export type Tools = z.infer<typeof Tools>

/** The entries of class `act`. The engine does not start while there is one: nothing Merge can do reaches outside its own world at launch. */
export const actTools = (f: Pick<Tools, 'tools'>): Tool[] => f.tools.filter((t) => t.class === 'act')
