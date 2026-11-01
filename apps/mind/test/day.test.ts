import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Goals, MindState, BudgetLedger } from '@forkling/schema'
import { isAsleepAt, quirkWeights, startPlayback, worldWithObjects } from '@forkling/sim'
import type { Decision } from '../src/decision.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { readWorld } from '../src/world.ts'
import { noBatch } from './noBatch.ts'

/**
 * A whole day in a fresh world from the template, with no visitors: a tick every 10 minutes (hourly, on the :03, while
 * asleep, like the workflow's gate), the real cat pack with its real decay rates, and a model that writes ordinary
 * plans. It pins what the review found missing: that Merge plans and acts all day without being woken over and over.
 */
const worldTemplate = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')

const START = Date.parse('2026-11-03T00:03:00Z') // a Tuesday; the template's time zone is UTC
const TICK_MS = 10 * 60_000

/** More than this many minutes under 15 in a row, awake, is the permanent alarm the review found. */
const MAX_CRITICAL_MINUTES = 60
/** Of the awake ticks, this share must have a plan step in progress. */
const MIN_STEP_SHARE = 0.8
/**
 * Decide and morning calls in a day. One morning plan, about six replans (15.5 waking hours in plans of 2 to 3 hours),
 * and room for about five more: something new, a step whose target is gone, a need the body cannot fix. The loop the
 * review found made about 30 a day by itself.
 */
const MAX_DECIDE_CALLS = 12

/** Ordinary steps that need nothing but the day: where and what, in an order that never repeats a verb three times. */
const STEPS: { verb: string; target: string | null; x: number | null; z: number | null }[] = [
  { verb: 'explore', target: null, x: -5, z: 12 },
  { verb: 'inspect', target: 'bookshelf', x: null, z: null },
  { verb: 'sit', target: null, x: null, z: null },
  { verb: 'explore', target: null, x: 0, z: 16 },
  { verb: 'sniff', target: 'berry-bush', x: null, z: null },
  { verb: 'stretch', target: null, x: null, z: null },
  { verb: 'explore', target: null, x: -8, z: 18 },
  { verb: 'inspect', target: 'telescope', x: null, z: null },
]
const STEP_MINUTES = 25

const minutesOf = (hh: string, mm: string) => Number(hh) * 60 + Number(mm)

function fakeModel() {
  const calls: { req: LlmRequest; at: number }[] = []
  let next = 0
  let clockNow = START
  const decide = (req: LlmRequest): Decision => {
    const now = /time: \w+ \d{4}-\d{2}-\d{2} (\d\d):(\d\d)/.exec(req.user)
    const bed = /bedtime (\d\d):(\d\d)/.exec(req.user)
    const left = now && bed ? minutesOf(bed[1]!, bed[2]!) - minutesOf(now[1]!, now[2]!) : 120
    // Two to three hours, and never past bedtime.
    const count = Math.max(0, Math.min(6, Math.floor((left - 20) / STEP_MINUTES)))
    const plan = Array.from({ length: count }, () => {
      const s = STEPS[next++ % STEPS.length]!
      return { ...s, reason: `I felt like ${s.verb} for a while.`, minutes: STEP_MINUTES, materials: null, makes: null, because: null, topic: null }
    })
    return {
      thought: 'The beach is mine, so I start with the part I know.',
      longGoal: req.kind === 'morning' ? { text: 'Learn every corner of the island.', reason: 'It is where I live.' } : null,
      dropLongGoal: false,
      plan: plan.length > 0 ? plan : null,
      planReason: plan.length > 0 ? 'A stretch of the day for looking around.' : null,
      stayUpLate: null,
    }
  }
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push({ req, at: clockNow })
      let parsed: unknown = null
      if (req.kind === 'morning' || req.kind === 'decide' || req.kind === 'weekly') parsed = decide(req)
      else if (req.kind === 'bedtime') {
        const ref = /\d{4}-\d{2}-\d{2}#\d+/.exec(req.user)?.[0]
        parsed = { journal: { title: 'A day', paragraphs: ref ? [{ text: 'I spent the day on the beach.', refs: [ref] }] : [] }, beliefOps: [] }
      }
      return { parsed: parsed as T | null, stopReason: parsed ? 'end_turn' : 'refusal', usage: { input: 800, cacheRead: 0, cacheWrite: 3000, output: 400 } }
    },
  }
  return { llm, calls, setNow: (ms: number) => (clockNow = ms) }
}

interface Day {
  decideCalls: number
  callsWhileAsleep: number
  spentUsd: number
  awakeTicks: number
  awakeTicksWithStep: number
  /** Longest run of minutes awake with a need under 15, and which need. */
  longestCritical: { need: string; minutes: number }
  /** Needs seen under 15 while awake, in ticks, for the report. */
  criticalTicks: Record<string, number>
  ticks: number
  /** Plan steps that began, and how many of them ended unfinished because the body did not do enough of them. */
  stepsStarted: number
  stepsUnfinished: number
}

let dir: string
let day: Day

/** What the body would be doing and needing at `nowMs`, as a viewer replaying the repo would see it. */
function needsAt(nowMs: number) {
  const w = readWorld(dir, () => '2026-11')
  const weights = w.temperament ? quirkWeights(w.temperament, cat.pools) : {}
  const pb = startPlayback({ forkling: w.forkling, pack: cat.pack, behaviors: cat.behaviors, world: worldWithObjects(w.objects), goals: w.goals, stateTime: Date.parse(w.forkling.lastTickAt) / 1000, quirkWeights: weights }, nowMs)
  return pb.state.needs as Record<string, number>
}

async function liveADay(): Promise<Day> {
  const model = fakeModel()
  const out: Day = { decideCalls: 0, callsWhileAsleep: 0, spentUsd: 0, awakeTicks: 0, awakeTicksWithStep: 0, longestCritical: { need: '', minutes: 0 }, criticalTicks: {}, ticks: 0, stepsStarted: 0, stepsUnfinished: 0 }
  const run: Record<string, number> = {}
  for (let i = 0; i < 144; i++) {
    const nowMs = START + i * TICK_MS
    const before = readWorld(dir, () => '2026-11').forkling
    // The workflow's gate: while asleep, only the tick in the first ten minutes of the hour runs.
    if (before.asleep && new Date(nowMs).getUTCMinutes() >= 10) continue
    model.setNow(nowMs)
    const callsBefore = model.calls.length
    await runTick(dir, { now: new Date(nowMs), llm: model.llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona, pools: cat.pools })
    out.ticks++

    const w = readWorld(dir, () => '2026-11')
    const asleep = isAsleepAt(nowMs, { seed: w.forkling.seed, timezone: w.forkling.timezone, lateNight: w.forkling.lateNight })
    const made = model.calls.slice(callsBefore)
    if (asleep) out.callsWhileAsleep += made.filter((c) => c.req.kind !== 'memory').length
    if (asleep) continue

    out.awakeTicks++
    const now = w.goals.now
    if (now && nowMs < Date.parse(now.until) + TICK_MS) out.awakeTicksWithStep++
    for (const [need, value] of Object.entries(needsAt(nowMs))) {
      if (value < 15) {
        run[need] = (run[need] ?? 0) + 10
        out.criticalTicks[need] = (out.criticalTicks[need] ?? 0) + 1
        if (run[need]! > out.longestCritical.minutes) out.longestCritical = { need, minutes: run[need]! }
      } else {
        run[need] = 0
      }
    }
  }
  const stream = readFileSync(join(dir, 'memory/stream/2026-11-03.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { kind: string; text: string })
  out.stepsStarted = stream.filter((e) => e.kind === 'step' && e.text.startsWith('Started ')).length
  out.stepsUnfinished = stream.filter((e) => e.text.startsWith('Left ') && e.text.includes('unfinished')).length
  out.decideCalls = model.calls.filter((c) => c.req.kind === 'morning' || c.req.kind === 'decide').length
  out.spentUsd = BudgetLedger.parse(JSON.parse(readFileSync(join(dir, 'brain/budget.json'), 'utf8'))).spentUsd
  return out
}

describe('a whole day with no visitors', () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'day-'))
    cpSync(worldTemplate, dir, { recursive: true, filter: (src) => !/[\\/]\.github([\\/]|$)/.test(src) })
    day = await liveADay()
    // DAY_REPORT=1 prints what the day measured, for tuning the limits above.
    if (process.env.DAY_REPORT) console.log(`day report: ${JSON.stringify(day)}`)
  }, 120_000)
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('keeps no need under 15 for more than an hour while awake', () => {
    expect(day.longestCritical, JSON.stringify(day)).toSatisfy((c: Day['longestCritical']) => c.minutes <= MAX_CRITICAL_MINUTES)
  })

  it('has a plan step in progress for most of the waking day', () => {
    expect(day.awakeTicks).toBeGreaterThan(80)
    expect(day.awakeTicksWithStep / day.awakeTicks, JSON.stringify(day)).toBeGreaterThanOrEqual(MIN_STEP_SHARE)
  })

  it(`asks for a decision at most ${MAX_DECIDE_CALLS} times, not every half hour`, () => {
    expect(day.decideCalls, JSON.stringify(day)).toBeGreaterThanOrEqual(2)
    expect(day.decideCalls, JSON.stringify(day)).toBeLessThanOrEqual(MAX_DECIDE_CALLS)
  })

  it('does what it plans: the body carries out nearly every step it is given', () => {
    expect(day.stepsStarted, JSON.stringify(day)).toBeGreaterThanOrEqual(20)
    expect(day.stepsUnfinished / day.stepsStarted, JSON.stringify(day)).toBeLessThanOrEqual(0.2)
  })

  it('makes no call while asleep, and stays under the pace of the monthly cap', () => {
    expect(day.callsWhileAsleep).toBe(0)
    expect(day.spentUsd).toBeLessThan(10 / 30)
  })

  it('ends the day planned and reflected on', () => {
    const goals = Goals.parse(JSON.parse(readFileSync(join(dir, 'mind/goals.json'), 'utf8')))
    const state = MindState.parse(JSON.parse(readFileSync(join(dir, 'mind/state.json'), 'utf8')))
    expect(goals.today?.date).toBe('2026-11-03')
    expect(state.lastPlanDate).toBe('2026-11-03')
    expect(state.rejections, 'the fake model writes plans the validator accepts').toEqual([])
  })
})
