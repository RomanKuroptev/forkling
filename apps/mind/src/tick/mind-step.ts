import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { PlanStep } from '@forkling/schema'
import { MIND_VERBS } from '@forkling/sim'
import { clampText } from '../decision.ts'
import { claimsHuman, wordCount } from '../honesty.ts'
import type { Tick } from './context.ts'

export const isMindVerb = (verb: string): boolean => (MIND_VERBS as readonly string[]).includes(verb)

/**
 * A mind-verb step has run its time. `wander` runs a trip, `write` writes a note and a sketch is made; `rest` does nothing. The others are built
 * in later milestones, so for now they run as rest, and the record says so (spec 16). Every step that lands costs energy.
 */
export function landMindStep(t: Tick, step: PlanStep, index: number): void {
  t.moodEvents.push('stepCompleted')
  if (step.verb === 'write') {
    t.pendingNote = { step, index }
    return
  }
  if (step.verb === 'wander') {
    t.pendingTrip = { step, index }
    return
  }
  if (step.verb === 'tinker') {
    t.pendingWork = { step, index }
    return
  }
  if (step.verb === 'tend' && t.places.some((p) => p.id === step.targetId)) {
    t.pendingTend = { step, index }
    return
  }
  if (step.verb === 'revisit' && t.places.some((p) => p.id === step.targetId)) {
    t.pendingRevisit = { step, index }
    return
  }
  if (step.verb === 'expand' && t.places.some((p) => p.id === step.targetId)) {
    t.pendingExpand = { step, index }
    return
  }
  if (step.verb !== 'rest') {
    const text = `${step.verb} is not built yet, so it rested instead.`
    t.remember.push({ at: t.nowIso, kind: 'event', text, verb: step.verb })
    t.justNow.push(text)
  }
}

/** A mind-verb step that a new plan replaced before its time was up: nothing came of it. */
export function leaveMindStep(t: Tick, step: PlanStep): void {
  const text = `Left ${step.verb} before it was done.`
  t.remember.push({ at: t.nowIso, kind: 'event', text, verb: step.verb })
  t.justNow.push(text)
  t.parts.push(`left ${step.verb}`)
}

export const MAX_NOTE_WORDS = 300
const MAX_NOTE_TOKENS = 1500

export const NoteOutput = z.object({
  title: z.string().describe('A few words: what this is.'),
  text: z.string().describe('What you wrote, in your voice, up to 300 words.'),
})

/** What a write step asks for: the words stay Merge's, and the target and reason tell it what they are for. */
export function buildNoteUser(i: { target: string | null; reason: string; date: string; recent: readonly string[] }): string {
  return [
    `You are writing something down. ${i.target ? `It is about or for: ${clampText(i.target, 120)}.` : 'Nobody told you what it is for.'}`,
    `Why you chose to: ${clampText(i.reason, 200)}`,
    ...(i.recent.length > 0 ? ['', 'What you wrote before, so you do not repeat yourself:', ...i.recent.map((r) => `- ${clampText(r, 100)}`)] : []),
    '',
    `Write up to ${MAX_NOTE_WORDS} words in your own voice: a plaque, a short page or a letter, whichever it wants to be. Title it in a few words.`,
  ].join('\n')
}

/** The titles of the last few things it wrote, newest first, so a new one does not repeat them. */
export function recentTitles(dir: string, n = 5): string[] {
  const folder = join(dir, 'notebook', 'writing')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, n)
    .map((f) => /^# (.+)$/m.exec(readFileSync(join(folder, f), 'utf8'))?.[1])
    .filter((title): title is string => !!title)
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'note'

/** When a write step finishes, one Haiku call writes the words and a file in `notebook/` keeps them (spec 2.4, W1). */
export async function noteStep(t: Tick): Promise<void> {
  const pending = t.pendingNote
  if (!pending) return
  const { step } = pending
  const recent = recentTitles(t.dir)
  const user = buildNoteUser({ target: step.targetId ?? null, reason: step.reason, date: t.today, recent })
  const result = await t.ask('art', 'claude-haiku-5-5', user, NoteOutput, MAX_NOTE_TOKENS)
  if (!result) return
  const written = NoteOutput.safeParse(result.parsed)
  if (!written.success) {
    t.notes.push(`no usable writing (stopped: ${result.stopReason ?? 'unknown'})`)
    return
  }
  const title = clampText(written.data.title.trim() || 'Untitled', 60)
  const text = written.data.text.trim()
  if (!text) {
    t.notes.push('write: the model wrote nothing')
    return
  }
  if (wordCount(text) > MAX_NOTE_WORDS) {
    t.notes.push(`write: ${wordCount(text)} words is over the ${MAX_NOTE_WORDS} word limit, so it was dropped`)
    return
  }
  if (claimsHuman(text) || claimsHuman(title)) {
    t.notes.push('write: it claimed to be human, so it was dropped')
    t.remember.push({ at: t.nowIso, kind: 'event', text: 'Something I wrote was thrown away: it claimed a human life.', verb: 'write' })
    return
  }
  const time = t.nowIso.slice(11, 16).replace(':', '')
  const path = `notebook/writing/${t.today}-${time}-${slug(title)}.md`
  t.notebook.push({ path, text: `# ${title}\n\n${text}\n` })
  t.remember.push({ at: t.nowIso, kind: 'made', text: `write: ${title}`, verb: 'write', goalRef: `today:${pending.index}` })
  t.parts.push(`wrote "${title}"`)
}
