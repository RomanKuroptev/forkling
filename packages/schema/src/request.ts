import { z } from 'zod'
import { Timestamp } from './intention.ts'
import { PlaceId } from './place.ts'

/** Spec 10.3: at most 2 place requests and 5 wishes are open at once. */
export const MAX_OPEN_PLACE_REQUESTS = 2
export const MAX_OPEN_WISHES = 5

const RequestId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, 'lowercase words with dashes')
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

/**
 * `open` is waiting for Roman. `building` is Roman at work (it holds the fallback off for 14 more days). `built` and `declined` are
 * Roman's answers, `self-built` is the 7-day fallback, `withdrawn` is Merge taking it back (spec 9.9).
 */
export const RequestStatus = z.enum(['open', 'building', 'built', 'declined', 'self-built', 'withdrawn'])
export type RequestStatus = z.infer<typeof RequestStatus>

/** A wish has no fallback; after 30 days without a status it closes as `unanswered` and Merge may wish again. */
export const WishStatus = z.enum(['open', 'building', 'built', 'declined', 'unanswered', 'withdrawn'])
export type WishStatus = z.infer<typeof WishStatus>

export const isOpenRequest = (r: { status: RequestStatus }) => r.status === 'open' || r.status === 'building'
export const isOpenWish = (w: { status: WishStatus }) => w.status === 'open' || w.status === 'building'

/** The status rules both files share: an open one has no time, an answered one has, and a decline says why. */
function checkStatus(r: { status: string; statusAt: string | null; note: string | null }, ctx: z.RefinementCtx) {
  if (r.status === 'open' && r.statusAt !== null) ctx.addIssue({ code: 'custom', path: ['statusAt'], message: 'an open request has no status time' })
  if (r.status !== 'open' && r.statusAt === null) ctx.addIssue({ code: 'custom', path: ['statusAt'], message: 'a status other than open says when it was set' })
  if (r.status === 'declined' && !r.note) ctx.addIssue({ code: 'custom', path: ['note'], message: 'a decline says why' })
  if (r.note !== null && words(r.note) > 80) ctx.addIssue({ code: 'custom', path: ['note'], message: 'a note is up to 80 words' })
}

/**
 * `requests/<id>.md` (spec 10.3): what the found verb writes. The front matter is `key: value` lines (a value is JSON, or a bare
 * word, so Roman can write `status: built`), then the body in Merge's own voice. Roman sets `status`, `statusAt` and `note`;
 * his note reaches Merge inside a data block, never as instructions.
 *
 * A `gift` is something Roman built that Merge never asked for. It is filed built, so the record shows whose idea it was.
 */
export const PlaceRequest = z
  .object({
    id: RequestId,
    kind: z.enum(['place', 'gift']),
    name: z.string().min(3).max(40),
    purpose: z.string().min(1).max(160),
    tags: z.array(z.string().min(1).max(60)).min(1).max(3),
    /** The chunk the placement rule of 4.2 picked. */
    chunk: z.tuple([z.number().int(), z.number().int()]),
    related: z.array(PlaceId).max(3).default([]),
    /** Up to 5 souvenirs behind it. */
    souvenirs: z.array(z.string().min(1).max(80)).max(5).default([]),
    written: Timestamp,
    status: RequestStatus,
    statusAt: Timestamp.nullable().default(null),
    note: z.string().max(800).nullable().default(null),
    /** Up to 200 words about what it imagines and why. */
    body: z.string().min(1).max(2000),
  })
  .strict()
  .superRefine((r, ctx) => {
    checkStatus(r, ctx)
    if (words(r.body) > 200) ctx.addIssue({ code: 'custom', path: ['body'], message: 'the body is up to 200 words' })
    if (r.kind === 'gift' && r.status !== 'built') ctx.addIssue({ code: 'custom', path: ['status'], message: 'a gift is filed as built' })
  })
export type PlaceRequest = z.infer<typeof PlaceRequest>

const KEYS = ['id', 'kind', 'name', 'purpose', 'tags', 'chunk', 'related', 'souvenirs', 'written', 'status', 'statusAt', 'note'] as const

export function formatRequest(r: PlaceRequest): string {
  const lines = KEYS.map((k) => `${k}: ${JSON.stringify(r[k])}`)
  return `---\n${lines.join('\n')}\n---\n${r.body}\n`
}

/** Reads a request file, or null when it does not fit. The first `---` line after the opening one ends the front matter, so a body may hold dashes. */
export function parseRequest(text: string): PlaceRequest | null {
  if (!text.startsWith('---\n')) return null
  const end = text.indexOf('\n---\n', 3)
  if (end < 0) return null
  const header: Record<string, unknown> = {}
  for (const line of text.slice(4, end).split('\n')) {
    const m = /^([A-Za-z]+):\s*(.*)$/.exec(line)
    if (!m) return null
    const raw = m[2]!.trim()
    try {
      header[m[1]!] = JSON.parse(raw)
    } catch {
      header[m[1]!] = raw
    }
  }
  const body = text.slice(end + 5).replace(/\n$/, '')
  const parsed = PlaceRequest.safeParse({ ...header, body })
  return parsed.success ? parsed.data : null
}

/**
 * `wishes/<id>.json` (spec 5.3, 10.3): a part the kit lacks, or an object for an existing place. Wishing the same part again adds
 * to `count`. Roman may build it and set the status, as for a request.
 */
export const Wish = z
  .object({
    id: RequestId,
    name: z.string().min(1).max(40),
    description: z.string().min(1).max(200),
    forPlace: PlaceId.nullable(),
    count: z.number().int().min(1).max(999),
    written: Timestamp,
    status: WishStatus,
    statusAt: Timestamp.nullable().default(null),
    note: z.string().max(800).nullable().default(null),
  })
  .strict()
  .superRefine(checkStatus)
export type Wish = z.infer<typeof Wish>

/** A wish as a call proposes it (spec 5.3: up to 2 a call). Code gives it an id, the date, a count and a status. */
export const WishDraft = z
  .object({
    name: z.string().min(1).max(40),
    description: z.string().min(1).max(200),
    /** The place it is for, or null for the world at large. */
    forPlace: PlaceId.nullable(),
  })
  .strict()
export type WishDraft = z.infer<typeof WishDraft>
