import type { Tick } from './context.ts'
import { rememberScored } from './importance.ts'

/** An entry is news only when its `since` is this recent. */
const NEWS_DAYS = 7

/**
 * Spec v4 8: `mind/tools.json` is what Roman has given Merge. An entry Merge has not been told about is announced once, in the
 * stream, with importance 8 and the words Roman wrote in `what`, but only when its `since` is within the last 7 days: an older
 * entry (the abilities Merge already has, in a file that is added later) is recorded without a word, so adding the whole file
 * is not news and a new gift dated today is. A world with no file has no tools and nothing here writes anything. Code only, no call.
 */
export function toolStep(t: Tick): void {
  const seen = t.mind.toolsSeen
  const tools = t.w.tools.tools
  const fresh = tools.filter((tool) => !seen?.includes(tool.id))
  if (fresh.length === 0) return
  const recent = new Date(Date.parse(t.nowIso) - NEWS_DAYS * 86_400_000).toISOString().slice(0, 10)
  for (const tool of fresh.filter((x) => x.since >= recent)) {
    rememberScored(t, { at: t.nowIso, kind: 'event', text: `Roman gave me something new, ${tool.name}: ${tool.what}` }, 'toolGiven')
    t.parts.push(`was given ${tool.name}`)
  }
  t.mind.toolsSeen = tools.map((tool) => tool.id).slice(0, 40)
}
