import {
  collectSpots,
  decayFeelings,
  eveningOf,
  hourInZone,
  isAsleepAt,
  liveBeliefs,
  localDate,
  playbackStateTime,
  quirkWeights,
  rollTemperament,
  sleepWindow,
  startPlayback,
  sunDirection,
  worldWithObjects,
  type Stored,
} from '@forkling/sim'
import type { WorldObject } from '@forkling/schema'
import { monthOf, rollLedger } from '../budget.ts'
import { buildSystem } from '../prompts.ts'
import { readWorld } from '../world.ts'
import { makeAsk } from './ask.ts'
import type { Tick, TickDeps } from './context.ts'

/** The spot kinds that have at least one place in the world made of `objects`. */
export function spotsFor(t: Pick<Tick, 'pack' | 'tz' | 'nowMs'>, objects: readonly WorldObject[]): Set<string> {
  const w2 = worldWithObjects(objects)
  const spots = collectSpots(t.pack, w2.cfg, w2.nav, w2.spawn, sunDirection(hourInZone(t.tz, t.nowMs)), w2.objects)
  return new Set(Object.keys(spots).filter((k) => (spots[k]?.length ?? 0) > 0))
}

/** Reads the world and replays the body to now: the starting point every step works from. */
export function createTick(dir: string, deps: TickDeps): Tick {
  const { pack, behaviors } = deps
  const nowMs = deps.now.getTime()
  const nowIso = deps.now.toISOString()
  const w = readWorld(dir, (f) => monthOf(f.timezone, nowMs))
  const { forkling } = w
  const tz = forkling.timezone
  const today = localDate(tz, nowMs)
  const remember: Tick['remember'] = []
  const parts: string[] = []

  const sleepOpts = { seed: forkling.seed, timezone: tz, lateNight: forkling.lateNight }
  const asleep = isAsleepAt(nowMs, sleepOpts)
  const window = sleepWindow(today, forkling.seed, tz, forkling.lateNight === today)
  const budget = rollLedger(w.budget, monthOf(tz, nowMs))
  if (asleep !== forkling.asleep) remember.push({ at: nowIso, kind: asleep ? 'sleep' : 'wake', text: asleep ? 'Went to bed.' : 'Woke up.' })

  // Who it is: rolled once from its seed, then fixed for life.
  let temperament = w.temperament
  const rolled = !temperament && !!deps.pools
  if (!temperament && deps.pools) {
    temperament = rollTemperament(forkling.seed, deps.pools)
    parts.push('rolled its temperament')
  }
  const weights = temperament && deps.pools ? quirkWeights(temperament, deps.pools) : {}

  // Where the body is now: exactly what a viewer would have seen since the last commit.
  const world = worldWithObjects(w.objects)
  const playback = startPlayback(
    { forkling, pack, behaviors, world, goals: w.goals, stateTime: playbackStateTime(forkling), quirkWeights: weights },
    nowMs,
  )
  const body = playback.state
  const objects: WorldObject[] = [...w.objects]
  const mind = structuredClone(w.mindState)
  const stored: Stored = { ...forkling.stored }

  const t: Tick = {
    dir,
    deps,
    pack,
    nowMs,
    nowIso,
    w,
    forkling,
    tz,
    today,
    evening: eveningOf(tz, forkling.seed, nowMs),
    notes: [],
    parts,
    calls: [],
    remember,
    steps: [],
    buildRequests: [],

    sleepOpts,
    asleep,
    window,
    budget,

    temperament,
    rolled,

    world,
    body,
    events: w.inbox.flatMap((item) => (item.event ? [item.event] : [])),

    objects,
    objectIds: new Set(objects.map((o) => o.id)),
    holding: forkling.holding,
    stored,
    skills: w.skills,
    interests: w.interests,
    pendingReading: null,
    pendingArt: null,
    pendingPhoto: null,
    pendingCode: null,
    touched: new Set(),
    gone: new Set(),
    appraisals: [],
    justNow: [],
    feelings: decayFeelings(forkling.feelings, Math.max(0, (nowMs - Date.parse(forkling.lastTickAt)) / 3_600_000)),
    spotKeys: new Set(),

    goals: structuredClone(w.goals),
    mind,
    mood: forkling.mood,
    lateNight: forkling.lateNight,
    started: null,

    triggers: [],
    failed: false,
    nextIndex: 0,
    moreSteps: false,
    thinkKind: null,

    beliefs: w.beliefs,
    beliefIds: new Set(liveBeliefs(w.beliefs).map((b) => b.id)),
    system: buildSystem({ pack, name: forkling.name, speciesPersona: deps.speciesPersona, persona: w.persona }),
    prompt: undefined,
    ask: undefined as never,

    notebook: [],
    readings: mind.readings?.date === today ? mind.readings : { date: today, count: 0, skimmed: false },
    madeArt: [],
    arts: mind.arts?.date === today ? mind.arts : { date: today, count: 0 },

    decision: null,
    thought: false,
    planPage: false,
    journal: null,
    summaryNext: null,
  }
  t.spotKeys = spotsFor(t, t.objects)
  t.ask = makeAsk(t)
  return t
}
