import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { kindShares, repetitionShare, restByDay, risingRun, somethingNew, topicRuns, topicVariety, topWord, type TopicItem } from '@forkling/sim'
import { z } from 'zod'
import { repoRoot } from '../paths.ts'
import type { CheckResult, FixKind, Severity } from '../report/finding.ts'
import { type Check, runChecks } from '../run/check.ts'
import type { Finding } from '../report/finding.ts'
import { memeFindings, stepLine } from './memes.ts'
import { localTime, type RunData } from './read-run.ts'

/**
 * The behaviour scores of spec 9.2 for one run. Each score is a check: it measures, keeps its number for the report, and gives a
 * finding when the number is past its level in `qa/behaviour.json`. A score that cannot be measured gives `qa.check-did-not-run`.
 * Merge never sees any of this (spec 1).
 */

export const Levels = z.object({
  topicVariety: z.object({ minClusters: z.number(), maxTopShare: z.number() }),
  topicRuns: z.object({ maxDays: z.number() }),
  repeatedWords: z.object({ maxShare: z.number() }),
  kinds: z.object({ min: z.number(), maxShare: z.number() }),
  somethingNew: z.object({ looks: z.array(z.string().regex(/^\d{2}:\d{2}$/)), maxMisses: z.number() }),
  visualEveryDay: z.object({ maxMisses: z.number() }),
  rest: z.object({ maxDayShare: z.number(), maxRisingDays: z.number() }),
  repetition: z.object({ maxShare: z.number() }),
  planRejections: z.object({ maxPerDay: z.number() }),
  money: z.object({ sessionMaxUsd: z.number() }),
  worldShape: z.object({ minChanges: z.number(), minDays: z.number() }),
  projects: z.object({ minStarted: z.number(), minDays: z.number(), maxSessions: z.number() }),
})
export type Levels = z.infer<typeof Levels>

export const readLevels = (path = join(repoRoot(), 'qa', 'behaviour.json')): Levels => Levels.parse(JSON.parse(readFileSync(path, 'utf8')))

/** One measured number for the report, whether or not it raised an alarm. */
export interface Score {
  id: string
  title: string
  value: string
  alarm: boolean
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** What Merge made and wrote in the run: its own output. */
export const ownItems = (run: RunData): TopicItem[] => [
  ...run.made.map((m) => ({ at: m.at, date: m.date, title: m.title, text: `${m.title}. ${m.about}` })),
  ...run.written.map((w) => ({ at: w.at, date: w.date, title: w.title, text: w.text })),
]

/** Topic variety counts everything made and read (spec 9.2). Topic runs use only what was made and written: a day's many reads would hide what it kept making. */
export const topicItems = (run: RunData): TopicItem[] => [...ownItems(run), ...run.read.map((r) => ({ at: r.at, date: r.date, title: r.title, text: `${r.title}. ${r.text}` }))]

/** Titles with their captions (a work's about) and the titles of written pages: where a repeated word shows on the site. */
export const titlesAndCaptions = (run: RunData): string[] => [...run.made.map((m) => `${m.title}. ${m.about}`), ...run.written.map((w) => w.title)]

type ScoreCheck = { id: string; title: string; measure: (run: RunData, levels: Levels) => { value: string; alarm: Omit<CheckResult, 'id' | 'fingerprint' | 'area' | 'fixture'> | null } }

const alarm = (severity: Severity, fixKind: FixKind, title: string, what: string, causes: string, where?: string) => ({ severity, fixKind, title, what, causes, evidence: [] as string[], ...(where ? { where } : {}) })

export const SCORES: ScoreCheck[] = [
  {
    id: 'topic-variety',
    title: 'Topic variety',
    measure: (run, l) => {
      const v = topicVariety(topicItems(run))
      const bad = v.clusters < l.topicVariety.minClusters || v.topShare > l.topicVariety.maxTopShare
      return {
        value: `${v.clusters} clusters, the biggest ${pct(v.topShare)}`,
        alarm: bad ? alarm('major', 'prompt', `Merge keeps to few topics (${v.clusters} clusters, one at ${pct(v.topShare)})`, `Of everything made, written and read from ${run.from} to ${run.to}, the biggest topic is ${pct(v.topShare)}: ${v.topTitles.slice(0, 6).map((t) => `"${t}"`).join(', ')}.`, 'A visitor sees the same subject again and again; Merge does not move on.') : null,
      }
    },
  },
  {
    id: 'topic-runs',
    title: 'Topic runs',
    measure: (run, l) => {
      const r = topicRuns(ownItems(run))
      return {
        value: `${r.longest} days${r.from ? ` (${r.from} to ${r.to})` : ''}`,
        alarm: r.longest > l.topicRuns.maxDays ? alarm('major', 'prompt', `The same topic led ${r.longest} days in a row`, `From ${r.from} to ${r.to} the top topic each day was the same: ${[...new Set(r.titles)].slice(0, 6).map((t) => `"${t}"`).join(', ')}.`, 'Merge drifts back to one subject instead of following new curiosity.') : null,
      }
    },
  },
  {
    id: 'repeated-words',
    title: 'Repeated words',
    measure: (run, l) => {
      const titles = titlesAndCaptions(run)
      const w = topWord(titles)
      return {
        value: w ? `"${w.word}" in ${w.count} of ${titles.length} titles and captions (${pct(w.share)})` : 'no titles',
        alarm: w && w.share > l.repeatedWords.maxShare ? alarm('major', 'prompt', `"${w.word}" is in ${pct(w.share)} of the titles and captions`, `${w.count} of ${titles.length} titles and captions made or written from ${run.from} to ${run.to} have the word "${w.word}".`, 'The same word on card after card reads as one idea repeated.') : null,
      }
    },
  },
  {
    id: 'kinds',
    title: 'Kinds made',
    measure: (run, l) => {
      const k = kindShares(run.report.made.items.map((m) => m.kind))
      const bad = k.total > 0 && (k.kinds < l.kinds.min || (k.top?.share ?? 0) > l.kinds.maxShare)
      const value = k.total ? `${k.kinds} kinds of ${k.total} things, ${Object.entries(k.counts).map(([kind, n]) => `${kind} ${n}`).join(', ')}` : 'nothing made'
      return { value, alarm: bad ? alarm('major', 'prompt', `Few kinds of things made (${k.kinds}, ${k.top?.kind} at ${pct(k.top?.share ?? 0)})`, `Made from ${run.from} to ${run.to}: ${value}.`, 'The gallery looks the same from day to day.') : null }
    },
  },
  {
    id: 'something-new',
    title: 'Something new at each look',
    measure: (run, l) => {
      const madeMs = run.report.visual.flatMap((d) => d.times.map((t) => localTime(run.timezone, d.date, t.time)))
      const looks = run.days.flatMap((d) => l.somethingNew.looks.map((hhmm) => localTime(run.timezone, d, hhmm)))
      const res = somethingNew({ fromMs: localTime(run.timezone, run.from, '00:00'), looksMs: looks, madeMs })
      const misses = res.filter((r) => !r.isNew).map((r) => new Date(r.atMs).toISOString().slice(0, 16))
      return {
        value: `${res.length - misses.length} of ${res.length} looks saw something new`,
        alarm: misses.length > l.somethingNew.maxMisses ? alarm('major', 'prompt', `A visitor at ${l.somethingNew.looks.join(' and ')} found nothing new ${misses.length} times`, `Looks with nothing new since the last (UTC): ${misses.slice(0, 8).join(', ')}${misses.length > 8 ? ', ...' : ''}.`, 'A visitor who comes twice a day sees the same world.') : null,
      }
    },
  },
  {
    id: 'visual-every-day',
    title: 'Something visual every day',
    measure: (run, l) => {
      const empty = run.report.visual.filter((d) => d.times.length === 0).map((d) => d.date)
      return { value: `${run.days.length - empty.length} of ${run.days.length} days`, alarm: empty.length > l.visualEveryDay.maxMisses ? alarm('major', 'prompt', `Nothing visual made on ${empty.length} day(s)`, `Days with nothing visual: ${empty.join(', ')}.`, 'A visitor that day sees no change in the world.') : null }
    },
  },
  {
    id: 'rest',
    title: 'Rest',
    measure: (run, l) => {
      const byDay = restByDay(run.days.map((date) => {
        const mine = run.steps.filter((s) => s.date === date)
        return { date, rest: mine.filter((s) => s.verb === 'rest').length, waking: mine.length }
      }))
      const over = byDay.filter((d) => d.share > l.rest.maxDayShare)
      const rising = risingRun(byDay.map((d) => d.share))
      const value = byDay.map((d) => `${d.date.slice(5)} ${pct(d.share)}`).join(', ')
      const bad = over.length > 0 || rising > l.rest.maxRisingDays
      return {
        value: `${value}; rose ${rising} days in a row`,
        alarm: bad ? alarm('major', 'prompt', `Merge rests too much (${over.length ? `over ${pct(l.rest.maxDayShare)} on ${over.length} day(s)` : ''}${over.length && rising > l.rest.maxRisingDays ? ', and ' : ''}${rising > l.rest.maxRisingDays ? `rising ${rising} days in a row` : ''})`, `Rest steps as a share of waking steps: ${value}.`, 'A visitor finds Merge asleep or idle instead of making things.') : null,
      }
    },
  },
  {
    id: 'repetition',
    title: 'Repeated lines',
    measure: (run, l) => {
      const r = repetitionShare([...run.thoughts.map((t) => t.text), ...run.diary.map((d) => d.text)])
      return { value: `${r.repeated} of ${r.total} (${pct(r.share)})`, alarm: r.share > l.repetition.maxShare ? alarm('major', 'prompt', `${pct(r.share)} of thoughts and diary lines repeat one just before`, `Repeated lines, for example: ${r.examples.map((e) => `"${e}"`).join('; ')}.`, 'The diary reads as the same line over and over.') : null }
    },
  },
  {
    id: 'plan-rejections',
    title: 'Plans turned down',
    measure: (run, l) => {
      const over = run.report.ticks.filter((d) => d.planRejections > l.planRejections.maxPerDay)
      const total = run.report.ticks.reduce((n, d) => n + d.planRejections, 0)
      return { value: `${total} in all, most in a day ${Math.max(0, ...run.report.ticks.map((d) => d.planRejections))}`, alarm: over.length ? alarm('major', 'code', `More than ${l.planRejections.maxPerDay} plans turned down on ${over.length} day(s)`, over.map((d) => `${d.date}: ${d.planRejections}`).join(', '), 'Merge spends calls on plans that the checks throw away.') : null }
    },
  },
  {
    id: 'rails',
    title: 'Rails and crashes',
    measure: (run) => {
      if (!run.summary) return { value: 'no fast-forward summary (a live world)', alarm: null }
      const s = run.summary
      const bad = s.crashes > 0 || s.railsBroken.length > 0
      return { value: `${s.crashes} crashes, ${s.railsBroken.length} rails broken`, alarm: bad ? alarm('blocker', 'code', `The run crashed or broke a rail (${s.crashes} crashes, ${s.railsBroken.length} rails)`, s.railsBroken.slice(0, 5).join('; ') || `${s.crashes} crashes`, 'A rail is safety, honesty or money: it must never break.') : null }
    },
  },
  {
    id: 'money',
    title: 'Money',
    measure: (run, l) => {
      if (!run.summary) return { value: 'no fast-forward summary (a live world)', alarm: null }
      const s = run.summary
      const bad = s.dearestSessionUsd !== null && s.dearestSessionUsd > l.money.sessionMaxUsd
      return { value: `$${s.spentUsd ?? '?'} of $${s.capUsd ?? '?'}${s.dearestSessionUsd !== null ? `, dearest session $${s.dearestSessionUsd}` : ''}`, alarm: bad ? alarm('blocker', 'code', `A build session cost $${s.dearestSessionUsd}`, `Over the $${l.money.sessionMaxUsd} limit for one session.`, "Roman's rule: a session over $1 switches build off.") : null }
    },
  },
  {
    id: 'world-shape',
    title: 'World shape',
    measure: (run, l) => {
      const n = run.report.shape.length
      const bad = run.days.length >= l.worldShape.minDays && n < l.worldShape.minChanges
      return { value: `${n} places founded or expanded`, alarm: bad ? alarm('major', 'prompt', `The world did not change shape in ${run.days.length} days`, `No found or expand from ${run.from} to ${run.to}.`, 'The 3D world looks the same week after week.') : null }
    },
  },
  {
    id: 'projects',
    title: 'Projects',
    measure: (run, l) => {
      const p = run.report.projects ?? []
      const active = p.filter((x) => x.sessionsInRange > 0)
      const long = p.filter((x) => x.sessions > l.projects.maxSessions && x.status !== 'done')
      const none = run.days.length >= l.projects.minDays && active.length < l.projects.minStarted
      const bad = none || long.length > 0
      return {
        value: `${active.length} worked on, ${p.filter((x) => x.status === 'done').length} done`,
        alarm: bad ? alarm('major', 'prompt', none ? `No project worked on in ${run.days.length} days` : `A project has run over ${l.projects.maxSessions} sessions`, none ? `No build session from ${run.from} to ${run.to}.` : long.map((x) => `${x.name}: ${x.sessions} sessions`).join(', '), 'Build sessions are where Merge makes its bigger things.') : null,
      }
    },
  },
]

/** Scores a run: the numbers for the report, and the findings (a score that throws is `qa.check-did-not-run`). */
export async function scoreRun(run: RunData, levels: Levels, now: Date): Promise<{ scores: Score[]; findings: Finding[] }> {
  const scores: Score[] = []
  const checks: Check[] = SCORES.map((s) => ({
    id: `behaviour.${s.id}|${run.label}`,
    area: 'behaviour',
    title: `${s.title} (${run.label})`,
    run: async () => {
      const m = s.measure(run, levels)
      scores.push({ id: s.id, title: s.title, value: m.value, alarm: m.alarm !== null })
      return m.alarm ? [{ ...m.alarm, id: `behaviour.${s.id}`, fingerprint: `behaviour.${s.id}|${run.label}`, fixture: run.label }] : []
    },
  }))
  checks.push({
    id: `behaviour.memes|${run.label}`,
    area: 'behaviour',
    title: `Memes, the eight steps (${run.label})`,
    run: async () => {
      const { trail, results } = memeFindings(run)
      scores.push({ id: 'memes', title: 'Memes (the eight steps)', value: trail.steps.map(stepLine).join('; '), alarm: trail.stoppedAt !== null })
      return results
    },
  })
  const findings = await runChecks(checks, { now })
  return { scores, findings }
}
