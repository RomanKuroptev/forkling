import {
  collectSpots,
  eveningOf,
  hourInZone,
  isAsleepAt,
  liveBeliefs,
  localDate,
  playbackStateTime,
  pointsAtWake,
  sleepWindow,
  startPlayback,
  sunDirection,
  tallyWindow,
  worldWithObjects,
  type Stored,
} from '@forkling/sim'
import type { WorldObject } from '@forkling/schema'
import { monthOf, rollLedger } from '../budget.ts'
import { buildSystem } from '../prompts.ts'
import { readWorld } from '../world.ts'
import { makeAsk } from './ask.ts'
import type { Tick, TickDeps } from './context.ts'

/** The longest stretch of the body's time that one tick counts. */
const MAX_TALLY_MS = 2 * 3_600_000

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

  // Where the body is now: exactly what a viewer would have seen since the last commit.
  const world = worldWithObjects(w.objects)
  const playbackInput = { forkling, pack, behaviors, world, goals: w.goals, stateTime: playbackStateTime(forkling) }
  const playback = startPlayback(playbackInput, nowMs)
  // What the body really did on the plan step since the last write: the step's effect waits on it.
  const running = w.goals.now
  // How long a stretch is ever counted. After a longer pause (or in a world's first tick) nothing is, since the body was not being watched.
  const writtenMs = playbackStateTime(forkling) * 1000
  const from = nowMs - writtenMs > MAX_TALLY_MS ? nowMs : writtenMs
  const to = running ? Math.min(nowMs, Date.parse(running.until)) : 0
  const tally = running && !asleep && to > from ? tallyWindow(playbackInput, from, to) : { seconds: {}, started: {}, interruptions: [] }
  const stepVerb = running ? w.goals.today?.steps[running.index]?.verb : undefined
  const body = playback.state
  const objects: WorldObject[] = [...w.objects]
  const mind = structuredClone(w.mindState)
  // The daily allowance is topped up at the first awake tick of each day: what was saved, plus 150, up to 450 (spec 9.8).
  if (!asleep && mind.allowance?.day !== today) mind.allowance = { points: pointsAtWake(mind.allowance?.points ?? 0), day: today }
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
    attempts: [],
    remember,
    steps: [],
    buildRequests: [],

    sleepOpts,
    asleep,
    window,
    budget,


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
    pendingNote: null,
    pendingArt: null,
    pendingPhoto: null,
    pendingCode: null,
    touched: new Set(),
    gone: new Set(),
    moodEvents: [],
    justNow: [],
    spotKeys: new Set(),

    goals: structuredClone(w.goals),
    mind,
    mood: forkling.mood,
    energy: forkling.energy,
    lateNight: forkling.lateNight,
    started: null,

    triggers: [],
    worked: stepVerb ? (tally.seconds[stepVerb] ?? 0) : 0,
    drift: tally.interruptions.map((i) => ({ verb: i.verb, need: i.need, at: new Date(i.at * 1000).toISOString() })),
    failed: false,
    nextIndex: 0,
    moreSteps: false,
    thinkKind: null,

    beliefs: w.beliefs,
    beliefIds: new Set(liveBeliefs(w.beliefs).map((b) => b.id)),
    system: buildSystem({ seed: w.seed }),
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
