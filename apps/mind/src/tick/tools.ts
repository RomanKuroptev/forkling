import type { Tick } from './context.ts'
import { rememberScored } from './importance.ts'

/**
 * Spec v4 8: `mind/tools.json` is what Roman has given Merge. An entry Merge has not been told about is announced once, in the
 * stream, with importance 8 and the words Roman wrote in `what`. Code only, no call. The first look just records what is there
 * (the abilities it already has are not news), and nothing is written to the mind's state unless something is new.
 */
export function toolStep(t: Tick): void {
  const seen = t.mind.toolsSeen
  const tools = t.w.tools.tools
  const fresh = tools.filter((tool) => !seen?.includes(tool.id))
  if (fresh.length === 0) return
  if (seen) {
    for (const tool of fresh) {
      rememberScored(t, { at: t.nowIso, kind: 'event', text: `Roman gave me something new, ${tool.name}: ${tool.what}` }, 'toolGiven')
      t.parts.push(`was given ${tool.name}`)
    }
  }
  t.mind.toolsSeen = tools.map((tool) => tool.id).slice(0, 40)
}
