import type { Note, Place } from '@forkling/schema'
import { NOTE_PAPER } from './theme.ts'
import { noteSpot, placeCentre, toLandPlace } from '@forkling/sim'
import { FLOOR_TOP } from './kitBase.ts'
import { floorRect } from './stairs.ts'

/** Only the newest notes are drawn as paper, so a busy mailbox cannot slow the world down. */
export const NOTE_MARK_LIMIT = 60

export const PAPER_COLORS = NOTE_PAPER

export interface NoteMark {
  id: string
  position: [number, number, number]
  rotY: number
  color: string
  title: string
  text: string
}

const WHAT_BECAME: Record<Note['status'], string> = {
  new: 'Not found yet.',
  found: 'Found by Merge.',
  replied: 'Merge replied.',
  kept: 'Merge kept it.',
  declined: 'Merge declined it.',
}

function unit(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10_000) / 10_000
}

/** How far over the land a paper lies: the land rolls, so it is lifted clear of it. */
const ON_LAND = 0.04
/** How far over a room's floor a paper lies: the floor is flat, so its dark edge just clears it. */
const ON_FLOOR = 0.02

/**
 * The ground a note lies on: the ground floor's top when the spot is on the floor of a place (as far as its drawn floor reaches,
 * `floorRect`), at the base the place is drawn on (the land at its middle, as Places.tsx's `baseOfPlace`); else the land. A note
 * keeps no floor, so one written upstairs lies on the ground floor under that spot.
 */
function groundUnder(x: number, z: number, places: readonly Place[], heightAt: (x: number, z: number) => number): number {
  for (const place of places) {
    if (place.exterior.floors < 1) continue
    const [cx, cz] = placeCentre(toLandPlace(place))
    const r = floorRect(place)
    if (x >= cx + r.x0 && x <= cx + r.x1 && z >= cz + r.z0 && z <= cz + r.z1) return heightAt(cx, cz) + FLOOR_TOP + ON_FLOOR
  }
  return heightAt(x, z) + ON_LAND
}

/** The paper notes to draw: where each lies (`noteSpot`), a little above the ground (a room's floor indoors), turned a fixed way by its id, coloured by what became of it. */
export function noteMarks(notes: readonly Note[], places: readonly Place[], heightAt: (x: number, z: number) => number): NoteMark[] {
  return [...notes]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, NOTE_MARK_LIMIT)
    .map((note) => {
      const [x, z] = noteSpot(note, places)
      return {
        id: note.id,
        position: [x, groundUnder(x, z, places, heightAt), z],
        rotY: unit(note.id) * Math.PI * 2,
        color: PAPER_COLORS[note.status],
        title: `A note from ${note.name.trim() || 'a visitor'}`,
        text: WHAT_BECAME[note.status],
      }
    })
}
