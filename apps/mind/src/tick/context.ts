import type { z } from 'zod'
import type {
  Artifact,
  ArtifactKind,
  BudgetCall,
  BuildRequest,
  Goals,
  Intention,
  Souvenir,
  SourceStats,
  Trail,
  MicroBehavior,
  MindState,
  NowJson,
  PlanStep,
  Place,
  SpeciesPack,
  TickCall,
  TimelineEntry,
  TinkerJob,
  ExpandJob,
  PlaceRequest,
  VisitorEvent,
  Wish,
  WorkMeta,
  WorldObject,
} from '@forkling/schema'
import type { BodyWorld, MoodEvent, Trigger, sleepWindow, startPlayback } from '@forkling/sim'
import type { ModelId, rollLedger } from '../budget.ts'
import type { Decision } from '../decision.ts'
import type { WorkChecker } from '../builds/browser-check.ts'
import type { StartingPoint } from '../web/doors.ts'
import type { Fetcher, FetcherOptions } from '../web/fetch.ts'
import type { WanderState } from '../web/wander-state.ts'
import type { CallKind, LlmClient, LlmResult } from '../llm.ts'
import type { ThinkKind } from '../prompts.ts'
import type { NewEntry } from '../stream.ts'
import type { readWorld } from '../world.ts'

export interface TickDeps {
  now: Date
  /** Null when there is no API key: the tick still runs, it just never thinks. */
  llm: LlmClient | null
  pack: SpeciesPack
  behaviors: MicroBehavior[]
  /** The species `persona.md`. */
  speciesPersona: string
  /** How the web is reached: the fetcher's options (a test swaps in a fake `fetchImpl`). Without it the forkling reads nothing. */
  web?: Omit<FetcherOptions, 'paused'>
  /** Work out the prompt and what it would cost, but call nothing and write nothing. */
  dryRun?: boolean
  /** The engine ref that runs this tick, written into the tick log so a replay can use the same sim. */
  engine?: string
  /** Checks a work in a browser (spec 7.3). Only the server has one, so on the Actions tick a work step rests. */
  workCheck?: WorkChecker
  /** The loop's ticks also make a thought tick when one is due (spec 2.2). The Actions tick has none. */
  thoughts?: boolean
  /** The loop's ticks write the tick log and health at most this often (ms) unless something happened. Absent means every tick. */
  logEveryMs?: number
  /** The loop's last push failed 3 times: health.json says `push failing` until one goes through (spec 2.2). */
  pushFailing?: boolean
}

/** What a tick gives back to the loop: the result, and `now.json` as the tick left the world. */
export type TickOutcome = TickResult & { now: NowJson; places: Place[] }

export interface TickResult {
  /** Whether any file in the world changed. */
  changed: boolean
  /** Whether the tick log was written, which is every tick except a dry run. */
  logged: boolean
  /** A few words for the commit message and the job summary. */
  summary: string
  /** Files written or deleted, relative to the world root. */
  written: string[]
  /** Why things did or didn't happen: skipped calls, rejected plans. */
  notes: string[]
  calls: BudgetCall[]
  /** The prompt of the call this tick would make or made, for dry runs and logs. */
  prompt?: { model: ModelId; kind: CallKind; system: string; user: string; tokens: number; maxUsd: number }
}

type World = ReturnType<typeof readWorld>

/** A model call that meets the same guards every time: prompt size, dry run, key, budget. See `makeAsk`. */
export type Ask = <T>(kind: CallKind, model: ModelId, user: string, schema: z.ZodType<T>, maxTokens?: number) => Promise<LlmResult<T> | null>

/**
 * Everything one tick knows and changes, in one place. The steps run in the order `runTick` calls them and each reads
 * and writes this. A few fields are snapshots taken at one step and deliberately not refreshed after it.
 */
export interface Tick {
  dir: string
  deps: TickDeps
  pack: SpeciesPack
  nowMs: number
  nowIso: string
  w: World
  forkling: World['forkling']
  tz: string
  today: string
  /** The evening whose day a bedtime reflection and the memory rewrite are about. */
  evening: string
  notes: string[]
  parts: string[]
  calls: BudgetCall[]
  /** Every try at calling a model, including the ones that did not happen, for the tick log. */
  attempts: TickCall[]
  /** What happened this tick, for the day's memory stream. Written by code from sim events, no model. */
  remember: NewEntry[]
  steps: TimelineEntry[]

  sleepOpts: { seed: number; timezone: string; lateNight: World['forkling']['lateNight'] }
  asleep: boolean
  window: ReturnType<typeof sleepWindow>
  budget: ReturnType<typeof rollLedger>

  world: BodyWorld
  /** The places in the world (`places/*.json`), in id order. Empty in a world that has none yet. */
  places: Place[]
  body: ReturnType<typeof startPlayback>['state']
  events: VisitorEvent[]

  objects: WorldObject[]
  /** The ids of `objects` once the finishing step is applied. Not refreshed after that. */
  objectIds: Set<string>
  interests: World['interests']
  /** Set when a write step finishes: the words are written after the step is applied. */
  pendingNote: { step: PlanStep; index: number } | null
  /** Set when a sketch step finishes: the sketch is made after the step is applied. */
  pendingWork: { step: PlanStep; index: number } | null
  /** Set when a tend step finishes: the place is changed after the step is applied. */
  pendingTend: { step: PlanStep; index: number } | null
  /** Set when a revisit step finishes: the visit is written after the step is applied. */
  pendingRevisit: { step: PlanStep; index: number } | null
  /** Set when an expand step finishes: the builders are asked for it after the step is applied (spec 2.4). */
  pendingExpand: { step: PlanStep; index: number } | null
  /** Set when a found step finishes: the request is written after the step is applied (spec 2.4, 10.3). */
  pendingFound: { step: PlanStep; index: number } | null
  /** Place requests written this tick, written to `requests/<id>.md` (spec 10.3). */
  newRequests: PlaceRequest[]
  /** Places whose file changed this tick (a tend, an expand), written to `places/<id>.json`. */
  placeUpdates: Place[]
  /** Souvenirs whose `placedIn` changed this tick, written to `souvenirs/<id>.json`. */
  souvenirUpdates: Souvenir[]
  touched: Set<string>
  gone: Set<string>
  /** What happened this tick that moves mood and energy (spec 3.2), applied by `feel`. */
  moodEvents: MoodEvent[]
  justNow: string[]
  spotKeys: Set<string>

  goals: Goals
  mind: MindState
  /** Mood and energy, from -1 to 1. */
  mood: number
  energy: number
  lateNight: World['forkling']['lateNight']
  started: Intention | null

  triggers: Trigger[]
  /** Whether the step that just finished could not happen. */
  failed: boolean
  /** Taken before any step is started, and not refreshed: the decision step reuses them. */
  nextIndex: number
  moreSteps: boolean
  thinkKind: ThinkKind | 'bedtime' | null

  beliefs: World['beliefs']
  /** The live beliefs a plan may cite. Taken before bedtime changes them. */
  beliefIds: Set<string>
  /** The cached part of the prompt, built once. */
  system: string
  /** The first prompt of the tick, for dry runs and logs. */
  prompt: TickResult['prompt']
  ask: Ask

  notebook: { path: string; text: string }[]
  /** Web trips so far today (spec 9.8). */
  trips: NonNullable<MindState['trips']>
  /** The only way the tick reads the web, or null when there is none. */
  fetcher: Fetcher | null
  /** What earlier trips left: pages read lately, souvenirs kept, trails of today. */
  wander: WanderState
  /** `mind/sources.json`. */
  sources: SourceStats
  /** Set when a wander step finishes: the trip runs after the step is applied. */
  pendingTrip: { step: PlanStep; index: number } | null
  /** Where the morning may start from, with 3 doors, shown to the morning plan. */
  startingPoints: StartingPoint[]
  newTrails: Trail[]
  newSouvenirs: Souvenir[]
  /** Works made this tick (a shelved sketch, or a scrap), written to `works/<id>/` with the tick. */
  newWorks: { meta: WorkMeta; html: string; thumb: Buffer | null }[]
  /** Works whose meta changed this tick (put away, brought back), written to `works/<id>/meta.json`. */
  workUpdates: WorkMeta[]
  /** Requests for the build worker made this tick, written to `mind/builds/<id>.json` (spec 10.2). */
  newJobs: (TinkerJob | ExpandJob)[]
  /** Wishes written or counted up this tick, written to `wishes/<id>.json` (spec 5.3). */
  wishUpdates: Wish[]
  arts: NonNullable<MindState['arts']>

  decision: Decision | null
  thought: boolean
  planPage: boolean
  journal: { date: string; text: string } | null
  summaryNext: string | null
}
