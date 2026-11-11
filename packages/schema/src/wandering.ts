import { z } from 'zod'
import { Timestamp } from './intention.ts'

/** Image licences the code can read and allows (spec 6.3). */
export const SOUVENIR_LICENCES = ['public domain', 'CC0', 'CC BY', 'CC BY-SA'] as const
export const SouvenirLicence = z.enum(SOUVENIR_LICENCES)

export const MAX_QUOTE_CHARS = 280
export const MAX_FACT_CHARS = 200
export const MAX_TRIP_READS = 6

const SouvenirSource = z.object({
  url: z.string().min(1).max(500),
  title: z.string().max(200),
  fetchedAt: Timestamp,
})

const common = {
  id: z.string().min(1).max(80),
  why: z.string().max(300),
  topics: z.array(z.string().min(1).max(60)).max(3).default([]),
  source: SouvenirSource,
  licence: SouvenirLicence.nullable().default(null),
  /** The place whose exhibit holds it, or null while it is in the pile. */
  placedIn: z.string().max(80).nullable().default(null),
}

/**
 * `souvenirs/<date>-<slug>.json` (spec 6.3). A quote must appear word for word in the cleaned page; a fact is Merge's
 * sentence with the excerpt it rests on; an image is one of the item's images with a licence the code can read.
 * Code checks the word-for-word rule when the souvenir is made: this schema holds the shape and the limits.
 */
export const Souvenir = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('quote'), content: z.string().min(1).max(MAX_QUOTE_CHARS) }),
  z.object({
    ...common,
    kind: z.literal('fact'),
    content: z.string().min(1).max(MAX_FACT_CHARS),
    evidence: z.string().min(1).max(MAX_QUOTE_CHARS),
  }),
  z.object({
    ...common,
    kind: z.literal('image'),
    /** The image URL. */
    content: z.string().min(1).max(500),
    licence: SouvenirLicence,
    credit: z.string().min(1).max(200),
  }),
])
export type Souvenir = z.infer<typeof Souvenir>

/** One read on a trip. A failed fetch is a page with `failed` and no reaction. */
export const TrailPage = z.object({
  url: z.string().min(1).max(500),
  title: z.string().max(200),
  fetchedAt: Timestamp,
  /** Up to 60 words. */
  reaction: z.string().max(600).optional(),
  topics: z.array(z.string().min(1).max(60)).max(3).default([]),
  /** The read call's 0 to 10: how much this item gave Merge. Its own taste, not a quality rating. */
  interest: z.number().min(0).max(10).optional(),
  souvenirId: z.string().max(80).optional(),
  /** What it saw when it looked at the page's picture (spec 7.8). */
  look: z.string().max(600).optional(),
  failed: z.string().max(200).optional(),
})
export type TrailPage = z.infer<typeof TrailPage>

/** `trails/<date>-<n>.json` (spec 6.4): a trip as a chain of reads. */
export const Trail = z.object({
  id: z.string().min(1).max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purpose: z.string().max(300),
  start: z.object({ kind: z.enum(['topic', 'feed', 'souvenir']), value: z.string().min(1).max(300) }),
  pages: z.array(TrailPage).min(1).max(MAX_TRIP_READS),
})
export type Trail = z.infer<typeof Trail>

/** A host's numbers for one week (spec 6.6). Shown, not used. */
export const HostWeek = z.object({
  reads: z.number().int().nonnegative(),
  souvenirs: z.number().int().nonnegative(),
  /** Souvenirs later placed, used in a build or cited by a reflection. */
  placed: z.number().int().nonnegative(),
  /** Items whose interest was 3 or less. */
  boring: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
})
export type HostWeek = z.infer<typeof HostWeek>

/** `mind/sources.json`: each host's weekly numbers, by ISO week then host. */
export const SourceStats = z.object({ weeks: z.record(z.string(), z.record(z.string(), HostWeek)).default({}) })
export type SourceStats = z.infer<typeof SourceStats>
