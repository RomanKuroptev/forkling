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
  TickCall,
  TimelineEntry,
  VisitorEvent,
  WorldObject,
} from '@forkling/schema'
import type { MoodEvent, Trigger, sleepWindow, startPlayback, worldWithObjects } from '@forkling/sim'
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
  /** Reads a public URL as JSON, for the feeds and Wikipedia. Without it the forkling reads nothing. */
  get?: GetJson
  /** Work out the prompt and what it would cost, but call nothing and write nothing. */
  dryRun?: boolean
  /** The engine ref that runs this tick, written into the tick log so a replay can use the same sim. */
  engine?: string
}

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

  world: ReturnType<typeof worldWithObjects>
  body: ReturnType<typeof startPlayback>['state']
  events: VisitorEvent[]

  objects: WorldObject[]
  /** The ids of `objects` once the finishing step is applied. Not refreshed after that. */
  objectIds: Set<string>
  interests: World['interests']
  /** Set when a write step finishes: the words are written after the step is applied. */
  pendingNote: { step: PlanStep; index: number } | null
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
  readings: NonNullable<MindState['readings']>
  arts: NonNullable<MindState['arts']>

  decision: Decision | null
  thought: boolean
  planPage: boolean
  journal: { date: string; text: string } | null
  summaryNext: string | null
}
