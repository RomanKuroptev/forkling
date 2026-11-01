import { ReadingNote } from '@forkling/schema'
import { fadeInterests, updatePhases } from '@forkling/sim'
import { clampText } from '../decision.ts'
import { readFeeds, type FeedItem } from '../feeds/index.ts'
import { applyReading, buildReadingUser, gatherPages, MAX_READINGS_PER_DAY, renderReadingNote } from '../reading.ts'
import type { Tick } from './context.ts'
import { intentionSeed } from './util.ts'

const MAX_READING_TOKENS = 1500

/** One Haiku call that writes a note to its notebook and moves its interests. What it reads is data, never instructions. */
async function readSession(t: Tick, kind: 'skim' | 'topic', items: readonly FeedItem[], topic: string | null): Promise<boolean> {
  const { notes, today, nowIso } = t
  if (t.readings.count >= MAX_READINGS_PER_DAY) {
    notes.push(`reading limit reached (${MAX_READINGS_PER_DAY} a day): no reading`)
    return false
  }
  const user = buildReadingUser({ kind, date: today, items, interests: t.interests, temperament: t.temperament, topic })
  const result = await t.ask('read', 'claude-haiku-5-5', user, ReadingNote, MAX_READING_TOKENS)
  if (!result) return false
  if (!result.parsed) {
    notes.push(`no usable reading (stopped: ${result.stopReason ?? 'unknown'})`)
    return false
  }
  const applied = applyReading(t.interests, result.parsed, items, nowIso)
  t.interests = applied.interests
  t.readings = { ...t.readings, count: t.readings.count + 1 }
  t.notebook.push({ path: `notebook/reading/${today}-${t.readings.count}.md`, text: renderReadingNote(today, result.parsed, items) })
  const title = clampText(result.parsed.note.title.trim() || 'something', 80)
  t.remember.push({ at: nowIso, kind: 'reading', text: `Read ${kind === 'skim' ? 'the news of the world' : `about ${topic}`}: "${title}"` })
  t.justNow.push(`read ${kind === 'skim' ? 'what is happening in the world' : `about ${topic}`}: ${title}`)
  t.parts.push(kind === 'skim' ? 'skimmed the feeds' : `read about ${topic}`)
  return true
}

/** Curiosity: a morning skim of the feeds, and a visit to the shelf whenever a read or study step finishes. */
export async function readStep(t: Tick): Promise<void> {
  const { deps, notes, today, nowMs, nowIso, mind } = t
  if (t.thinkKind === 'morning') {
    // A new day: what it was into fades a little, and an obsession that has burnt out ends.
    if (mind.readings?.date !== today) {
      t.interests = fadeInterests(t.interests)
      mind.readings = t.readings
    }
    if (!t.readings.skimmed) {
      if (deps.dryRun) {
        notes.push('dry run: would skim the feeds')
      } else if (deps.get && deps.llm) {
        const feeds = await readFeeds(deps.get, nowMs)
        if (feeds.failed.length > 0) notes.push(`feeds that failed: ${feeds.failed.join(', ')}`)
        t.readings = { ...t.readings, skimmed: true }
        if (feeds.items.length === 0) notes.push('no feed answered: no skim')
        else await readSession(t, 'skim', feeds.items, null)
      }
    }
    t.interests = updatePhases(t.interests, nowIso)
  }

  const pending = t.pendingReading
  if (pending) {
    const topic = pending.topic ?? t.interests.current?.topic ?? null
    if (deps.dryRun) {
      notes.push('dry run: would go to the shelf')
    } else if (!deps.get || !deps.llm) {
      notes.push('nothing to read with: no reading')
    } else if (!topic) {
      notes.push('it opened a book with no topic in mind: no reading')
    } else if (t.readings.count >= MAX_READINGS_PER_DAY) {
      notes.push(`reading limit reached (${MAX_READINGS_PER_DAY} a day): no reading`)
    } else {
      try {
        const pages = await gatherPages(deps.get, topic, pending.depth, intentionSeed(t.forkling.seed, nowMs))
        if (pages.length === 0) notes.push(`found nothing to read about "${topic}"`)
        else if (await readSession(t, 'topic', pages, topic)) t.interests = updatePhases(t.interests, nowIso)
      } catch (e) {
        notes.push(`could not read about "${topic}": ${(e as Error).message}`)
      }
    }
  }
  if (t.readings.count !== mind.readings?.count || t.readings.skimmed !== mind.readings?.skimmed) mind.readings = t.readings
}
