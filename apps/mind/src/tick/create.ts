import {
  bodyWorldFor,
  eveningOf,
  isAsleepAt,
  liveBeliefs,
  localDate,
  playbackStateTime,
  pointsAtWake,
  sleepWindow,
  startPlayback,
} from '@forkling/sim'
import { monthOf, recordCall, rollLedger } from '../budget.ts'
import { buildSystem } from '../prompts.ts'
import { readWorld } from '../world.ts'
import { livePrices, reconcileMade, visibleNotes } from '@forkling/sim'
import { createFetcher } from '../web/fetch.ts'
import { readWorks } from '../builds/works.ts'
import { readPlaces } from '../places.ts'
import { readWanderState } from '../web/wander-state.ts'
import { makeAsk } from './ask.ts'
import { readMindConfig } from './variety.ts'
import type { Tick, TickDeps } from './context.ts'

/** The longest stretch of the body's time that one tick counts. */

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
  let budget = rollLedger(w.budget, monthOf(tz, nowMs))
  // A note screened by the server since the last tick is booked here, once, so the loop is the only writer of the ledger.
  const outside = deps.dryRun ? [] : (deps.outsideCalls?.() ?? [])
  for (const call of outside) budget = recordCall(budget, call)
  if (asleep !== forkling.asleep) remember.push({ at: nowIso, kind: asleep ? 'sleep' : 'wake', text: asleep ? 'Went to bed.' : 'Woke up.' })

  // Where the body is now: exactly what a viewer would have seen since the last commit.
  const places = readPlaces(dir)
  const world = bodyWorldFor({ seed: forkling.seed, places })
  const playbackInput = { forkling, pack, behaviors, world, goals: w.goals, stateTime: playbackStateTime(forkling) }
  const playback = startPlayback(playbackInput, nowMs)
  // What the body really did on the plan step since the last write: the step's effect waits on it.
  const body = playback.state
  const mind = structuredClone(w.mindState)
  // The daily allowance is topped up at the first awake tick of each day: what was saved, plus the daily points (300 until the Sunday formula sets another figure), up to the most that may be held (spec v4 5.2).
  if (!asleep && mind.allowance?.day !== today) mind.allowance = { points: pointsAtWake(mind.allowance?.points ?? 0, mind.dailyPoints?.value), day: today }

  const mindConfig = readMindConfig(dir)
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
    notes: mindConfig.problem ? [mindConfig.problem] : [],
    parts,
    calls: [...outside],
    attempts: outside.map((c) => ({ kind: c.kind, model: c.model, usd: c.usd, ok: true })),
    remember,
    steps: [],

    sleepOpts,
    asleep,
    window,
    budget,


    world,
    places,
    body,

    interests: w.interests,
    pendingNote: null,
    pendingWork: null,
    pendingTend: null,
    pendingRevisit: null,
    pendingExpand: null,
    pendingFound: null,
    newRequests: [],
    placeUpdates: [],
    souvenirUpdates: [],
    moodEvents: [],
    justNow: [],

    goals: structuredClone(w.goals),
    mind,
    mood: forkling.mood,
    energy: forkling.energy,
    lateNight: forkling.lateNight,
    started: null,

    triggers: [],
    failed: false,
    nextIndex: 0,
    moreSteps: false,
    thinkKind: null,

    beliefs: w.beliefs,
    wants: structuredClone(w.wants.wants),
    visitorNotes: visibleNotes(w.notes, w.notesHidden),
    visitors: structuredClone(Object.keys(w.visitors.visitors).length > 0 ? reconcileMade(w.visitors, readWorks(dir)) : w.visitors),
    config: mindConfig.config,
    noteUpdates: [],
    pendingReply: null,
    about: w.about,
    aboutWrite: null,
    selfRequest: null,
    page: w.page,
    pageWrite: null,
    beliefIds: new Set(liveBeliefs(w.beliefs).map((b) => b.id)),
    system: buildSystem({ seed: w.seed, page: w.page, prices: livePrices(w.mindState.prices), tools: w.tools.tools }),
    prompt: undefined,
    ask: undefined as never,

    notebook: [],
    trips: mind.trips?.date === today ? mind.trips : { date: today, reads: 0, trips: 0, looks: 0, starts: [] },
    fetcher: deps.web ? createFetcher({ ...deps.web, paused: mind.pausedHosts }) : null,
    wander: readWanderState(dir, today),
    sources: w.sources,
    pendingTrip: null,
    startingPoints: mind.points?.date === today ? mind.points.list : [],
    newTrails: [],
    newSouvenirs: [],
    newWorks: [],
    newJobs: [],
    wishUpdates: [],
    workUpdates: [],
    arts: mind.arts?.date === today ? mind.arts : { date: today, count: 0 },

    decision: null,
    thought: false,
    planPage: false,
    journal: null,
    summaryNext: null,
  }
  t.ask = makeAsk(t)
  return t
}
