import { BOREDOM_FROM, boredomCount, diaryNudges, placeNovelty, workNovelty, writingNudges } from '@forkling/sim'
import { readWorks } from '../builds/works.ts'
import { readDiaries, readWritings } from '../novelty-inputs.ts'
import { placeNudgeInputs } from '../ticklog.ts'
import { rememberScored } from './importance.ts'
import type { Tick } from './context.ts'

const DAY_MS = 86_400_000

/**
 * The boredom event (spec 12.4 item 8): when the nudges of 12.3 would have fired 3 or more times in the last day, code writes "I keep
 * repeating myself" into the stream with importance 6, at most once a day. It only feeds the next reflection (9.3): nothing is rejected
 * and nothing is ordered. The weekly nudges (one host, weekend revisit, no stranger's door) are not a day's, so they do not count.
 */
export function boredomStep(t: Tick): void {
  if (t.deps.dryRun || t.mind.boredom?.date === t.today) return
  const sinceMs = t.nowMs - DAY_MS
  const nudges = placeNudgeInputs(t)
  const places = placeNovelty({ places: nudges.places, requests: nudges.requests, steps: nudges.steps, nowMs: t.nowMs, sinceMs, dayOf: nudges.dayOf })
  const count = boredomCount({
    repeatedWork: workNovelty(readWorks(t.dir), { sinceMs }).wouldFire,
    repeatedPlace: places.repeatedPlace,
    stuck: places.stuckInOnePlace,
    repeatedWriting: new Set(writingNudges(readWritings(t.dir), { sinceMs }).map((n) => n.id)).size,
    repeatedDiary: new Set(diaryNudges(readDiaries(t.dir), { sinceMs }).map((n) => n.id)).size,
  })
  if (count < BOREDOM_FROM) return
  t.mind.boredom = { date: t.today }
  rememberScored(t, { at: t.nowIso, kind: 'event', text: `I keep repeating myself: my own checks found ${count} repeats in the last day.` }, 'boredom')
}
