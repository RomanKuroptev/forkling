import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MindConfig } from '@forkling/schema'
import { goalClosedForWriting, type VarietyContext, type WrittenPage } from '@forkling/sim'
import type { Tick } from './context.ts'
import { readTimelineSince } from '../stream.ts'

/** A write step finishes at most this long after it starts (write takes 20 to 45 minutes, and a tick may be late). */
const STEP_TO_PAGE_MS = 90 * 60_000
const DAY_MS = 86_400_000

/**
 * `mind/config.json` (spec 12.3). A missing file leaves every switch off. A file that does not parse also leaves every switch off, with
 * the problem named so it can be shown: a typo in a hand-edited file must never stop the mind from ticking.
 */
export function readMindConfig(dir: string): { config: MindConfig; problem: string | null } {
  const off = MindConfig.parse({})
  const full = join(dir, 'mind/config.json')
  if (!existsSync(full)) return { config: off, problem: null }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(full, 'utf8'))
  } catch (e) {
    return { config: off, problem: `mind/config.json is not valid JSON, so every variety switch is off: ${(e as Error).message}` }
  }
  const parsed = MindConfig.safeParse(raw)
  if (!parsed.success) {
    const why = parsed.error.issues.map((i) => `${i.path.map(String).join('.') || 'file'}: ${i.message}`).join('; ')
    return { config: off, problem: `mind/config.json does not fit, so every variety switch is off: ${why}` }
  }
  return { config: parsed.data, problem: null }
}

/**
 * The notebook pages of the last `days` days, oldest first, with the time a page was written (from its file name, in UTC) and the
 * target of the write step that came before it, when the timeline still has it. The text is what Merge wrote, read as data.
 */
export function readWrittenPages(dir: string, today: string, days: number): WrittenPage[] {
  const folder = join(dir, 'notebook', 'writing')
  if (!existsSync(folder)) return []
  const since = Date.parse(`${today}T00:00:00Z`) - (days - 1) * DAY_MS
  const writes = readTimelineSince(dir, today, days + 1).filter((s) => s.verb === 'write' && s.targetId)
  const pages: WrittenPage[] = []
  for (const file of readdirSync(folder).filter((f) => f.endsWith('.md')).sort()) {
    const m = /^(\d{4}-\d\d-\d\d)-(\d\d)(\d\d)-/.exec(file)
    if (!m) continue
    const at = `${m[1]}T${m[2]}:${m[3]}:00.000Z`
    if (Date.parse(at) < since) continue
    const text = readFileSync(join(folder, file), 'utf8')
    const title = /^# (.+)$/m.exec(text)?.[1]?.trim() ?? file
    const before = writes.filter((s) => Date.parse(s.at) <= Date.parse(at) && Date.parse(at) - Date.parse(s.at) <= STEP_TO_PAGE_MS).at(-1)
    pages.push({ at, title, text, target: before?.targetId ?? null, reason: before?.reason ?? null })
  }
  return pages
}

/**
 * What plan validation needs for the switches that are on, or undefined when none is (so nothing is read). Pages are read
 * for twice the look-back, so that older pages can still link the clusters of the newer ones.
 */
export function varietyFor(
  config: MindConfig,
  pages: (days: number) => WrittenPage[],
  recent: readonly { verb: string; targetId?: string | undefined }[],
): VarietyContext | undefined {
  const { sameTopicWrites, sameWorkTinker } = config.variety
  if (!sameTopicWrites.on && !sameWorkTinker.on) return undefined
  return {
    ...(sameTopicWrites.on ? { sameTopicWrites: { limit: sameTopicWrites.limit, days: sameTopicWrites.days, pages: pages(sameTopicWrites.days * 2) } } : {}),
    ...(sameWorkTinker.on ? { sameWorkTinker: { limit: sameWorkTinker.limit, recent: recent.filter((r) => r.verb === 'tinker' && r.targetId).map((r) => r.targetId!) } } : {}),
  }
}

/**
 * A plan was turned down because a topic is closed for writing. When Merge's long goal is on that topic, an early goal review is asked
 * for, once a day at most (audit 17 Nov), so the goal can be dropped or reshaped instead of fought over.
 */
export function flagGoalClosed(t: Pick<Tick, 'goals' | 'config' | 'dir' | 'today' | 'nowMs' | 'mind'>): void {
  const long = t.goals.long
  const rule = t.config.variety.sameTopicWrites
  if (!long || !rule.on || t.mind.goalReviewEarlyOn === t.today) return
  const closed = goalClosedForWriting(long, { limit: rule.limit, days: rule.days, pages: readWrittenPages(t.dir, t.today, rule.days * 2) }, t.nowMs)
  if (closed.length > 0) t.mind.goalReviewEarly = { date: t.today, closed: closed.length }
}
