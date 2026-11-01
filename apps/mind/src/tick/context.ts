import type { z } from 'zod'
import type {
  Artifact,
  ArtifactKind,
  BudgetCall,
  BuildRequest,
  Goals,
  Intention,
  MicroBehavior,
  MindState,
  PlanStep,
  SpeciesPack,
  TemperamentPools,
  TimelineEntry,
  VisitorEvent,
  WorldObject,
} from '@forkling/schema'
import type { AppraisalEvent, Feelings, Stored, Trigger, sleepWindow, startPlayback, worldWithObjects } from '@forkling/sim'
import type { ModelId, rollLedger } from '../budget.ts'
import type { Decision } from '../decision.ts'
import type { GetJson } from '../feeds/index.ts'
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
  /** Where likes, dislikes and quirks are rolled from. Without it a forkling has no temperament and keeps whatever mood the model gives it. */
  pools?: TemperamentPools | null
  /** Reads a public URL as JSON, for the feeds and Wikipedia. Without it the forkling reads nothing. */
  get?: GetJson
  /** Work out the prompt and what it would cost, but call nothing and write nothing. */
  dryRun?: boolean
}

export interface TickResult {
  /** Whether any file in the world changed. */
  changed: boolean
  /** A few words for the commit message and the job summary. */
  summary: string
  /** Files written or deleted, relative to the world root. */
  written: string[]
  /** Why things did or didn't happen: skipped calls, rejected plans. */
  notes: string[]
  calls: BudgetCall[]
  /** Eye-cam shots waiting to be rendered and captioned (the `photos` step). */
  photos: number
  /** The id of the build this tick asked for (`mind/builds/<id>.json`), for the workflow that runs the builder. */
  build: string | null
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
  /** What happened this tick, for the day's memory stream. Written by code from sim events, no model. */
  remember: NewEntry[]
  steps: TimelineEntry[]
  buildRequests: BuildRequest[]

  sleepOpts: { seed: number; timezone: string; lateNight: World['forkling']['lateNight'] }
  asleep: boolean
  window: ReturnType<typeof sleepWindow>
  budget: ReturnType<typeof rollLedger>

  temperament: World['temperament']
  /** Set when the temperament was rolled this tick and has to be written. */
  rolled: boolean

  world: ReturnType<typeof worldWithObjects>
  body: ReturnType<typeof startPlayback>['state']
  events: VisitorEvent[]

  objects: WorldObject[]
  /** The ids of `objects` once the finishing step is applied. Not refreshed after that. */
  objectIds: Set<string>
  holding: World['forkling']['holding']
  stored: Stored
  skills: World['skills']
  interests: World['interests']
  /** Set when a read or study step finishes: the visit to the shelf comes after the step is applied. */
  pendingReading: { depth: number; topic: string | null } | null
  /** Set when a creative step finishes: what it made is written after the step is applied. */
  pendingArt: { kind: ArtifactKind; verb: string; step: PlanStep; index: number } | null
  /** Set when a photograph step finishes: the shot is queued after the step is applied. */
  pendingPhoto: { step: PlanStep; index: number } | null
  /** Set when a code step finishes: the brief for the builder is written after the step is applied. */
  pendingCode: { step: PlanStep; index: number } | null
  touched: Set<string>
  gone: Set<string>
  appraisals: AppraisalEvent[]
  justNow: string[]
  feelings: Feelings
  spotKeys: Set<string>

  goals: Goals
  mind: MindState
  mood: World['forkling']['mood']
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
  readings: NonNullable<MindState['readings']>
  madeArt: Artifact[]
  arts: NonNullable<MindState['arts']>

  decision: Decision | null
  thought: boolean
  planPage: boolean
  journal: { date: string; text: string } | null
  summaryNext: string | null
}
