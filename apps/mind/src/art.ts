import { z } from 'zod'
import { Artifact, ArtOutput, ARTIFACT_KINDS, MAX_ARTIFACT_TEXT, MAX_MELODY_NOTES, Pitch, type ArtifactKind, type Interests, type TemperamentRoll } from '@forkling/schema'
import { sanitizeSvg } from '@forkling/sim'
import { clampText } from './decision.ts'

/** About four things a day, so the island fills with work but the bill stays small. */
export const MAX_ARTIFACTS_PER_DAY = 4

export type ArtOutputs = { [K in ArtifactKind]: z.infer<(typeof ArtOutput)[K]> }

export interface ArtMeta {
  /** Practice in the verb group when it made this. */
  skillLevel: number
  goalRef?: string | undefined
  obsessionRef?: string | undefined
  nowIso: string
  /** Ids already in `art/`. */
  takenIds: ReadonlySet<string>
  /** For a photo: the shot it came from. The frame is `photos/<id>.jpg`, and the artifact takes the shot's id. */
  photo?: { id: string; subjectId?: string | undefined; noticed: boolean } | undefined
  /** For a contraption: how its run went, as the physics measured it. */
  contraption?: { objectId: string; moved: boolean; maxTravel: number; settled: boolean } | undefined
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo))

export function uniqueId(title: string, kind: string, taken: ReadonlySet<string>): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || kind
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

/**
 * What the model returned, as a checked artifact: lengths and ranges forced into what the schema allows, drawings run
 * through the sanitizer, bad notes dropped. Null when nothing usable is left. The model never chooses the shape.
 */
export function artifactFrom<K extends ArtifactKind>(kind: K, output: ArtOutputs[K], meta: ArtMeta): Artifact | null {
  const title = clampText(output.title.trim() || 'Untitled', 80)
  const text = (s: string, max = MAX_ARTIFACT_TEXT) => clampText(s.trim(), max)
  const o = output as ArtOutputs[ArtifactKind]
  let content: unknown
  let id = uniqueId(title, kind, meta.takenIds)
  switch (kind) {
    case 'writing':
      content = { text: text((o as ArtOutputs['writing']).text) }
      break
    case 'drawing':
      content = { svg: sanitizeSvg((o as ArtOutputs['drawing']).svg) ?? '' }
      break
    case 'melody': {
      const m = o as ArtOutputs['melody']
      content = {
        bpm: Math.round(clamp(m.bpm, 40, 200)),
        notes: m.notes
          .filter((n) => Pitch.safeParse(n.pitch).success)
          .slice(0, MAX_MELODY_NOTES)
          .map((n) => ({ pitch: n.pitch, beats: clamp(n.beats, 0.25, 4) })),
      }
      break
    }
    case 'recipe': {
      const r = o as ArtOutputs['recipe']
      content = {
        ingredients: r.ingredients.slice(0, 12).map((i) => ({ name: clampText(i.name.trim(), 60) || 'something', grams: Math.round(clamp(i.grams, 1, 5000)) })),
        steps: r.steps.map((s) => text(s, 300)).filter(Boolean).slice(0, 12),
      }
      break
    }
    case 'broadcast':
      content = { script: text((o as ArtOutputs['broadcast']).script) }
      break
    case 'labnote': {
      const l = o as ArtOutputs['labnote']
      content = { question: text(l.question, 300), method: text(l.method), result: text(l.result) }
      break
    }
    case 'contraption': {
      const c = o as ArtOutputs['contraption']
      if (!meta.contraption) return null
      content = {
        objectId: meta.contraption.objectId,
        moved: meta.contraption.moved,
        maxTravel: Math.round(Math.max(0, meta.contraption.maxTravel) * 100) / 100,
        settled: meta.contraption.settled,
        notes: text(c.notes),
        opinion: text(c.opinion, 300),
      }
      break
    }
    case 'photo': {
      const p = o as ArtOutputs['photo']
      if (!meta.photo) return null
      id = meta.photo.id
      content = {
        image: `photos/${meta.photo.id}.jpg`,
        caption: text(p.caption, 400),
        opinion: text(p.opinion, 300),
        ...(meta.photo.subjectId ? { subjectId: meta.photo.subjectId } : {}),
        noticed: meta.photo.noticed,
      }
      break
    }
  }
  const parsed = Artifact.safeParse({
    id,
    kind,
    title,
    content,
    skillLevel: Math.round(clamp(meta.skillLevel, 0, 10)),
    ...(meta.goalRef ? { goalRef: meta.goalRef } : {}),
    ...(meta.obsessionRef ? { obsessionRef: clampText(meta.obsessionRef, 60) } : {}),
    createdAt: meta.nowIso,
  })
  return parsed.success ? parsed.data : null
}

/** The format of each kind, as the model should read it. */
const FORMATS: Record<ArtifactKind, string> = {
  writing: 'Write it as text: a poem, a page of notes, a short essay, whatever the subject wants. Under 1500 characters.',
  drawing:
    'Draw it as one SVG with viewBox="0 0 100 100". Use only rect, circle, ellipse, line, polyline, polygon, path, text, g, and linear or radial gradients, with plain fill and stroke colours. No scripts, no images, no links, no style tags, no fixed width or height. Under 3000 characters.',
  melody: 'Compose a short tune: bpm (40 to 200) and up to 32 notes, each a pitch like C4, F#3 or Bb4 (octaves 1 to 7), or R for a rest, and beats (0.25 to 4).',
  recipe: 'Write a recipe: ingredients with amounts in grams, and numbered steps. Use things that could really be found or made on a small island.',
  broadcast: 'Write the script of a short radio show for an audience of nobody, in your own voice. Under 1500 characters.',
  labnote: 'Write a lab note about a small experiment or observation on the island: the question, what you did, and what happened.',
  contraption: 'Say what happened when your contraption ran (what moved, how it ended) in your own words, and what you think of it. What happened is given to you: do not claim anything else.',
  photo: 'Say what you see in the picture: a title, a caption of what is in it, and your own opinion of it.',
}

/** How good the work is follows how practised the hand is: early work is simple, and only practice changes that. */
export function skillGuide(level: number): string {
  if (level <= 2) return 'You are a beginner. Your work is simple, short and a little clumsy, with obvious mistakes. Do not be better than you are.'
  if (level <= 5) return 'You are getting the hang of it. Your work is competent, with ideas that come across, and some rough edges.'
  if (level <= 8) return 'You are skilled. Your work is careful and has a clear idea behind it.'
  return 'You are a master of this. Your work is polished and confident.'
}

export interface ArtInput {
  kind: ArtifactKind
  /** What it is about, in its own words. */
  topic: string | null
  /** The step's reason, in its voice. */
  reason: string
  skillLevel: number
  /** The obsession topic this serves, if any. */
  obsession: string | null
  /** Titles of its latest work, so it makes something different. */
  recentTitles: readonly string[]
  interests: Interests
  temperament: TemperamentRoll | null
  date: string
  /** For a contraption: how the run went, as the physics measured it. It is handed over as fact. */
  run?: { name: string; moved: boolean; maxTravel: number; settled: boolean } | undefined
}

/** The user part of an artifact call (Haiku). */
export function buildArtUser(i: ArtInput): string {
  const taste = (list: readonly { category: string; value: string }[]) => list.map((t) => `${t.value} (${t.category})`).join(', ') || 'nothing in particular'
  const top = Object.entries(i.interests.topics)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 5)
    .map(([topic]) => topic)
  return [
    ...(i.temperament
      ? ['<you>', `likes: ${taste(i.temperament.likes)}`, `dislikes: ${taste(i.temperament.dislikes)}`, ...i.temperament.quirks.map((q) => `quirk (${q.id}): ${q.text}`), '</you>', '']
      : []),
    ...(top.length > 0 ? ['<interests>', top.join(', '), '</interests>', ''] : []),
    ...(i.run
      ? ['<run>', `contraption: ${clampText(i.run.name, 60)}`, `what happened: ${i.run.moved ? `something moved ${Math.round(i.run.maxTravel * 100) / 100} m` : 'nothing moved'}; ${i.run.settled ? 'everything came to rest' : 'it was still moving at the end'}`, '</run>', '']
      : []),
    '<topic>',
    i.topic ?? 'whatever is on your mind',
    '</topic>',
    '',
    '## Your task',
    `It is ${i.date}. You are making a ${i.kind}. Your reason: ${i.reason}`,
    FORMATS[i.kind],
    `Your skill level is ${i.skillLevel} of 10. ${skillGuide(i.skillLevel)}`,
    ...(i.obsession ? [`You are obsessed with "${i.obsession}" at the moment, so it may show.`] : []),
    ...(i.recentTitles.length > 0 ? [`Your latest work: ${i.recentTitles.map((t) => `"${t}"`).join(', ')}. Make something different.`] : []),
    'Give it a title of its own. Answer only with the JSON the schema asks for.',
  ].join('\n')
}

export const KINDS = ARTIFACT_KINDS
