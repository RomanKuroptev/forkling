import { localDate } from '@forkling/sim'
import type { BuildKind, BuildResult } from '@forkling/schema'
import { recordCall } from '../budget.ts'
import { readBuildResult } from '../build-result.ts'
import { settleOpenBuild, settleOpenCode, weekOf } from '../builds.ts'
import type { Tick } from './context.ts'

/** The builder spent money; the mind books it, once however often it sees the report. */
function bookCost(t: Tick, result: BuildResult): void {
  for (const call of result.calls) {
    if (!t.budget.calls.some((c) => c.at === call.at && c.kind === call.kind)) t.budget = recordCall(t.budget, call)
  }
}

/** A build that did not come to anything does not count against the day or the week. */
function giveBackSlot(t: Tick, kind: BuildKind, requestedAt: string): void {
  const { mind } = t
  const date = localDate(t.tz, Date.parse(requestedAt))
  if (kind === 'code') {
    if (mind.codeWeek && mind.codeWeek.week === weekOf(date) && mind.codeWeek.count > 0) mind.codeWeek = { ...mind.codeWeek, count: mind.codeWeek.count - 1 }
  } else if (mind.builds && mind.builds.date === date && mind.builds.count > 0) {
    mind.builds = { ...mind.builds, count: mind.builds.count - 1 }
  }
}

/**
 * The builds it asked for earlier: an object and a coded project each have their own slot. A slot ends when what it asked
 * for is in the world (that is the answer; nobody asks GitHub), when the builder reports that it could not be made or
 * that its pull request was closed, or, for lack of any word, after a few days. A project whose pull request is waiting
 * for a person never expires. What the builder spent comes from its report and is booked here.
 */
export function settleBuild(t: Tick): void {
  const { mind, w, nowMs, nowIso, dir } = t
  // A project left in the object slot, from before the two had separate ones, moves to its own.
  if (mind.openBuild?.kind === 'code') {
    mind.openCode ??= mind.openBuild
    mind.openBuild = null
  }

  for (const slot of ['openBuild', 'openCode'] as const) {
    const open = mind[slot]
    if (!open) continue
    const code = slot === 'openCode'
    const report = readBuildResult(dir, open.id)
    if (report) bookCost(t, report)

    const present = new Set(code ? w.art.map((a) => a.id) : w.objects.map((o) => o.id))
    const settled = code ? settleOpenCode(mind, present, nowMs, report?.status === 'pr-open') : settleOpenBuild(mind, present, nowMs)
    const what = code ? 'project' : 'object'
    const name = (code ? w.art.find((a) => a.id === open.id)?.title : w.objects.find((o) => o.id === open.id)?.name) ?? open.id
    let text: string | null = null
    let made = false

    if (settled.outcome === 'arrived') {
      text = `The ${what} I asked for has arrived: ${name}.`
      made = true
      // What it asked for is finished and in the world: that is something to be glad of.
      t.appraisals.push({ kind: 'finished' })
    } else if (report && (report.status === 'failed' || report.status === 'closed')) {
      giveBackSlot(t, open.kind, open.requestedAt)
      text =
        report.status === 'failed'
          ? `The ${what} I asked for could not be built${report.reason ? `: ${report.reason}` : ''}.`
          : `The ${what} I asked for did not make it into the world${report.reason ? `: ${report.reason}` : ''}.`
    } else if (settled.outcome === 'expired') {
      text = `The ${what} I asked for (${open.id}) never came.`
    }
    if (text === null) continue

    mind[slot] = null
    t.remember.push({ at: nowIso, kind: made ? 'made' : 'event', text, objectId: open.id })
    t.justNow.push(text)
  }
}
