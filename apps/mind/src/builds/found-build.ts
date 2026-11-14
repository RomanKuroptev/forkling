import { z } from 'zod'
import { Place, type Kit, type PlaceRequest } from '@forkling/schema'
import { clampText } from '../decision.ts'
import { dataBlock } from '../web/read.ts'
import { RoomDraft, kitSummary } from './expand.ts'

/** A plain place is a few rooms of parts; the limit is generous, since thinking at low effort counts as output. */
export const FOUND_BUILD_MAX_TOKENS = 12_000
/** The limits of the fallback build (spec 10.3: at most 2 rooms and 30 parts; 5.2: 24 by 24 meters). */
export const FOUND_BUILD_LIMITS = { rooms: 2, parts: 30, footprint: 24 } as const

/**
 * What the model answers: the look of the building and its rooms, flat, with plain numbers. The name and the purpose are the
 * request's own, the sign is made from the name, and the exhibits are empty, so there is nothing of Merge's words to write.
 */
export const FoundBuildAnswer = z.object({
  style: z.string().min(1).max(40).describe('A style id from the list.'),
  palette: z.string().min(1).max(40).describe('A palette id from the list.'),
  width: z.number().describe('The footprint, in meters, at most 24.'),
  depth: z.number().describe('The footprint, in meters, at most 24.'),
  floors: z.number().int().describe('1 or 2.'),
  rooms: z.array(RoomDraft).min(1).max(3).describe('1 to 2 rooms, at most 30 parts in all.'),
})
export type FoundBuildAnswer = z.infer<typeof FoundBuildAnswer>

export interface FoundBuildPromptInput {
  request: PlaceRequest
  kit: Kit
  /** Where the place will stand. */
  chunk: readonly [number, number]
}

/** What the fallback build asks for: the request, the kit, and the limits. Merge's own request is shown as data. */
export function buildFoundBuildUser(i: FoundBuildPromptInput): string {
  const { request } = i
  return [
    `You asked Roman for a place, ${clampText(request.name, 40)}, and nobody has answered it in 7 days, so the builders make a plain version for you from the kit.`,
    `Its purpose, in your words: ${clampText(request.purpose, 160)}`,
    `Its tags: ${request.tags.join(', ')}. It will stand on chunk ${i.chunk.join(', ')}.`,
    'What you wrote when you asked:',
    dataBlock('data', request.body, { source: 'request' }),
    '',
    `The styles: ${i.kit.styles.map((s) => `${s.id} (${s.name})`).join(', ')}.`,
    `The palettes: ${i.kit.palettes.map((p) => p.id).join(', ')}.`,
    'The kit: every part you may use (id | category | size in meters | slots):',
    kitSummary(i.kit),
    '',
    'Rules for the plain place:',
    `- 1 to ${FOUND_BUILD_LIMITS.rooms} rooms, and at most ${FOUND_BUILD_LIMITS.parts} parts in all, counted over every room.`,
    `- The footprint is at most ${FOUND_BUILD_LIMITS.footprint} by ${FOUND_BUILD_LIMITS.footprint} meters, 1 or 2 floors. Every room fits inside the footprint and does not overlap another room on the same floor; its position is where its middle is, in meters from the middle of the building.`,
    '- Use only kit parts from the list above. You never write 3D code. A part sits inside its room, and its position is in meters from the middle of the room, y up.',
    "- Choose a style and a palette that suit the place. The name and the purpose are the request's, the sign is made from the name, and there are no exhibits: they come later, when you tend the place. Roman can still build the full version later on the same chunk.",
  ].join('\n')
}

export interface FoundBuildContext {
  request: PlaceRequest
  placeId: string
  chunk: readonly [number, number]
  nowIso: string
  /** The local date, for `founded`. */
  today: string
}

/**
 * The answer as a whole place file (spec 10.3): the request's name, purpose, tags and related places, the model's look and rooms, an
 * empty set of exhibits, and a history line that says who had the idea and who built it. Throws when the answer does not fit the
 * place schema (the caller turns that into a reason).
 */
export function toFoundBuildPlace(a: FoundBuildAnswer, c: FoundBuildContext): Place {
  const { request } = c
  return Place.parse({
    id: c.placeId,
    name: request.name,
    purpose: request.purpose,
    tags: request.tags,
    founded: c.today,
    chunk: [...c.chunk],
    related: request.related,
    exterior: { style: a.style, footprint: [a.width, a.depth], floors: a.floors, palette: a.palette, sign: request.name.toUpperCase().slice(0, 24) },
    rooms: a.rooms.map((r) => ({ id: r.id, name: r.name, size: [r.width, r.depth, r.height], at: [r.x, r.z], floor: r.floor, parts: r.parts.map((p) => ({ part: p.part, at: [p.x, p.y, p.z], rot: p.rot })) })),
    exhibits: [],
    state: { construction: null, lastCareAt: null, neglect: 0, lamps: true },
    history: [{ at: c.nowIso, verb: 'found', summary: 'Asked for by Merge, built by Merge from the kit.' }],
  })
}
