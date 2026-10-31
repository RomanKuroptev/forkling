import { Forkling, type BudgetCall, type Goals, type Intention, type MicroBehavior, type MindState, type PlanStep, type SpeciesPack } from '@forkling/schema'
import {
  collectSpots,
  EPOCH_SECONDS,
  hourInZone,
  isAsleepAt,
  localDate,
  scoreSurprise,
  sleepWindow,
  startPlayback,
  sunDirection,
  toRepoIntention,
  validatePlan,
  worldWithObjects,
  type Trigger,
} from '@forkling/sim'
import { canSpend, costUsd, estimateCallUsd, estimateTokens, MAX_PROMPT_TOKENS, monthOf, recordCall, rollLedger, type ModelId } from './budget.ts'
import { clampText, planStepFrom, type Decision } from './decision.ts'
import type { LlmClient } from './llm.ts'
import { buildSystem, buildUser, type ThinkKind } from './prompts.ts'
import { deleteFile, readWorld, writeJson } from './world.ts'

export interface TickDeps {
  now: Date
  /** Null when there is no API key: the tick still runs, it just never thinks. */
  llm: LlmClient | null
  pack: SpeciesPack
  behaviors: MicroBehavior[]
  /** The species `persona.md`. */
  speciesPersona: string
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
  /** The prompt of the call this tick would make or made, for dry runs and logs. */
  prompt?: { model: ModelId; kind: ThinkKind; system: string; user: string; tokens: number; maxUsd: number }
}

/** Strong needs wake the model at most this often. */
const NEED_COOLDOWN_MS = 30 * 60_000
const MAX_OUTPUT_TOKENS = 3000
const MAX_RECENT = 20
/** A late night is only a choice for the evening. */
const LATE_NIGHT_FROM_HOUR = 18

const pad = (n: number) => String(n).padStart(2, '0')
const clock = (tz: string, ms: number) => {
  const h = hourInZone(tz, ms)
  return `${pad(Math.floor(h))}:${pad(Math.floor((h % 1) * 60))}`
}
const weekday = (tz: string, ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long' }).format(new Date(ms))
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places
const epochOf = (ms: number) => Math.floor(ms / 1000 / EPOCH_SECONDS)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** A seed for an intention the mind starts, fixed by the forkling and the second it starts. */
function intentionSeed(seed: number, ms: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.floor(ms / 1000)) >>> 0
}

function thinkKindFor(triggers: readonly Trigger[]): ThinkKind {
  if (triggers.some((t) => t.kind === 'newDay')) return 'morning'
  if (triggers.some((t) => t.kind === 'weekly')) return 'weekly'
  return 'decide'
}

/**
 * One tick of a forkling's mind: replay the body to now, see whether anything is surprising, think only if so, check
 * the answer, and write the new state. Pure with respect to everything but the world directory and the injected model.
 */
export async function runTick(dir: string, deps: TickDeps): Promise<TickResult> {
  const { pack, behaviors } = deps
  const nowMs = deps.now.getTime()
  const nowIso = deps.now.toISOString()
  const w = readWorld(dir, (f) => monthOf(f.timezone, nowMs))
  const { forkling, objects } = w
  const tz = forkling.timezone
  const today = localDate(tz, nowMs)
  const notes: string[] = []
  const parts: string[] = []
  const calls: BudgetCall[] = []

  const sleepOpts = { seed: forkling.seed, timezone: tz, lateNight: forkling.lateNight }
  const asleep = isAsleepAt(nowMs, sleepOpts)
  const window = sleepWindow(today, forkling.seed, tz, forkling.lateNight === today)
  let budget = rollLedger(w.budget, monthOf(tz, nowMs))

  // Where the body is now: exactly what a viewer would have seen since the last commit.
  const world = worldWithObjects(objects)
  const playback = startPlayback(
    { forkling, pack, behaviors, world, goals: w.goals, stateTime: Date.parse(forkling.lastTickAt) / 1000 },
    nowMs,
  )
  const body = playback.state
  const spots = collectSpots(pack, world.cfg, world.nav, world.spawn, sunDirection(hourInZone(tz, nowMs)), world.objects)
  const spotKeys = new Set(Object.keys(spots).filter((k) => (spots[k]?.length ?? 0) > 0))
  const objectIds = new Set(objects.map((o) => o.id))
  const events = w.inbox.flatMap((item) => (item.event ? [item.event] : []))

  let goals: Goals = structuredClone(w.goals)
  let mind: MindState = structuredClone(w.mindState)
  let mood = forkling.mood
  let lateNight = forkling.lateNight
  let started: Intention | null = null

  let triggers = scoreSurprise({ forkling: { ...forkling, needs: body.needs }, goals, mindState: mind, objects, events, nowMs, asleep, spotKinds: spotKeys })
  if (mind.lastThinkAt && nowMs - Date.parse(mind.lastThinkAt) < NEED_COOLDOWN_MS) triggers = triggers.filter((t) => t.kind !== 'need')

  /** Begins step `index` of today's plan: a focus window for the body, and an intention that says why. */
  const startStep = (index: number, reason?: string) => {
    const step = goals.today?.steps[index]
    if (!step) return
    goals.now = { index, startedAt: nowIso, until: new Date(nowMs + step.minutes * 60_000).toISOString() }
    started = {
      type: step.verb,
      ...(step.targetId ? { targetId: step.targetId } : {}),
      startedAt: nowIso,
      seed: intentionSeed(forkling.seed, nowMs),
      reason: clampText(reason?.trim() || step.reason, 200),
      goalRef: `today:${index}`,
    }
    mind.recent = [...mind.recent, { verb: step.verb, ...(step.targetId ? { targetId: step.targetId } : {}), at: nowIso }].slice(-MAX_RECENT)
    parts.push(`step ${index + 1}/${goals.today!.steps.length}: ${step.verb}`)
  }

  // Following its own plan is routine: no need to think when one step ends and another waits.
  const onlyStepDone = triggers.length === 1 && triggers[0]!.kind === 'stepDone'
  const nextIndex = goals.now ? goals.now.index + 1 : 0
  const moreSteps = goals.today ? nextIndex < goals.today.steps.length : false
  let thinkKind: ThinkKind | null = null
  if (onlyStepDone && moreSteps) {
    startStep(nextIndex)
  } else if (triggers.length > 0) {
    thinkKind = thinkKindFor(triggers)
  } else {
    notes.push(asleep ? 'asleep: no thinking' : 'no trigger, no call')
  }

  let prompt: TickResult['prompt']
  let decision: Decision | null = null
  let thought = false
  if (thinkKind) {
    const model: ModelId = thinkKind === 'weekly' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5'
    const system = buildSystem({ pack, name: forkling.name, speciesPersona: deps.speciesPersona, persona: w.persona })
    const user = buildUser({
      kind: thinkKind,
      forkling,
      goals,
      mindState: mind,
      objects,
      spotKinds: [...spotKeys].filter((k) => !objectIds.has(k)),
      triggers,
      events,
      localTime: `${weekday(tz, nowMs)} ${today} ${clock(tz, nowMs)}`,
      wakeTime: clock(tz, window.wakeMs),
      bedTime: clock(tz, window.bedMs),
      hoursLeft: Math.max(0, Math.round((window.bedMs - nowMs) / 3_600_000)),
      body: { x: body.pos.x, z: body.pos.z, needs: body.needs as Record<string, number> },
    })
    const tokens = estimateTokens(system) + estimateTokens(user)
    const maxUsd = estimateCallUsd(model, tokens, MAX_OUTPUT_TOKENS)
    prompt = { model, kind: thinkKind, system, user, tokens, maxUsd }

    if (tokens > MAX_PROMPT_TOKENS) {
      notes.push(`prompt too long (about ${tokens} tokens): no call`)
    } else if (deps.dryRun) {
      notes.push(`dry run: ${thinkKind} call to ${model}, about ${tokens} tokens, at most $${maxUsd.toFixed(4)}`)
    } else if (!deps.llm) {
      notes.push('no API key: no call')
    } else if (!canSpend(budget, maxUsd)) {
      notes.push(`monthly budget reached ($${budget.spentUsd.toFixed(2)} of $${budget.capUsd}): no call`)
    } else {
      try {
        const result = await deps.llm.complete({ model, system, user, maxTokens: MAX_OUTPUT_TOKENS, effort: model === 'claude-sonnet-5-5' ? 'medium' : 'low' })
        const call: BudgetCall = { at: nowIso, kind: thinkKind, model, ...result.usage, usd: costUsd(model, result.usage) }
        calls.push(call)
        budget = recordCall(budget, call)
        mind.lastThinkAt = nowIso
        if (result.decision) {
          decision = result.decision
          thought = true
        } else {
          notes.push(`no usable answer (stopped: ${result.stopReason ?? 'unknown'})`)
        }
      } catch (e) {
        notes.push(`call failed: ${(e as Error).message}`)
      }
    }
  }

  if (decision) {
    parts.push(thinkKind === 'morning' ? 'morning plan' : thinkKind === 'weekly' ? 'weekly review' : `thought about ${triggers[0]!.kind}`)

    if (decision.dropLongGoal && goals.long) {
      delete goals.long
      parts.push('gave up the long goal')
    }
    const newGoal = decision.longGoal && decision.longGoal.text.trim() ? decision.longGoal : null
    if (newGoal) {
      const text = clampText(newGoal.text.trim(), 300)
      goals.long = {
        text,
        reason: clampText(newGoal.reason.trim() || 'It is what I want now.', 200),
        setAt: goals.long?.text === text ? goals.long.setAt : nowIso,
        reviewedAt: nowIso,
      }
      if (w.goals.long?.text !== text) parts.push('new long goal')
    } else if (thinkKind === 'weekly' && goals.long) {
      goals.long = { ...goals.long, reviewedAt: nowIso }
    }

    if (decision.mood.trim()) mood = clampText(decision.mood.trim(), 40)

    if (decision.stayUpLate?.trim() && !asleep && hourInZone(tz, nowMs) >= LATE_NIGHT_FROM_HOUR) {
      lateNight = today
      mind.lateNightReason = clampText(decision.stayUpLate.trim(), 200)
      parts.push('staying up late')
    }

    if (thinkKind === 'morning') mind.lastPlanDate = today
    mind.knownObjects = [...new Set([...mind.knownObjects, ...objects.map((o) => o.id)])]
    mind.seenEventTypes = [...new Set([...mind.seenEventTypes, ...events.map((e) => e.type)])]

    if (decision.plan && decision.plan.length > 0) {
      const steps = decision.plan.map(planStepFrom)
      const usable = steps.filter((s): s is PlanStep => s !== null)
      const check =
        usable.length !== steps.length
          ? ({ ok: false, reasons: ['a step was missing its verb or its reason'] } as const)
          : validatePlan(usable, {
              pack,
              spotKinds: new Set([...spotKeys].filter((k) => !objectIds.has(k))),
              objects,
              startMs: nowMs,
              asleepAt: (ms) => isAsleepAt(ms, sleepOpts),
              hourAt: (ms) => hourInZone(tz, ms),
              recent: mind.recent,
            })
      if (check.ok) {
        goals.today = { date: today, steps: usable, reason: clampText((decision.planReason ?? decision.thought).trim() || 'This is what I feel like doing.', 200) }
        startStep(0, decision.thought)
        if (thinkKind !== 'morning') parts.push('new plan')
      } else {
        mind.rejections = [...mind.rejections, { at: nowIso, reasons: check.reasons.slice(0, 8) }].slice(-10)
        notes.push(`plan rejected: ${check.reasons.join('; ')}`)
        parts.push('plan rejected')
        // The body falls back to its own judgement: no focus, and no stale plan from another day.
        delete goals.now
        if (goals.today && goals.today.date !== today) delete goals.today
      }
    } else if (goals.now && nowMs >= Date.parse(goals.now.until)) {
      // Nothing new was planned and the step has run out: carry on with the plan, or leave the body free.
      if (moreSteps) startStep(nextIndex)
      else delete goals.now
    }
  }

  // Wake, bedtime and the body: written when something happened, or once per half hour so the repo stays fresh.
  if (asleep !== forkling.asleep) parts.push(asleep ? 'went to bed' : 'woke up')
  const inboxConsumed = thought && w.inbox.length > 0
  const goalsChanged = !same(goals, w.goals)
  const mindChanged = !same(mind, w.mindState)
  const budgetChanged = !same(budget, w.budget)
  const writeBody =
    started !== null ||
    goalsChanged ||
    mindChanged ||
    inboxConsumed ||
    asleep !== forkling.asleep ||
    mood !== forkling.mood ||
    lateNight !== forkling.lateNight ||
    epochOf(nowMs) !== epochOf(Date.parse(forkling.lastTickAt))

  const written: string[] = []
  if (!deps.dryRun) {
    if (writeBody) {
      const active = goals.now && goals.today?.steps[goals.now.index]
      const bodyIntention = toRepoIntention(body.intention)
      const inPack = pack.actions.some((a) => a.id === bodyIntention.type)
      // A step the mind is focused on keeps its own reason and link; anything else the body chose keeps the pack's.
      const onStep = active && inPack && bodyIntention.type === active.verb && nowMs < Date.parse(goals.now!.until)
      const intention: Intention =
        started ??
        (onStep
          ? { ...bodyIntention, reason: active.reason, goalRef: `today:${goals.now!.index}` }
          : inPack
            ? bodyIntention
            : forkling.intention)
      const next = Forkling.parse({
        ...forkling,
        needs: Object.fromEntries(Object.entries(body.needs).map(([id, v]) => [id, round(v, 1)])),
        position: [round(body.pos.x, 2), 0, round(body.pos.z, 2)],
        mood,
        intention,
        asleep,
        ...(lateNight ? { lateNight } : {}),
        lastTickAt: nowIso,
      })
      if (writeJson(dir, 'forkling.json', next)) written.push('forkling.json')
    }
    if (goalsChanged && writeJson(dir, 'mind/goals.json', goals)) written.push('mind/goals.json')
    if (mindChanged && writeJson(dir, 'mind/state.json', mind)) written.push('mind/state.json')
    if (budgetChanged && writeJson(dir, 'brain/budget.json', budget)) written.push('brain/budget.json')
    if (inboxConsumed) {
      for (const item of w.inbox) {
        deleteFile(dir, item.path)
        written.push(item.path)
      }
    }
  }

  const summary = parts.length > 0 ? parts.join(', ') : written.length > 0 ? 'sync' : ''
  return { changed: written.length > 0, summary, written, notes, calls, ...(prompt ? { prompt } : {}) }
}
