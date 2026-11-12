import { runTinker, type TinkerInput } from '../builds/tinker.ts'
import { existingWorkIds, readWorks, recentSouvenirs, recentWorkTitles, topInterestLines, untriedLibraries } from '../builds/works.ts'
import { clampText } from '../decision.ts'
import type { Tick } from './context.ts'

/**
 * When a sketch step finishes, one Haiku call makes the sketch (Sonnet if the step is marked deep), the browser checks it, and
 * `works/<id>/` keeps it (spec 7.6, 2.4). A sketch that fails its check is kept in the scrap bin with the reason and has no
 * repair. With no browser (the Actions tick has none) the step rests, and a refusal or a cut-off page leaves nothing; neither
 * counts against the 3 a day. A sketch that was made, shelved or scrapped, does.
 */
export async function workStep(t: Tick): Promise<void> {
  const pending = t.pendingWork
  if (!pending) return
  const { step, index } = pending

  const rested = (why: string) => {
    t.notes.push(`tinker: ${why}`)
    const text = 'I could not check the sketch, so it rested instead.'
    t.remember.push({ at: t.nowIso, kind: 'event', text, verb: 'tinker' })
    t.justNow.push(text)
  }
  const checker = t.deps.workCheck
  if (!checker) return rested('there is no browser here to check a sketch')

  const works = readWorks(t.dir)
  const input: TinkerInput = {
    idea: step.targetId ?? '',
    reason: step.reason,
    size: 'sketch',
    interests: topInterestLines(t.interests),
    souvenirs: recentSouvenirs(t.dir),
    remix: null,
    untried: untriedLibraries(works),
    recentTitles: recentWorkTitles(works),
    manuals: [],
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
