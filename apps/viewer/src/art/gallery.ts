import type { Artifact } from '@forkling/schema'
import { sanitizeSvg, type Point2 } from '@forkling/sim'

/** How close a visitor has to be to hear it play. */
export const MELODY_RANGE = 8

const newestFirst = (a: Artifact, b: Artifact) => b.createdAt.localeCompare(a.createdAt)

/** The newest drawings, for the frames by the house. */
export function pickDrawings(art: readonly Artifact[], count: number): Extract<Artifact, { kind: 'drawing' }>[] {
  return art.filter((a): a is Extract<Artifact, { kind: 'drawing' }> => a.kind === 'drawing').sort(newestFirst).slice(0, count)
}

/** The newest tune it has made. */
export function pickMelody(art: readonly Artifact[]): Extract<Artifact, { kind: 'melody' }> | null {
  return art.filter((a): a is Extract<Artifact, { kind: 'melody' }> => a.kind === 'melody').sort(newestFirst)[0] ?? null
}

export interface ScheduledNote {
  pitch: string
  /** Seconds from the start. */
  at: number
  /** Seconds, a little shorter than the beat so notes don't smear. */
  duration: number
}

/** A melody laid out in seconds from its tempo. Rests take time but make no sound. */
export function noteSchedule(melody: Extract<Artifact, { kind: 'melody' }>['content']): { notes: ScheduledNote[]; length: number } {
  const beat = 60 / melody.bpm
  const notes: ScheduledNote[] = []
  let at = 0
  for (const n of melody.notes) {
    if (n.pitch !== 'R') notes.push({ pitch: n.pitch, at, duration: n.beats * beat * 0.9 })
    at += n.beats * beat
  }
  return { notes, length: at }
}

/**
 * An address a texture can load a drawing from. The drawing is cleaned first: it was written by a model, and an image
 * is the one place a browser would otherwise take the markup as it is. Null if nothing safe is left.
 */
export function svgDataUrl(svg: string): string | null {
  const clean = sanitizeSvg(svg)
  if (!clean) return null
  // An SVG loaded as an image must declare its namespace.
  const named = clean.includes('xmlns=') ? clean : clean.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(named)}`
}

/** Whether the visitor can hear its music: it is composing or playing, and they are within earshot. */
export function hearsMelody(action: { id: string; artifact?: string | undefined }, forkling: Point2, visitor: Point2 | null): boolean {
  if (!visitor) return false
  if (action.artifact !== 'melody' && action.id !== 'play') return false
  return Math.hypot(forkling.x - visitor.x, forkling.z - visitor.z) <= MELODY_RANGE
}
