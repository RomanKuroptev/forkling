import { MEMORY_SLOTS, type Belief, type Goals, type MemorySlots, type Reflection, type StreamEntry } from '@forkling/schema'
import { liveBeliefs } from '@forkling/sim'
import { clampText } from './decision.ts'
import { describeBelief } from './prompts.ts'

/** A day longer than this is cut to its latest lines, so the bedtime prompt stays small and cheap. */
export const MAX_STREAM_LINES = 300

const json = (value: unknown) => JSON.stringify(value)

function clock(timeZone: string, iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

export interface ReflectionInput {
  name: string
  /** The local day being reflected on. */
  date: string
  localTime: string
  timeZone: string
  goals: Goals
  beliefs: readonly Belief[]
  /** `memory/summary.md`. */
  summary: string
  stream: readonly StreamEntry[]
  /** Why an earlier try was turned down, when this is the second. */
  turnedDown?: readonly string[]
}

/** The user part of the bedtime call (Sonnet): the day, what it believes, what it remembers, and what is asked. */
export function buildReflectionUser(i: ReflectionInput): string {
  const stream = i.stream.slice(-MAX_STREAM_LINES)
  const live = liveBeliefs(i.beliefs)
  return [
    '<situation>',
    `time: ${i.localTime} (${i.timeZone}); it is bedtime and ${i.date} is nearly over`,
    '</situation>',
    '',
    '<goals>',
    json({ long: i.goals.long ? { text: i.goals.long.text, reason: i.goals.long.reason } : null, today: i.goals.today?.reason ?? null }),
    '</goals>',
    '',
    '<memory>',
    i.summary.trim() || 'Nothing yet.',
    '</memory>',
    '',
    '<beliefs>',
    ...(live.length > 0 ? live.map(describeBelief) : ['You do not believe anything about the world yet.']),
    '</beliefs>',
    '',
    `<stream day="${i.date}">`,
    ...(stream.length > 0 ? stream.map((e) => `${e.id} ${clock(i.timeZone, e.at)} [${e.kind}] ${e.text}`) : ['Nothing was recorded today.']),
    '</stream>',
    ...(i.turnedDown && i.turnedDown.length > 0
      ? ['', '## Your last try was turned down', 'These claims had nothing behind them in the stream:', ...i.turnedDown.map((r) => `- ${r}`), 'Write it again and keep only what the stream shows.']
      : []),
    '',
    '## Your task',
    `It is bedtime. Write tonight's diary entry, then look at what you believe.`,
    `- journal: a short title and a few paragraphs in your own voice, about the day. Every paragraph must say only what the stream above shows, and its refs must list the stream ids it rests on (like ${i.date}#4). A paragraph with no refs, or refs that are not in the stream, will be thrown away. Feelings and thoughts are yours to write, but things that happened must be in the stream.`,
    '- beliefOps: what the day taught you about the world. Use "new" for something you now believe (with a statement, how sure you are from 0 to 1, and the stream ids that show it), "strengthen" or "weaken" for a belief in the list above, "revise" to change its wording, and "drop" if the day proved it wrong. Beliefs can be wrong, and it is good to change your mind. Use beliefId for anything but "new". Set statement, confidence and beliefId to null where they do not apply. It is fine to have no operations.',
    '- Keep each belief to one plain sentence about how the world works, not about the day.',
  ].join('\n')
}

/** The diary entry as the repo keeps it, or null if no paragraph survived the claims check. */
export function renderJournal(date: string, reflection: Reflection): string | null {
  const paragraphs = reflection.journal.paragraphs.map((p) => p.text.trim()).filter(Boolean)
  if (paragraphs.length === 0) return null
  const title = clampText(reflection.journal.title.trim() || date, 80)
  return [`# ${title}`, '', `*${date}*`, '', paragraphs.join('\n\n'), ''].join('\n')
}

export interface MemoryInput {
  date: string
  /** The `memory/summary.md` it has now. */
  summary: string
  /** Tonight's journal entry, or null if there wasn't one. */
  journal: string | null
  beliefs: readonly Belief[]
}

/** The user part of the nightly rewrite (Haiku, Batch API). */
export function buildMemoryUser(i: MemoryInput): string {
  const live = liveBeliefs(i.beliefs)
  return [
    '<memory>',
    i.summary.trim() || 'Nothing yet.',
    '</memory>',
    '',
    `<journal day="${i.date}">`,
    i.journal?.trim() || 'There was no journal entry tonight.',
    '</journal>',
    '',
    '<beliefs>',
    ...(live.length > 0 ? live.map(describeBelief) : ['None.']),
    '</beliefs>',
    '',
    '## Your task',
    `Rewrite your long-term memory while you sleep. It has ${MEMORY_SLOTS} slots, no more: each is a short title and a few sentences. New memories have to fight old ones for room, so let the faded ones go and keep what still matters to you: people, places, things you made, what you learned.`,
    '- Keep one slot for running jokes and recurring characters (titled "Running jokes"), even if it is thin.',
    `- Return at most ${MEMORY_SLOTS} slots. Write in your own voice, first person. Do not copy the journal; remember it.`,
  ].join('\n')
}

/** `memory/summary.md` from the slots, or null if nothing is left (the old memory then stays). */
export function renderSummary(memory: MemorySlots): string | null {
  const slots = memory.slots
    .map((s) => ({ title: clampText(s.title.trim(), 60), text: clampText(s.text.trim(), 500) }))
    .filter((s) => s.title && s.text)
    .slice(0, MEMORY_SLOTS)
  if (slots.length === 0) return null
  return `${slots.map((s) => `## ${s.title}\n${s.text}`).join('\n\n')}\n`
}
