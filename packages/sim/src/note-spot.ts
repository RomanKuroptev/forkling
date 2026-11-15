import type { Place } from '@forkling/schema'
import { placeCentre, toLandPlace } from './land.ts'
import { doorOf } from './paths.ts'

/**
 * What a visitor is told before sending a note (spec 10.1), in one place so the site's form and the viewer's say the same thing:
 * public, kept for good in a public repository, read by an AI, what is taken out, and the daily limit.
 */
export const NOTE_DISCLOSURE: readonly string[] = [
  'Notes are public. Anyone can read them on this page.',
  'A note is kept permanently in a public repository, even if it is later hidden from this site.',
  'A note is read by an AI: a small model screens it first, and then Merge, which is an AI, reads it.',
  'Links, email addresses and phone numbers are taken out. You can leave 3 notes a day.',
]

export interface NoteFateInput {
  status: string
  reply: string | null
  declineReason: string | null
  foundAt: string | null
}

/** What became of a note, in plain words: a lead, and the reply or the reason after it. `foundOn` is the day it was found, in Merge's time. */
export function noteFate(note: NoteFateInput, foundOn: string): { lead: string; detail: string | null } {
  if (note.status === 'found') return { lead: `Found by Merge on ${foundOn}. Not answered yet.`, detail: null }
  if (note.status === 'replied') return { lead: 'Merge replied:', detail: note.reply ?? '' }
  if (note.status === 'kept') return { lead: 'Merge kept this note.', detail: null }
  if (note.status === 'declined') return { lead: 'Merge declined this note:', detail: note.declineReason ?? '' }
  return { lead: 'Not found yet.', detail: null }
}

/** A small number from a string, the same every time: the same note always lies in the same place. */
function unit(text: string, salt: number): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10_000) / 10_000
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Where a paper note lies in the world, as `[x, z]` (spec 10.1): where the visitor stood when they wrote it, or, for a note with no
 * spot (written on the notes page, which is Home's mailbox), by the door of its place: a little way out in front of the front wall
 * and spread along it by the note's id, so a pile of notes does not lie on one point. A note for a place that is not there lies
 * by Home's door. Pure and deterministic.
 */
export function noteSpot(note: { id: string; placeId: string; position?: readonly unknown[] | null | undefined }, places: readonly Place[]): [number, number] {
  const p = note.position
  if (p && p.length === 2 && finite(p[0]) && finite(p[1])) return [p[0], p[1]]
  const place = places.find((x) => x.id === note.placeId) ?? places.find((x) => x.id === 'home') ?? places[0]
  if (!place) return [0, 0]
  const [dx, dz] = doorOf(toLandPlace(place))
  return [dx + (unit(note.id, 1) - 0.5) * 3, dz + 1 + unit(note.id, 2) * 1.2]
}

/** The place a visitor is standing in: the one whose footprint holds the point, or else the nearest by its middle. Null if there are no places. */
export function placeAt(point: readonly [number, number], places: readonly Place[]): Place | null {
  let nearest: Place | null = null
  let best = Number.POSITIVE_INFINITY
  for (const place of places) {
    const land = toLandPlace(place)
    const [cx, cz] = placeCentre(land)
    const [w, d] = land.footprint
    if (Math.abs(point[0] - cx) <= w / 2 && Math.abs(point[1] - cz) <= d / 2) return place
    const dist = Math.hypot(point[0] - cx, point[1] - cz)
    if (dist < best) {
      best = dist
      nearest = place
    }
  }
  return nearest
}
