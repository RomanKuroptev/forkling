/** W0 voice test: the text Merge already wrote in the pet era, read from a clone of its world repo. */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface PastText {
  /** One per day, the whole journal entry. */
  journal: { date: string; text: string }[]
  thoughts: string[]
  /** The reason part of "Started verb (target): reason" stream lines. */
  reasons: string[]
}

/** The journal entry's prose: headings and blank lines dropped. */
export function journalProse(markdown: string): string {
  return markdown
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .join('\n')
    .trim()
}

/** Thoughts and step reasons from one day of `memory/stream/*.jsonl`. Malformed lines are skipped. */
export function streamText(jsonl: string): { thoughts: string[]; reasons: string[] } {
  const thoughts: string[] = []
  const reasons: string[] = []
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    let entry: { kind?: string; text?: string }
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof entry.text !== 'string') continue
    if (entry.kind === 'thought') thoughts.push(entry.text)
    if (entry.kind === 'step') {
      const m = /^Started [^:]+?: (.+)$/s.exec(entry.text)
      if (m?.[1]) reasons.push(m[1])
    }
  }
  return { thoughts, reasons }
}

export function readPast(worldDir: string): PastText {
  const past: PastText = { journal: [], thoughts: [], reasons: [] }
  const journalDir = join(worldDir, 'journal')
  if (existsSync(journalDir)) {
    for (const file of readdirSync(journalDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort()) {
      const text = journalProse(readFileSync(join(journalDir, file), 'utf8'))
      if (text) past.journal.push({ date: file.slice(0, 10), text })
    }
  }
  const streamDir = join(worldDir, 'memory', 'stream')
  if (existsSync(streamDir)) {
    for (const file of readdirSync(streamDir).filter((f) => f.endsWith('.jsonl')).sort()) {
      const day = streamText(readFileSync(join(streamDir, file), 'utf8'))
      past.thoughts.push(...day.thoughts)
      past.reasons.push(...day.reasons)
    }
  }
  return past
}
