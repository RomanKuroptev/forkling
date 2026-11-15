import type { Note, Place } from '@forkling/schema'
import { noteSpot } from '@forkling/sim'

/** Only the newest notes are drawn as paper, so a busy mailbox cannot slow the world down. */
export const NOTE_MARK_LIMIT = 60

export const PAPER_COLORS = { new: '#fff7d6', found: '#ffc94a', replied: '#ff8fc0', kept: '#7fc4ff', declined: '#ff7a6b' } as const

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

/** The paper notes to draw: where each lies (`noteSpot`), a little above the ground, turned a fixed way by its id, coloured by what became of it. */
export function noteMarks(notes: readonly Note[], places: readonly Place[], heightAt: (x: number, z: number) => number): NoteMark[] {
  return [...notes]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, NOTE_MARK_LIMIT)
    .map((note) => {
      const [x, z] = noteSpot(note, places)
      return {
        id: note.id,
        position: [x, heightAt(x, z) + 0.04, z],
        rotY: unit(note.id) * Math.PI * 2,
        color: PAPER_COLORS[note.status],
        title: `A note from ${note.name.trim() || 'a visitor'}`,
        text: WHAT_BECAME[note.status],
      }
    })
}
