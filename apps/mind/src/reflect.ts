import { MEMORY_SLOTS, type MemorySlots, type Reflection } from '@forkling/schema'
import { clampText } from './decision.ts'

/** What the sleep rewrite writes into the repo: the diary entry and `memory/summary.md` (the prompt is `prompts/sleep.ts`). */

/** The diary entry as the repo keeps it, or null if no paragraph survived the claims check. */
export function renderJournal(date: string, reflection: Reflection): string | null {
  const paragraphs = reflection.journal.paragraphs.map((p) => p.text.trim()).filter(Boolean)
  if (paragraphs.length === 0) return null
  const title = clampText(reflection.journal.title.trim() || date, 80)
  return [`# ${title}`, '', `*${date}*`, '', paragraphs.join('\n\n'), ''].join('\n')
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
