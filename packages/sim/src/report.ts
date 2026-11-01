import type { MicroBehavior, SpeciesPack } from '@forkling/schema'
import { createForkling, setFocus, STEP, stepForkling, type Focus, type StepContext } from './forkling.ts'
import { nearestWalkable } from './nav.ts'
import type { Needs } from './needs.ts'
import { hourInZone } from './playback.ts'
import { sunDirection } from './sky.ts'
import { isAsleepAt } from './sleep.ts'
import { starterWorld, type StarterWorld } from './starter.ts'
import { STRONG_NEED } from './surprise.ts'
import { collectSpots } from './world.ts'

/** One step of the scripted plan the report plays, back to back, while the forkling is awake. */
export interface ReportStep {
  verb: string
  targetId?: string
  minutes: number
}

export interface ReportOptions {
  pack: SpeciesPack
  behaviors?: MicroBehavior[]
  seed: number
  days: number
  /** IANA time zone for the sleep schedule. Defaults to UTC. */
  timezone?: string
  /** The local date the run starts on, at midnight. */
  startDate?: string
  world?: StarterWorld
  /** The plan, in a loop. With none, the body is never given a focus. */
  steps: readonly ReportStep[]
  quirkWeights?: Record<string, number>
  needs?: Needs
}

export interface NeedReport {
  min: number
  /** Average over the whole run. */
  mean: number
  /** Minutes under the strong-need line while awake, and the longest unbroken stretch of them. */
  awakeCriticalMinutes: number
  longestAwakeCriticalMinutes: number
  /** Minutes under the line while in bed, where it can do nothing about it. */
  asleepCriticalMinutes: number
  /** How long a full need lasts, from the pack's decay rate. Null for a need that does not decay. */
  hoursToEmpty: number | null
}

export interface SimReport {
  days: number
  seed: number
  awakeHours: number
  /** Seconds spent on each verb, over the whole run. */
  timePerVerb: Record<string, number>
  /** The plan window: while awake with a step running. */
  focus: {
    seconds: number
    /** Seconds in that window spent on the planned verb itself. */
    onPlanSeconds: number
    share: number
    /** Times the body began something other than the planned verb while a step was running, and why. */
    interruptions: number
    interruptionsByCause: { critical: number; other: number }
    interruptedByVerb: Record<string, number>
  }
  /** The bed hours by the sleep schedule: how long, how much of it spent on the pack's sleeping verb, and the rest by verb. */
  asleep: { seconds: number; onSleepSeconds: number; otherByVerb: Record<string, number> }
  needs: Record<string, NeedReport>
  intentions: number
}

const DAY_SECONDS = 86_400

/**
 * Plays the body for days against a world and a scripted plan, with the sleep schedule and no visitors, and measures it:
 * time per verb, how much of the plan the body really did and what broke it off, and how long each need ran critical.
 * Pure and deterministic for a seed. This is what turns "I estimate" into a number.
 */
export function simReport(opts: ReportOptions): SimReport {
  const { pack, behaviors = [], seed, days, steps } = opts
  const timezone = opts.timezone ?? 'UTC'
  const world = opts.world ?? starterWorld()
  const startSec = Date.parse(`${opts.startDate ?? '2026-11-03'}T00:00:00Z`) / 1000
  const start = nearestWalkable(world.nav.grid, { x: world.spawn.x, z: world.spawn.z }, 25) ?? { x: world.spawn.x, z: world.spawn.z }
  const body = createForkling(pack, behaviors, seed, start, {
    time: startSec,
    ...(opts.needs ? { needs: opts.needs } : {}),
    ...(opts.quirkWeights ? { quirkWeights: opts.quirkWeights } : {}),
  })
  const sleepOpts = { seed, timezone }
  const ctx: StepContext = { grid: world.nav.grid, visitor: null, timeOfDay: 0, asleep: false, spots: {} }

  const needIds = Object.keys(pack.needs)
  const sums: Record<string, number> = {}
  const mins: Record<string, number> = {}
  const awakeCritical: Record<string, number> = {}
  const longest: Record<string, number> = {}
  const run: Record<string, number> = {}
  const asleepCritical: Record<string, number> = {}
  for (const id of needIds) {
    sums[id] = 0
    mins[id] = 100
    awakeCritical[id] = 0
    longest[id] = 0
    run[id] = 0
    asleepCritical[id] = 0
  }

  const timePerVerb: Record<string, number> = {}
  const interruptedByVerb: Record<string, number> = {}
  const asleepStats = { seconds: 0, onSleepSeconds: 0, otherByVerb: {} as Record<string, number> }
  const focusStats = { seconds: 0, onPlanSeconds: 0, interruptions: 0, critical: 0, other: 0 }
  let intentions = 0
  let awakeSeconds = 0
  let nextStep = 0
  let focus: Focus | null = null
  let lastMinute = -1
  let lastIntention = body.intention.startedAt
  const total = Math.round((days * DAY_SECONDS) / STEP)

  for (let i = 0; i < total; i++) {
    const nowSec = startSec + (i + 1) * STEP
    const minute = Math.floor(nowSec / 60)
    let asleep = ctx.asleep ?? false
    if (minute !== lastMinute) {
      lastMinute = minute
      ctx.timeOfDay = hourInZone(timezone, minute * 60_000)
      asleep = isAsleepAt(minute * 60_000, sleepOpts)
      ctx.asleep = asleep
      ctx.spots = collectSpots(pack, world.cfg, world.nav, world.spawn, sunDirection(ctx.timeOfDay), world.objects)
    }

    // The scripted mind: when awake with no step running, the next step starts at once, as the real mind's does.
    if (!asleep && steps.length > 0 && !(focus && body.time < focus.until)) {
      const step = steps[nextStep++ % steps.length]!
      focus = { action: step.verb, ...(step.targetId ? { targetId: step.targetId } : {}), until: body.time + step.minutes * 60 }
      setFocus(body, focus, ctx)
    }

    // Step the body one tick, then account for what it is doing now.
    stepForkling(body, STEP, ctx)

    const focusActive = !asleep && !!focus && body.time < focus.until
    if (body.intention.startedAt !== lastIntention) {
      lastIntention = body.intention.startedAt
      intentions++
      if (focusActive && body.intention.type !== focus!.action) {
        focusStats.interruptions++
        interruptedByVerb[body.intention.type] = (interruptedByVerb[body.intention.type] ?? 0) + 1
        if (Object.values(body.needs).some((v) => v !== undefined && v < STRONG_NEED)) focusStats.critical++
        else focusStats.other++
      }
    }

    timePerVerb[body.intention.type] = (timePerVerb[body.intention.type] ?? 0) + STEP
    if (focusActive) {
      focusStats.seconds += STEP
      if (body.intention.type === focus!.action) focusStats.onPlanSeconds += STEP
    }
    if (!asleep) awakeSeconds += STEP
    else {
      asleepStats.seconds += STEP
      // The verb whose animation slot is sleep is the pack's sleeping verb; the engine does not name it.
      if (body.action.slot === 'sleep') asleepStats.onSleepSeconds += STEP
      else asleepStats.otherByVerb[body.intention.type] = (asleepStats.otherByVerb[body.intention.type] ?? 0) + STEP
    }

    for (const id of needIds) {
      const value = (body.needs as Record<string, number | undefined>)[id] ?? 0
      sums[id]! += value
      if (value < mins[id]!) mins[id] = value
      if (value < STRONG_NEED) {
        if (asleep) {
          asleepCritical[id]! += STEP
          run[id] = 0
        } else {
          awakeCritical[id]! += STEP
          run[id]! += STEP
          if (run[id]! > longest[id]!) longest[id] = run[id]!
        }
      } else {
        run[id] = 0
      }
    }
  }

  const needs: Record<string, NeedReport> = {}
  for (const id of needIds) {
    const decay = pack.needs[id as keyof typeof pack.needs]?.decayPerHour ?? 0
    needs[id] = {
      min: round(mins[id]!, 1),
      mean: round(sums[id]! / total, 1),
      awakeCriticalMinutes: round(awakeCritical[id]! / 60, 1),
      longestAwakeCriticalMinutes: round(longest[id]! / 60, 1),
      asleepCriticalMinutes: round(asleepCritical[id]! / 60, 1),
      hoursToEmpty: decay > 0 ? 100 / decay : null,
    }
  }
  return {
    days,
    seed,
    awakeHours: round(awakeSeconds / 3600, 2),
    timePerVerb: Object.fromEntries(Object.entries(timePerVerb).map(([v, s]) => [v, round(s, 1)])),
    focus: {
      seconds: round(focusStats.seconds, 1),
      onPlanSeconds: round(focusStats.onPlanSeconds, 1),
      share: focusStats.seconds > 0 ? focusStats.onPlanSeconds / focusStats.seconds : 0,
      interruptions: focusStats.interruptions,
      interruptionsByCause: { critical: focusStats.critical, other: focusStats.other },
      interruptedByVerb,
    },
    asleep: {
      seconds: round(asleepStats.seconds, 1),
      onSleepSeconds: round(asleepStats.onSleepSeconds, 1),
      otherByVerb: Object.fromEntries(Object.entries(asleepStats.otherByVerb).map(([v, s]) => [v, round(s, 1)])),
    },
    needs,
    intentions,
  }
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places
