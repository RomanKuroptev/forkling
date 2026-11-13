import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { TinkerJob, WorkMeta, type PlanStep } from '@forkling/schema'
import { pendingJobs } from '../build-worker.ts'
import { buildReworkUser, MAX_RETIRES_PER_WEEK, REWORK_MAX_TOKENS, ReworkAnswer, retirementsInWeek } from '../builds/rework.ts'
import { drawForBuild } from '../builds/draw.ts'
import { memeSeeds } from '../builds/memes.ts'
import { runTinker, type TinkerInput } from '../builds/tinker.ts'
import { existingWorkIds, readWorks, readWorkSource, recentSouvenirs, recentWorkTitles, topInterestLines, untriedLibraries } from '../builds/works.ts'
import { clampText } from '../decision.ts'
import { createFetcher } from '../web/fetch.ts'
import { manualPagesFor } from '../web/sources/manuals.ts'
import type { Tick } from './context.ts'

/**
 * A full work is not made in the tick: the step asks the build worker for it with a job file (spec 2.4, 10.2), and the result
 * comes back later (`settleJobs`). One at a time: while a work is being built a second step rests.
 */
function askForWork(t: Tick, step: PlanStep, index: number, o: { idea: string; remixOf: string | null }): void {
  const idea = clampText(o.idea.trim(), 120)
  if (!idea) {
    t.notes.push('tinker: a work needs an idea, so the step rested')
    return
  }
  if (pendingJobs(t.dir).some((j) => j.kind === 'tinker') || t.newJobs.length > 0) {
    t.notes.push('tinker: a work is already being built, so this step rested instead')
    const text = 'A work was already being built, so I rested instead of asking for another.'
    t.remember.push({ at: t.nowIso, kind: 'event', text, verb: 'tinker' })
    t.justNow.push(text)
    return
  }
  const base = `tinker-${t.today.replaceAll('-', '')}-${t.nowIso.slice(11, 16).replace(':', '')}`
  let id = base
  for (let n = 2; existsSync(join(t.dir, 'mind/builds', `${id}.json`)) || existsSync(join(t.dir, 'mind/builds', `${id}.result.json`)); n++) id = `${base}-${n}`
  t.newJobs.push(TinkerJob.parse({ id, kind: 'tinker', requestedAt: t.nowIso, idea, reason: clampText(step.reason, 200), remixOf: o.remixOf }))
  t.remember.push({ at: t.nowIso, kind: 'made', text: `Asked the workshop to build "${idea}".`, verb: 'tinker', goalRef: `today:${index}` })
  t.parts.push('asked for a work')
}

/** An earlier work a sketch remixes. */
type Remix = { id: string; title: string; about: string; html: string }

/**
 * What a tinker step does when it lands. A step on an earlier work first asks a cheap question: remix it, put it away, or bring
 * it back (spec 7.5, 9.9). Otherwise a sketch is made right away and a full work is asked of the build worker.
 */
export async function workStep(t: Tick): Promise<void> {
  const pending = t.pendingWork
  if (!pending) return
  const { step, index } = pending
  const target = (step.targetId ?? '').trim()
  const works = readWorks(t.dir)
  const earlier = works.find((w) => w.id === target)
  if (earlier) return reworkStep(t, step, index, earlier)
  if (step.size !== 'sketch') return askForWork(t, step, index, { idea: target, remixOf: null })
  return makeSketch(t, step, index, { idea: target, remix: null }, works)
}

/** A tinker step on one of its own works. Putting away and bringing back only change the work's status; nothing is made. */
async function reworkStep(t: Tick, step: PlanStep, index: number, work: WorkMeta): Promise<void> {
  const label = `"${work.title}"`
  if (work.status === 'scrap') {
    t.notes.push(`tinker: ${label} is in the scrap bin, so it cannot be remixed, put away or brought back`)
    return
  }
  const user = buildReworkUser({ title: work.title, kind: work.kind, about: work.about, status: work.status, retireReason: work.retireReason, reason: step.reason })
  const result = await t.ask('rework', 'claude-haiku-5-5', user, ReworkAnswer, REWORK_MAX_TOKENS)
  if (!result) return
  const answer = result.parsed
  if (!answer) {
    t.notes.push(`tinker: no usable answer about ${label} (stopped: ${result.stopReason ?? 'unknown'})`)
    return
  }
  const reason = clampText(answer.reason.trim(), 140)

  if (answer.action === 'retire') {
    const recent = retirementsInWeek(t.mind.retirements, t.nowMs)
    if (work.status !== 'shelf') t.notes.push(`tinker: ${label} is already put away, so there is nothing to retire`)
    else if (!reason) t.notes.push(`tinker: putting a work away needs a reason, so ${label} stays on the shelf`)
    else if (recent.length >= MAX_RETIRES_PER_WEEK) t.notes.push(`tinker: two works were already put away this week (at most ${MAX_RETIRES_PER_WEEK} a week), so ${label} stays on the shelf`)
    else {
      t.workUpdates.push(WorkMeta.parse({ ...work, status: 'retired', retireReason: reason }))
      t.mind.retirements = [...recent, t.nowIso]
      t.remember.push({ at: t.nowIso, kind: 'made', text: `Put away ${label}: ${reason}`, verb: 'tinker', goalRef: `today:${index}` })
      t.parts.push(`retired ${label}`)
    }
    return
  }
  if (answer.action === 'restore') {
    if (work.status !== 'retired') {
      t.notes.push(`tinker: ${label} is not put away, so there is nothing to bring back`)
      return
    }
    const { retireReason: _gone, ...rest } = work
    t.workUpdates.push(WorkMeta.parse({ ...rest, status: 'shelf' }))
    t.remember.push({ at: t.nowIso, kind: 'made', text: `Brought back ${label}.`, verb: 'tinker', goalRef: `today:${index}` })
    t.parts.push(`brought back ${label}`)
    return
  }

  // Remix: the old work stays as it is, and a new one is made from it.
  const idea = `a new take on "${work.title}"`
  if (step.size !== 'sketch') return askForWork(t, step, index, { idea, remixOf: work.id })
  return makeSketch(t, step, index, { idea, remix: readWorkSource(t.dir, work.id) }, readWorks(t.dir))
}

/**
 * When a sketch step finishes, one Haiku call makes the sketch (Sonnet if the step is marked deep), the browser checks it, and
 * `works/<id>/` keeps it (spec 7.6, 2.4). A sketch that fails its check is kept in the scrap bin with the reason and has no
 * repair. With no browser (the Actions tick has none) the step rests, and a refusal or a cut-off page leaves nothing; neither
 * counts against the 3 a day. A sketch that was made, shelved or scrapped, does.
 */
async function makeSketch(t: Tick, step: PlanStep, index: number, o: { idea: string; remix: Remix | null }, works: readonly WorkMeta[]): Promise<void> {
  const rested = (why: string) => {
    t.notes.push(`tinker: ${why}`)
    const text = 'I could not check the sketch, so it rested instead.'
    t.remember.push({ at: t.nowIso, kind: 'event', text, verb: 'tinker' })
    t.justNow.push(text)
  }
  const checker = t.deps.workCheck
  if (!checker) return rested('there is no browser here to check a sketch')

  const untried = untriedLibraries(works)
  // The manuals are for tinker only, read by code, and a page that cannot be read is just left out. (A pause from a 429 on one is not kept.)
  const manuals = t.deps.web && untried.length > 0 ? await manualPagesFor(createFetcher({ ...t.deps.web, verb: 'tinker' }), untried) : []
  const draw = drawForBuild(t.dir, { seed: t.forkling.seed, key: `sketch:${t.today}:${index}`, interests: t.interests })
  const drawn = { constraint: draw.constraint, collision: draw.collision ?? undefined }
  const input: TinkerInput = {
    idea: o.idea,
    reason: step.reason,
    size: 'sketch',
    interests: topInterestLines(t.interests),
    souvenirs: recentSouvenirs(t.dir),
    remix: o.remix,
    untried,
    recentTitles: recentWorkTitles(works),
    manuals,
    memeSeeds: memeSeeds(t.dir),
    ...drawn,
  }
  const taken = new Set([...existingWorkIds(t.dir), ...t.newWorks.map((w) => w.meta.id)])
  const outcome = await runTinker({ complete: (kind, model, user, schema, maxTokens) => t.ask(kind, model, user, schema, maxTokens), checker, nowIso: t.nowIso, existingIds: taken, deep: !!step.deep }, input)

  const count = () => {
    t.mind.sketches = { date: t.today, count: (t.mind.sketches?.date === t.today ? t.mind.sketches.count : 0) + 1 }
  }
  switch (outcome.status) {
    case 'shelf':
      t.newWorks.push({ meta: outcome.meta, html: outcome.html, thumb: outcome.thumb })
      count()
      t.remember.push({ at: t.nowIso, kind: 'made', text: `sketch: ${outcome.meta.title}`, verb: 'tinker', goalRef: `today:${index}` })
      t.parts.push(`sketched "${outcome.meta.title}"`)
      return
    case 'scrap':
      t.newWorks.push({ meta: outcome.meta, html: outcome.html, thumb: null })
      count()
      t.remember.push({ at: t.nowIso, kind: 'event', text: `A sketch, "${outcome.meta.title}", did not pass its check (${clampText(outcome.meta.scrapReason ?? '', 140)}), so it is in the scrap bin.`, verb: 'tinker' })
      t.parts.push(`scrapped sketch "${outcome.meta.title}"`)
      return
    case 'unavailable':
      return rested('no browser is available to check the sketch')
    case 'failed':
      t.notes.push(`tinker: the sketch was not made: ${outcome.reason}`)
  }
}
