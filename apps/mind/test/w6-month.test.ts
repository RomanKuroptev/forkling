import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BudgetLedger, Interests, MindState, Place, PlaceRequest, Souvenir, Wish, formatRequest, isOpenWish, parseRequest, MAX_OPEN_WISHES } from '@forkling/schema'
import { allPaths, expandAllowed, lastSizeChange, layoutProblems, placementCandidates, PLACE_LIMITS, toLandPlace } from '@forkling/sim'
import { createBuildWorker } from '../src/build-worker.ts'
import { createExpandHandler } from '../src/builds/expand-job.ts'
import { createFoundBuildHandler } from '../src/builds/found-build-job.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

/**
 * W6's done-when, as a test (spec 16): thirty days of the real mind, tick by tick, with a scripted model and a scripted Roman.
 * It checks, after every tick, that no quota and no condition of spec 2.5 is ever broken, and at the end that a place built by the
 * fallback stands on a chunk the rule allows and is joined by a path. Nothing is mocked but the model's answers and Roman: the
 * ticks, the plan validator, the gates, the build worker's handlers and the lifecycle are the real ones.
 */
const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')

const DAYS = 30
const DAY_MS = 86_400_000
const START = Date.parse('2026-11-03T06:03:00Z') // 07:03 in Stockholm
const TICK_MS = 20 * 60_000 // the rails do not depend on the tick being every 10 minutes, and a month at 10 takes over two minutes
const TICKS_PER_DAY = DAY_MS / TICK_MS
const WEEK_MS = 7 * DAY_MS

let dir: string
const file = (rel: string) => join(dir, rel)
const read = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const put = (rel: string, value: unknown) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(file(rel), typeof value === 'string' ? value : JSON.stringify(value))
}
const listDir = (rel: string, ext: string) => (existsSync(file(rel)) ? readdirSync(file(rel)).filter((f) => f.endsWith(ext)).sort() : [])
const readPlaces = () => listDir('places', '.json').map((f) => Place.parse(read(`places/${f}`)))
const readRequests = () => listDir('requests', '.md').map((f) => parseRequest(readFileSync(file(`requests/${f}`), 'utf8'))!)
const readWishes = () => listDir('wishes', '.json').map((f) => Wish.parse(read(`wishes/${f}`)))
const isoOf = (ms: number) => new Date(ms).toISOString()

// ---- the model: plans that use whatever the prompt offers, and ordinary answers for every other call ----

const step = (verb: string, target: string | null, minutes: number, reason: string) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null })
const minutesOf = (hh: string, mm: string) => Number(hh) * 60 + Number(mm)

function fakeModel() {
  let clock = START
  let n = 0
  const counts: Record<string, number> = {}
  const decide = (req: LlmRequest) => {
    const now = /time: \w+ \d{4}-\d{2}-\d{2} (\d\d):(\d\d)/.exec(req.user)
    const bed = /bedtime (\d\d):(\d\d)/.exec(req.user)
    const left = now && bed ? minutesOf(bed[1]!, bed[2]!) - minutesOf(now[1]!, now[2]!) : 120
    const count = Math.min(6, Math.floor((left - 45) / 30))
    if (count < 3) return { thought: 'Enough planning for today.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }
    const places = listDir('places', '.json').map((f) => f.slice(0, -5))
    const steps: ReturnType<typeof step>[] = []
    if (/<foundable>/.test(req.user)) steps.push(step('found', `Hall ${++halls}`, 30, 'I want a new place for what keeps pulling at me.'))
    const growable = /<growable>[\s\S]*?\n- ([a-z0-9-]+) \(/.exec(req.user)?.[1]
    if (growable) steps.push(step('expand', growable, 30, 'The place is full of what I keep finding.'))
    const cycle = ['tend', 'write', 'rest']
    while (steps.length < count) {
      const verb = cycle[n++ % cycle.length]!
      steps.push(step(verb, verb === 'tend' ? places[n % places.length]! : verb === 'write' ? 'home' : null, 30, `I felt like ${verb} for a while.`))
    }
    return { thought: 'Another day in the world.', longGoal: req.kind === 'morning' ? { text: 'Learn the ground I live on.', reason: 'It is where I live.' } : null, dropLongGoal: false, plan: steps, planReason: 'A day of looking after things.', stayUpLate: null }
  }
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      counts[req.kind] = (counts[req.kind] ?? 0) + 1
      const usage = { input: 800, cacheRead: 0, cacheWrite: 0, output: 300 }
      let parsed: unknown = null
      if (req.kind === 'morning' || req.kind === 'decide') parsed = decide(req)
      else if (req.kind === 'art') parsed = { title: 'A plaque', text: 'The lamp is on. I am still here.' }
      else if (req.kind === ('tend' as never)) parsed = { summary: `Looked after the shelves (${counts.tend}).`, exhibits: [], labels: [], sign: null, lamps: null, door: null, doorReason: null, putAwayId: null, putAwayReason: null }
      else if (req.kind === ('revisit' as never)) parsed = { summary: 'Sat there a while.', thought: 'It is quiet.' }
      else if (req.kind === ('found' as never)) {
        parsed = { purpose: 'A place for what keeps pulling at me, held up under a lamp.', tags: ['dem'], related: [], souvenirs: [], body: 'I keep coming back to this. I want a place where it can sit under a lamp and be looked at slowly.', wishes: [], constraintRefusal: null }
      }
      return { parsed: parsed as T | null, stopReason: parsed ? 'end_turn' : 'refusal', usage }
    },
  }
  return { llm, counts, setNow: (ms: number) => (clock = ms), now: () => clock }
}

/** The builders' model: a path, then a room along the east wall, then a room along the south wall; and a plain kit place for the fallback. */
function fakeBuilder() {
  const done = new Map<string, number>()
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      const usage = { input: 15_000, cacheRead: 0, cacheWrite: 0, output: 4_000 }
      let parsed: unknown = null
      if (req.kind === ('foundbuild' as never)) {
        parsed = { style: 'timber', palette: 'meadow', width: 12, depth: 10, floors: 1, rooms: [{ id: 'main', name: 'Main room', width: 10, depth: 8, height: 3, x: 0, z: 0, floor: 0, parts: [{ part: 'shelf-low', x: 0, y: 0, z: 3, rot: 0 }, { part: 'lamp-floor', x: 3, y: 0, z: 3, rot: 0 }] }] }
      } else if (req.kind === ('expand' as never)) {
        const id = /\(id ([a-z0-9-]+)\)/.exec(req.user)?.[1]
        if (!id) throw new Error('the expand job prompt names no place: the builder would have lumped every expand together')
        const k = done.get(id) ?? 0
        done.set(id, k + 1)
        const other = id === 'home' ? 'workshop' : 'home'
        const room = (rid: string, w: number, d: number, x: number, z: number) => ({ summary: `Added the ${rid}.`, change: 'room', room: { id: rid, name: rid, width: w, depth: d, height: 3, x, z, floor: 0, parts: [] }, enlarge: null, path: null, wishes: k === 0 ? [{ name: `Lamp rail ${id}`, description: 'A rail of small lamps.', forPlace: id }] : [], constraintRefusal: null })
        parsed = k === 0 ? { summary: 'A path to the neighbour.', change: 'path', room: null, enlarge: null, path: { to: other }, wishes: [{ name: `Lamp rail ${id}`, description: 'A rail of small lamps.', forPlace: id }], constraintRefusal: null } : k === 1 ? room('east-room', 1, 8, 5.5, 0) : k === 2 ? room('south-room', 10, 0.9, 0, 4.55) : null
      }
      return { parsed: parsed as T | null, stopReason: parsed ? 'end_turn' : 'refusal', usage }
    },
  }
  return llm
}

// ---- Roman, and the world's own life: souvenirs and interests that a wander would have fed ----

const souvenir = (id: string, topic: string, placedIn: string | null, atMs: number) =>
  put(`souvenirs/${id}.json`, Souvenir.parse({ kind: 'quote', id, why: 'it stuck', content: `words about ${topic} ${id}`, topics: [topic], placedIn, source: { url: `https://en.wikipedia.org/wiki/${encodeURIComponent(topic)}`, title: id, fetchedAt: isoOf(atMs) } }))

function feedInterests(day: number, atMs: number) {
  const topic = (weight: number) => ({ weight, firstSeen: '2026-11-01T10:00:00Z', lastFed: isoOf(atMs), sources: [] })
  const topics: Record<string, unknown> = { dem: topic(90) }
  if (day <= 20) topics.bells = topic(80)
  if (day >= 9) topics.tides = topic(80)
  put('brain/interests.json', Interests.parse({ version: 2, topics }))
}

// ---- the month ----

interface Snapshot {
  places: Map<string, Place>
}
const historyKey = (h: { at: string; verb: string; summary: string }) => `${h.at}|${h.verb}|${h.summary}`
const violations: string[] = []
const expands: { at: string; place: string }[] = []
let ticks = 0
let model: ReturnType<typeof fakeModel>
let started = 0
let halls = 0

async function liveThirtyDays() {
  model = fakeModel()
  const worker = createBuildWorker({ dir, now: model.now, handlers: { expand: createExpandHandler({ dir, llm: fakeBuilder(), now: model.now }), found: createFoundBuildHandler({ dir, llm: fakeBuilder(), now: model.now }) } })
  let before: Snapshot = { places: new Map(readPlaces().map((p) => [p.id, p])) }
  started = 0 // a fresh world: the ledger is written by the first tick

  for (let i = 0; i < DAYS * TICKS_PER_DAY; i++) {
    const nowMs = START + i * TICK_MS
    const dayIndex = Math.floor((nowMs - START) / DAY_MS)
    if (i % TICKS_PER_DAY === 0) {
      // A new day: what a wander would have brought home, and what Roman did meanwhile.
      feedInterests(dayIndex, nowMs)
      if (dayIndex === 0) {
        for (const n of [1, 2, 3, 4]) souvenir(`dem-home-${n}`, 'dem', 'home', nowMs - 60_000 * n)
        for (const n of [1, 2, 3, 4]) souvenir(`dem-shop-${n}`, 'dem', 'workshop', nowMs - 60_000 * n)
      }
      if (dayIndex === 12) for (const n of [5, 6, 7, 8]) souvenir(`dem-home-${n}`, 'dem', 'home', nowMs), souvenir(`dem-shop-${n}`, 'dem', 'workshop', nowMs)
    }
    const asleep = read('forkling.json').asleep
    // The workflow's gate: while asleep, only the tick in the first ten minutes of the hour runs.
    if (asleep && new Date(nowMs).getUTCMinutes() >= 10) continue

    model.setNow(nowMs)
    await runTick(dir, { now: new Date(nowMs), llm: model.llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })
    // A job the tick just wrote is checked now, on the world as the tick left it, before the worker finishes it and a landed expand
    // resets the place (checked after the worker, the check could never fail).
    checkJobs(nowMs)
    await worker.tick()
    ticks++
    check(nowMs, before)
    before = { places: new Map(readPlaces().map((p) => [p.id, p])) }
  }
}

/** Everything that must hold after every tick. */
function check(nowMs: number, before: Snapshot) {
  const at = isoOf(nowMs)
  const requests = readRequests()
  const founding = readPlaces().filter((p) => p.state.construction?.kind === 'found' && Date.parse(p.state.construction.finishesAt) > nowMs).length
  if (founding > 1) violations.push(`${at}: ${founding} founded places under construction at once (at most 1)`)
  const wishes = readWishes().filter(isOpenWish).length
  if (wishes > MAX_OPEN_WISHES) violations.push(`${at}: ${wishes} wishes open (at most ${MAX_OPEN_WISHES})`)

  const state = MindState.parse(read('mind/state.json'))
  if ((state.allowance?.points ?? 0) < 0) violations.push(`${at}: the allowance went negative (${state.allowance?.points})`)

  for (const place of readPlaces()) {
    const prev = before.places.get(place.id)
    if (!prev) continue
    // What was added, not what lies past the old length: a history held at the cap loses its oldest lines as new ones come in.
    const had = new Set(prev.history.map(historyKey))
    const newExpands = place.history.filter((h) => h.verb === 'expand' && !had.has(historyKey(h)))
    for (const h of newExpands) {
      expands.push({ at: h.at, place: place.id })
      const building = prev.state.construction && Date.parse(prev.state.construction.finishesAt) > nowMs
      if (building) violations.push(`${at}: ${place.id} was expanded while it was under construction`)
    }
  }
}
const checkedJobs = new Set<string>()

/** Spec 2.5: an expand job is only ever written for a place that has earned it. Looked at the moment it is first seen. */
function checkJobs(nowMs: number) {
  const at = isoOf(nowMs)
  // Spec 2.5: an expand job is only ever written for a place that has earned it, checked on the world as the tick left it.
  const jobs = listDir('mind/builds', '.json').filter((f) => f.startsWith('expand-') && !f.endsWith('.result.json'))
  for (const f of jobs) {
    if (checkedJobs.has(f)) continue
    checkedJobs.add(f)
    const job = read(`mind/builds/${f}`) as { placeId: string }
    const place = readPlaces().find((p) => p.id === job.placeId)
    const interests = Interests.parse(read('brain/interests.json'))
    const souvenirs = listDir('souvenirs', '.json').map((s) => Souvenir.parse(read(`souvenirs/${s}`)))
    const weights = Object.fromEntries(Object.entries(interests.topics).map(([k, v]) => [k, v.weight]))
    if (!place) violations.push(`${at}: an expand job for ${job.placeId}, which is not a place`)
    else {
      const verdict = expandAllowed(place, null)
      if (!verdict.ok) violations.push(`${at}: an expand job for ${job.placeId} while 2.5 does not hold (${verdict.ok ? '' : verdict.reasons.join('; ')})`)
    }
  }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'w6-month-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('places'))
  copyFileSync(join(world, 'places/home.json'), file('places/home.json'))
  copyFileSync(join(world, 'places/workshop.json'), file('places/workshop.json'))
  await liveThirtyDays()
  if (process.env.MONTH_REPORT) console.log(`month report: ticks=${ticks} calls=${JSON.stringify(model.counts)} expands=${JSON.stringify(expands)} requests=${JSON.stringify(readRequests().map((r) => [r.id, r.kind, r.status, r.written.slice(0, 10)]))} places=${readPlaces().map((p) => `${p.id}@${p.chunk}[${p.history.filter((h) => h.verb === 'found').map((h) => h.summary).join('|')}]`).join(', ')} violations=${JSON.stringify(violations)}`)
}, 600_000)
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('thirty days of the real mind, with a scripted model and a scripted Roman (W6 done-when, spec 16)', () => {
  it('never breaks a quota or a condition of spec 2.5, tick after tick', () => {
    expect(violations).toEqual([])
  })

  it('actually exercises them: it founds places, expands places, and a place lands', () => {
    const requests = readRequests().filter((r) => r.kind === 'place')
    expect(requests.length, 'found never wrote a founding').toBeGreaterThanOrEqual(2)
    expect(expands.length, 'no expand ever landed').toBeGreaterThanOrEqual(2)
    expect(readPlaces().length).toBeGreaterThan(3)
  })

  it('asks for a new place at most once a week', () => {
    const times = readRequests().filter((r) => r.kind === 'place').map((r) => Date.parse(r.written)).sort((a, b) => a - b)
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!, `requests ${i - 1} and ${i}`).toBeGreaterThanOrEqual(WEEK_MS)
  })

  it('never expands the same place twice in a row', () => {
    const order = [...expands].sort((a, b) => a.at.localeCompare(b.at)).map((e) => e.place)
    for (let i = 1; i < order.length; i++) expect(order[i], `expands ${order.join(', ')}`).not.toBe(order[i - 1])
  })

  it('stays inside the budget', () => {
    const ledger = BudgetLedger.parse(read('brain/budget.json'))
    expect(ledger.spentUsd - started).toBeLessThan(10)
  })

  it('builds every founding from the kit at once, with no wait for Roman (spec v4 2.3)', () => {
    const requests = readRequests().filter((r) => r.kind === 'place')
    expect(requests.every((r) => r.status === 'self-built'), JSON.stringify(requests.map((r) => [r.id, r.status]))).toBe(true)
    const plain = readPlaces().find((p) => p.id === requests[0]!.id)!
    expect(plain.history.some((h) => h.summary === 'Founded by Merge, built by Merge from the kit.')).toBe(true)
    const waited = Date.parse(plain.history.find((h) => h.verb === 'found')!.at) - Date.parse(requests[0]!.written)
    expect(waited, 'the kit build came within a day').toBeLessThan(DAY_MS)
  })

  it('holds every place inside the history cap and keeps what is read later: its founding lines and its last size change', () => {
    const places = readPlaces()
    for (const place of places) {
      expect(place.history.length, `${place.id} history`).toBeLessThanOrEqual(PLACE_LIMITS.historyMax)
      expect(place.history.some((h) => h.verb === 'found'), `${place.id} lost every founding line`).toBe(true)
      const lastExpand = [...expands].filter((e) => e.place === place.id).sort((a, b) => a.at.localeCompare(b.at)).at(-1)
      if (lastExpand) expect(lastSizeChange(place), `${place.id} forgot when it last grew`).toBeGreaterThanOrEqual(Date.parse(lastExpand.at))
    }
    // The cap is really met in this month: a place tended every day reaches it, so the lines above were kept by the rule, not by luck.
    expect(Math.max(...places.map((p) => p.history.length)), 'no place reached the cap, so the cap was never exercised').toBe(PLACE_LIMITS.historyMax)
  })

  it('writes the place numbers into mind/health.json and never warns about them', () => {
    const health = read('mind/health.json')
    const numbers = health.novelty.places
    expect(Object.keys(numbers).sort()).toEqual(['repeatedPlace', 'stuckInOnePlace', 'weekendRevisit', 'wouldFire'])
    expect(numbers.wouldFire).toBe(numbers.repeatedPlace + numbers.stuckInOnePlace + numbers.weekendRevisit)
    expect((health.warnings as string[]).join(' ')).not.toMatch(/repeated place|stuck in one place|weekend revisit/i)
  })

  it('puts a place built by the fallback on the chunk the rule picks, and joins it to the others by a path', () => {
    const request = readRequests().find((r) => r.status === 'self-built')!
    const places = readPlaces()
    const place = places.find((p) => p.id === request.id)!
    expect(place.chunk, 'the place is on the chunk the request staked').toEqual(request.chunk)
    const others = places.filter((p) => p.id !== place.id).map(toLandPlace)
    const keys = placementCandidates(others).map((c) => `${c[0]},${c[1]}`)
    expect(keys, 'the chunk touches ground that is already owned, as the rule of 4.2 asks').toContain(`${place.chunk[0]},${place.chunk[1]}`)
    expect(layoutProblems(places.map(toLandPlace))).toEqual([])
    const joined = allPaths(places.map(toLandPlace)).filter((p) => p.from === place.id || p.to === place.id)
    expect(joined.length, 'no path reaches the new place').toBeGreaterThanOrEqual(1)
  })
})
