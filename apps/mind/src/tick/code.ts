import { ArtOutput, type BuildRequest } from '@forkling/schema'
import { skillLevel } from '@forkling/sim'
import { buildArtUser } from '../art.ts'
import { canSpend } from '../budget.ts'
import { buildIdFor, checkBuildRequest, weekOf } from '../builds.ts'
import { clampText } from '../decision.ts'
import { MAX_ART_TOKENS } from './art.ts'
import type { Tick } from './context.ts'

/** What a coded project may cost the builder, held back before it is asked for. */
const CODE_ESTIMATE_USD = 0.3

/**
 * Coding: the brief for a small program is written here, and the builder makes the files. Nothing is kept in `art/` until
 * the project's pull request has merged, so the site never shows a project that is not there.
 */
export async function codeStep(t: Tick): Promise<void> {
  const { notes, nowIso, today, mind, w } = t
  const pending = t.pendingCode
  if (!pending || t.deps.dryRun) return
  const { step, index } = pending
  const verdict = checkBuildRequest({ state: mind, today, asleep: t.asleep, canAfford: canSpend(t.budget, CODE_ESTIMATE_USD), kind: 'code' })
  if (!verdict.ok) {
    notes.push(`coding: ${verdict.reason}`)
    return
  }
  const user = buildArtUser({
    kind: 'code',
    topic: step.topic ?? t.interests.current?.topic ?? null,
    reason: step.reason,
    skillLevel: skillLevel(t.skills, 'mind'),
    obsession: t.interests.current?.topic ?? null,
    recentTitles: [...w.art].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((a) => a.title),
    interests: t.interests,
    temperament: t.temperament,
    date: today,
  })
  const result = await t.ask('art', 'claude-haiku-5-5', user, ArtOutput.code, MAX_ART_TOKENS)
  if (result && !result.parsed) {
    notes.push(`no usable brief for a coded project (stopped: ${result.stopReason ?? 'unknown'})`)
  } else if (result?.parsed) {
    const title = clampText(result.parsed.title.trim() || 'A small program', 60)
    const request: BuildRequest = {
      id: buildIdFor(title, new Set([...t.objects.map((o) => o.id), ...w.art.map((a) => a.id)])),
      kind: 'code',
      name: title,
      purpose: clampText(result.parsed.idea.trim(), 300),
      howItPlays: clampText(result.parsed.howItPlays.trim(), 300),
      goalRef: `today:${index}`,
      contraption: false,
      requestedAt: nowIso,
    }
    t.buildRequests.push(request)
    mind.openCode = { id: request.id, kind: 'code', requestedAt: nowIso }
    mind.codeWeek = { week: weekOf(today), count: (mind.codeWeek?.week === weekOf(today) ? mind.codeWeek.count : 0) + 1 }
    t.remember.push({ at: nowIso, kind: 'made', text: `Started a coded project: "${request.name}": ${request.purpose}`, verb: 'code', goalRef: request.goalRef! })
    t.justNow.push(`started a coded project: "${request.name}"`)
    t.parts.push(`started a coded project`)
  }
}
