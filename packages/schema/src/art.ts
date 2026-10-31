import { z } from 'zod'
import { Timestamp } from './intention.ts'

export const ARTIFACT_KINDS = ['writing', 'drawing', 'melody', 'recipe', 'broadcast', 'labnote'] as const
export const ArtifactKind = z.enum(ARTIFACT_KINDS)
export type ArtifactKind = z.infer<typeof ArtifactKind>

/** Text in an artifact is cut to this, so a file in the repo stays small. */
export const MAX_ARTIFACT_TEXT = 4000
/** Drawings are SVG source, kept small. */
export const MAX_SVG_CHARS = 12_000
export const MAX_MELODY_NOTES = 64

const Text = z.string().min(1).max(MAX_ARTIFACT_TEXT)

/** A note as Tone.js reads it: a letter, an optional sharp or flat, an octave. `R` is a rest. */
export const Pitch = z.string().regex(/^([A-G][#b]?[1-7]|R)$/, 'like C4, F#3 or R for a rest')

/** The content of each kind. The model never picks the shape: the verb does, and code checks it. */
export const ArtContent = {
  writing: z.object({ text: Text }),
  drawing: z.object({ svg: z.string().min(1).max(MAX_SVG_CHARS) }),
  melody: z.object({
    bpm: z.number().int().min(40).max(200),
    notes: z.array(z.object({ pitch: Pitch, beats: z.number().min(0.25).max(4) })).min(1).max(MAX_MELODY_NOTES),
  }),
  recipe: z.object({
    ingredients: z.array(z.object({ name: z.string().min(1).max(60), grams: z.number().min(1).max(5000) })).min(1).max(12),
    steps: z.array(z.string().min(1).max(300)).min(1).max(12),
  }),
  broadcast: z.object({ script: Text }),
  labnote: z.object({ question: z.string().min(1).max(300), method: z.string().min(1).max(MAX_ARTIFACT_TEXT), result: z.string().min(1).max(MAX_ARTIFACT_TEXT) }),
} as const

const Meta = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/, 'lowercase words with dashes'),
  title: z.string().min(1).max(80),
  /** How practised it was in the verb group when it made this. Early work is simpler. */
  skillLevel: z.number().int().min(0).max(10),
  goalRef: z.string().max(40).optional(),
  /** The obsession topic it served, if any. */
  obsessionRef: z.string().max(60).optional(),
  createdAt: Timestamp,
})

/** `art/<id>.json`: something the forkling made. */
export const Artifact = z.discriminatedUnion('kind', [
  Meta.extend({ kind: z.literal('writing'), content: ArtContent.writing }),
  Meta.extend({ kind: z.literal('drawing'), content: ArtContent.drawing }),
  Meta.extend({ kind: z.literal('melody'), content: ArtContent.melody }),
  Meta.extend({ kind: z.literal('recipe'), content: ArtContent.recipe }),
  Meta.extend({ kind: z.literal('broadcast'), content: ArtContent.broadcast }),
  Meta.extend({ kind: z.literal('labnote'), content: ArtContent.labnote }),
])
export type Artifact = z.infer<typeof Artifact>

/**
 * What the model returns for each kind: a title and the content, flat, in plain strings and numbers so it fits
 * structured outputs. Code clamps it and checks it against `Artifact` before anything is written.
 */
export const ArtOutput = {
  writing: z.object({ title: z.string(), text: z.string() }),
  drawing: z.object({ title: z.string(), svg: z.string() }),
  melody: z.object({ title: z.string(), bpm: z.number(), notes: z.array(z.object({ pitch: z.string(), beats: z.number() })) }),
  recipe: z.object({ title: z.string(), ingredients: z.array(z.object({ name: z.string(), grams: z.number() })), steps: z.array(z.string()) }),
  broadcast: z.object({ title: z.string(), script: z.string() }),
  labnote: z.object({ title: z.string(), question: z.string(), method: z.string(), result: z.string() }),
} as const
