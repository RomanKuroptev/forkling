import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BudgetLedger, MindState, Wants } from '@forkling/schema'
import { MAX_REFLECTIONS_PER_DAY, REFLECT_GAP_MS } from '@forkling/sim'
import type { BatchOutcome, LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { appendStream } from '../src/stream.ts'
import { runTick } from '../src/tick.ts'

/**
 * W7's threshold sim (spec 16, slice 14): seven days of the real mind, tick by tick, with the loop's thought ticks on, a scripted model
 * that scores what happened as dull or busy by the day, and the sleep rewrite through a scripted batch. It checks what the spec asks of
 * reflection: it fires only from importance (a run of dull days never reaches the threshold on its own), a busy day has one or two, the
 * wants list fills from empty by the second day, and the caps hold at every tick: 2 reflections a day, 2 hours apart, 12 wants, 1 sleep
 * rewrite a night. Nothing is mocked but the model and the batch: the ticks, importance, the reflection and wants rules are the real ones.
 */
const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')

const DAYS = 7
const DAY_MS = 86_400_000
const START = Date.parse('2026-11-03T06:03:00Z') // 07:03 in Stockholm, a Tuesday
const TICK_MS = 20 * 60_000
/** Busy days score what happened at 8, dull days at 1 (the scripted model's judgement, as the thought tick's would be). */
const BUSY = new Set(['2026-11-03', '2026-11-06', '2026-11-08'])
/** The local date in Stockholm in November (UTC+1). */
const dateOf = (ms: number) => new Date(ms + 3_600_000).toISOString().slice(0, 10)
const DATES = Array.from({ length: DAYS }, (_, i) => dateOf(START + i * DAY_MS))

let dir: string
const file = (rel: string) => join(dir, rel)
const read = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))

const step = (verb: string, target: string | null, minutes: number, reason: string) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null })
const minutesOf = (hh: string, mm: string) => Number(hh) * 60 + Number(mm)

interface Seen {
  reflections: number[]
  sleeps: number[]
  thoughts: number
  maxWants: number
}

function scripted() {
  let clock = START
  let n = 0
  const seen: Seen = { reflections: [], sleeps: [], thoughts: 0, maxWants: 0 }
  const streamIds = (user: string) => [...user.matchAll(/(\d{4}-\d{2}-\d{2}#\d+) \| (\w+) \|/g)].map((m) => ({ id: m[1]!, kind: m[2]! }))
  const plan = (req: LlmRequest) => {
    const now = /time: \w+ \d{4}-\d{2}-\d{2} (\d\d):(\d\d)/.exec(req.user)
    const bed = /bedtime (\d\d):(\d\d)/.exec(req.user)
    const left = now && bed ? minutesOf(bed[1]!, bed[2]!) - minutesOf(now[1]!, now[2]!) : 120
    const count = Math.min(6, Math.floor((left - 45) / 30))
    if (count < 3) return { thought: 'Enough planning for today.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }
    const steps: ReturnType<typeof step>[] = []
    const cycle = ['tend', 'write', 'rest']
    while (steps.length < count) {
      const verb = cycle[n++ % cycle.length]!
      steps.push(step(verb, verb === 'tend' ? 'home' : verb === 'write' ? 'home' : null, 30, `I felt like ${verb} for a while.`))
    }
    return { thought: 'Another day in the world.', longGoal: req.kind === 'morning' ? { text: 'Learn the ground I live on.', reason: 'It is where I live.' } : null, dropLongGoal: false, plan: steps, planReason: 'A day of looking after things.', stayUpLate: null }
  }
  const llm: LlmClient = {
    async complete<T>(req: LlmRequest<T>) {
      const usage = { input: 800, cacheRead: 0, cacheWrite: 0, output: 300 }
      let parsed: unknown = null
      const busy = BUSY.has(dateOf(clock))
      if (req.kind === 'morning' || req.kind === 'decide') parsed = plan(req)
      else if (req.kind === ('thought' as never)) {
        seen.thoughts++
        const ids = [...req.user.matchAll(/(\d{4}-\d{2}-\d{2}#\d+) \|/g)].map((m) => m[1]!)
        parsed = { thought: 'The lamp is on.', scores: ids.map((id) => ({ id, importance: busy ? 8 : 1 })), surprise: 1, action: 'continue', reason: null }
      } else if (req.kind === ('reflection' as never)) {
        seen.reflections.push(clock)
        const cite = streamIds(req.user).filter((s) => s.kind !== 'thought').slice(0, 2).map((s) => s.id)
        parsed = {
          questions: ['What keeps pulling me back to the lamp?'],
          insights: cite.length > 0 ? [{ text: 'I keep coming back to the lamp.', cites: cite }] : [],
          beliefOps: [],
          wants: [0, 1, 2].map((k) => ({ op: 'add', kind: 'question', text: `Why the lamp, ${seen.reflections.length}.${k}?`, why: 'It keeps showing up.', id: null, ids: null })),
          planNoLongerFits: null,
          page: null,
        }
      } else if (req.kind === 'art') parsed = { title: 'A plaque', text: 'The lamp is on. I am still here.' }
      else if (req.kind === ('tend' as never)) parsed = { summary: 'Looked after the shelves.', exhibits: [], labels: [], sign: null, lamps: null, door: null, doorReason: null, putAwayId: null, putAwayReason: null }
      else if (req.kind === ('sleeplate' as never) || req.kind === ('weekly' as never)) parsed = null
      return { parsed: parsed as T | null, stopReason: parsed ? 'end_turn' : 'refusal', usage }
    },
    async submitBatch(req) {
      seen.sleeps.push(clock)
      void req
      return `batch-${seen.sleeps.length}`
    },
    async fetchBatch(): Promise<BatchOutcome> {
      const wants = Wants.safeParse(JSON.parse(existsSync(file('mind/wants.json')) ? readFileSync(file('mind/wants.json'), 'utf8') : '{}'))
      const kept = wants.success ? wants.data.wants.slice(0, 12).map((w) => ({ id: w.id, kind: w.kind, text: w.text, why: w.why })) : []
      return { status: 'done', parsed: { diary: { title: 'A day', paragraphs: [] }, slots: [], beliefOps: [], wants: kept, page: null }, usage: { input: 20_000, cacheRead: 0, cacheWrite: 0, output: 3_000 } }
    },
    async cancelBatch() {},
  }
  return { llm, seen, setNow: (ms: number) => (clock = ms) }
}

const perDay = {
  reflections: Array.from({ length: DAYS }, () => 0),
}
let seen: Seen

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'w7-week-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('places'))
  for (const f of readdirSync(join(world, 'places'))) copyFileSync(join(world, 'places', f), file(`places/${f}`))
  const model = scripted()
  seen = model.seen
  for (let ms = START; ms < START + DAYS * DAY_MS; ms += TICK_MS) {
    model.setNow(ms)
    // What the day brought, written into the stream as a trip or a visitor would: many things on a busy day, few on a dull one.
    const tickNo = Math.round((ms - START) / TICK_MS)
    const local = dateOf(ms)
    if (tickNo % (BUSY.has(local) ? 2 : 12) === 1) appendStream(dir, local, [{ at: new Date(ms).toISOString(), kind: 'made', text: BUSY.has(local) ? `Kept a souvenir about fog from the harbour (${tickNo}).` : `The lamp was on again (${tickNo}).` }])
    await runTick(dir, { now: new Date(ms), llm: model.llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona, thoughts: true })
    const wants = existsSync(file('mind/wants.json')) ? Wants.safeParse(read('mind/wants.json')) : null
    if (wants?.success) seen.maxWants = Math.max(seen.maxWants, wants.data.wants.length)
  }
  for (const ms of seen.reflections) perDay.reflections[DATES.indexOf(dateOf(ms))]!++
  }, 600_000)
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('seven days of dull and busy (W7 done-when)', () => {
  const byDate = (date: string) => perDay.reflections[DATES.indexOf(date)]!

  it('has a reflection on every busy day, one or two, and never more than 2', () => {
    for (const date of BUSY) {
      expect(byDate(date), date).toBeGreaterThanOrEqual(1)
      expect(byDate(date), date).toBeLessThanOrEqual(MAX_REFLECTIONS_PER_DAY)
    }
    for (const n of perDay.reflections) expect(n).toBeLessThanOrEqual(MAX_REFLECTIONS_PER_DAY)
  })

  it('has none on a dull day that follows a dull day: a dull day never reaches the threshold on its own, and what a busy day left over reflects at most once', () => {
    expect(byDate('2026-11-05')).toBe(0)
    for (const date of DATES.filter((d) => !BUSY.has(d))) expect(byDate(date), date).toBeLessThanOrEqual(1)
  })

  it('keeps the reflections at least 2 hours apart', () => {
    for (let i = 1; i < seen.reflections.length; i++) expect(seen.reflections[i]! - seen.reflections[i - 1]!).toBeGreaterThanOrEqual(REFLECT_GAP_MS)
  })

  it('fills the wants list from empty by the end of the second day, and never holds more than 12', () => {
    expect(seen.reflections.length).toBeGreaterThan(0)
    expect(dateOf(seen.reflections[0]!) <= DATES[1]!).toBe(true)
    expect(seen.maxWants).toBeGreaterThanOrEqual(3)
    expect(seen.maxWants).toBeLessThanOrEqual(12)
  })

  it('sends one sleep rewrite a night, and the model spend stays under the cap', () => {
    expect(new Set(seen.sleeps.map((ms) => dateOf(ms - 12 * 3_600_000))).size).toBe(seen.sleeps.length)
    expect(seen.sleeps.length).toBeGreaterThanOrEqual(DAYS - 1)
    const ledger = BudgetLedger.parse(read('brain/budget.json'))
    expect(ledger.spentUsd).toBeLessThan(ledger.capUsd)
    expect(ledger.byKind.reflection?.calls).toBe(seen.reflections.length)
  })

  it('keeps the importance sum from carrying more than it should: it starts again from nothing at every reflection', () => {
    expect(MindState.parse(read('mind/state.json')).reflect?.sum).toBeLessThan(60 + 24 * 8)
  })
})
