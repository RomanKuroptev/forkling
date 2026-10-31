import type { z } from 'zod'
import {
  Forkling,
  MemorySlots,
  type TimelineEntry,
  Reflection,
  type BudgetCall,
  type Goals,
  type Intention,
  type MicroBehavior,
  type MindState,
  type PlanStep,
  type SpeciesPack,
  type TemperamentPools,
  type WorldObject,
} from '@forkling/schema'
import {
  addXp,
  appraise,
  applyBeliefOps,
  applyStep,
  checkReflection,
  collectSpots,
  decayFeelings,
  EPOCH_SECONDS,
  eveningOf,
  eventsFromStep,
  hourInZone,
  isAsleepAt,
  liveBeliefs,
  localDate,
  moodLabel,
  quirkWeights,
  rollTemperament,
  scoreSurprise,
  skillLevel,
  sleepWindow,
  startPlayback,
  sunDirection,
  toRepoIntention,
  validatePlan,
  worldWithObjects,
  type AppraisalEvent,
  type Feelings,
  type StepEvent,
  type Stored,
  type Trigger,
} from '@forkling/sim'
import { canSpend, costUsd, estimateCallUsd, estimateTokens, MAX_PROMPT_TOKENS, monthOf, recordCall, rollLedger, type ModelId } from './budget.ts'
import { clampText, Decision, planStepFrom, type LlmStep } from './decision.ts'
import type { CallKind, LlmClient, LlmResult } from './llm.ts'
import { buildSystem, buildUser, type ThinkKind } from './prompts.ts'
import { buildMemoryUser, buildReflectionUser, renderJournal, renderSummary } from './reflect.ts'
import { appendStream, appendTimeline, prune, readStream, type NewEntry } from './stream.ts'
import { deleteFile, readText, readWorld, writeJson, writeText } from './world.ts'

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
  prompt?: { model: ModelId; kind: CallKind; system: string; user: string; tokens: number; maxUsd: number }
}

/** Strong needs wake the model at most this often. */
const NEED_COOLDOWN_MS = 30 * 60_000
const MAX_OUTPUT_TOKENS = 3000
/** The diary and the belief changes take more room than a plan. */
const REFLECT_OUTPUT_TOKENS = 4000
const MEMORY_OUTPUT_TOKENS = 3000
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

function thinkKindFor(triggers: readonly Trigger[]): ThinkKind | 'bedtime' {
  if (triggers.some((t) => t.kind === 'newDay')) return 'morning'
  if (triggers.some((t) => t.kind === 'bedtime')) return 'bedtime'
  if (triggers.some((t) => t.kind === 'weekly')) return 'weekly'
  return 'decide'
}

const PAST: Record<StepEvent['kind'], string> = {
  gathered: 'gathered',
  pickedUp: 'picked up',
  stored: 'put away',
  placed: 'put down',
  dropped: 'dropped',
  opened: 'opened',
  closed: 'closed',
  started: 'started',
  worked: 'worked on',
  finished: 'finished',
  painted: 'painted',
  planted: 'planted',
  watered: 'watered',
  harvested: 'harvested',
  cooked: 'cooked',
  ate: 'ate',
  ateSpoiled: 'ate (it had gone off)',
}

/** What a step did, in a line the model can read. Names come from the objects, which may hold the forkling's own words. */
function describeEvent(event: StepEvent, objects: readonly WorldObject[]): string {
  const name = event.objectId ? (objects.find((o) => o.id === event.objectId)?.name ?? event.objectId) : ''
  return [PAST[event.kind], event.material && event.kind !== 'planted' ? `${event.material} from` : '', name].filter(Boolean).join(' ')
}

function describeFeelings({ valence, arousal }: Feelings): string {
  const how = valence > 0.15 ? 'feeling good' : valence < -0.15 ? 'feeling bad' : 'feeling neutral'
  const energy = arousal > 0.55 ? 'wound up' : arousal < 0.2 ? 'drowsy' : 'calm'
  return `${how}, ${energy}`
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
  const { forkling } = w
  const tz = forkling.timezone
  const today = localDate(tz, nowMs)
  const notes: string[] = []
  const parts: string[] = []
  const calls: BudgetCall[] = []
  /** What happened this tick, for the day's memory stream. Written by code from sim events, no model. */
  const remember: NewEntry[] = []
  const steps: TimelineEntry[] = []

  const sleepOpts = { seed: forkling.seed, timezone: tz, lateNight: forkling.lateNight }
  const asleep = isAsleepAt(nowMs, sleepOpts)
  const window = sleepWindow(today, forkling.seed, tz, forkling.lateNight === today)
  let budget = rollLedger(w.budget, monthOf(tz, nowMs))
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
    { forkling, pack, behaviors, world, goals: w.goals, stateTime: Date.parse(forkling.lastTickAt) / 1000, quirkWeights: weights },
    nowMs,
  )
  const body = playback.state
  const spotsFor = (objects: readonly WorldObject[]) => {
    const w2 = worldWithObjects(objects)
    const spots = collectSpots(pack, w2.cfg, w2.nav, w2.spawn, sunDirection(hourInZone(tz, nowMs)), w2.objects)
    return new Set(Object.keys(spots).filter((k) => (spots[k]?.length ?? 0) > 0))
  }
  const events = w.inbox.flatMap((item) => (item.event ? [item.event] : []))

  // What it has and what is around it. A finished step can change all of this.
  let objects: WorldObject[] = [...w.objects]
  let holding = forkling.holding
  let stored: Stored = { ...forkling.stored }
  let skills = w.skills
  const touched = new Set<string>()
  const gone = new Set<string>()
  const appraisals: AppraisalEvent[] = []
  const justNow: string[] = []
  let feelings = decayFeelings(forkling.feelings, Math.max(0, (nowMs - Date.parse(forkling.lastTickAt)) / 3_600_000))
  let spotKeys = spotsFor(objects)

  let goals: Goals = structuredClone(w.goals)
  let mind: MindState = structuredClone(w.mindState)
  let mood = forkling.mood
  let lateNight = forkling.lateNight
  let started: Intention | null = null

  let triggers = scoreSurprise({ forkling: { ...forkling, needs: body.needs }, goals, mindState: mind, objects, events, nowMs, asleep, spotKinds: spotKeys })
  if (mind.lastThinkAt && nowMs - Date.parse(mind.lastThinkAt) < NEED_COOLDOWN_MS) triggers = triggers.filter((t) => t.kind !== 'need')

  // A step's effect lands once, when its time is up: what it gathered, made or ate becomes true here.
  let failed = false
  const finishing = goals.now ? goals.today?.steps[goals.now.index] : undefined
  if (finishing && goals.now && triggers.some((t) => t.kind === 'stepDone') && mind.appliedStepAt !== goals.now.startedAt && !asleep) {
    mind.appliedStepAt = goals.now.startedAt
    const verb = pack.actions.find((a) => a.id === finishing.verb)
    if (verb) {
      const before = objects
      const result = applyStep({ holding, stored, position: { x: body.pos.x, z: body.pos.z }, objects }, finishing, verb, {
        nowMs,
        skill: skillLevel(skills, verb.group),
        seed: intentionSeed(forkling.seed, nowMs),
      })
      if (result.ok) {
        holding = result.world.holding
        stored = result.world.stored
        objects = [...result.world.objects]
        skills = addXp(skills, result.group, result.xp)
        for (const id of result.upserted) {
          touched.add(id)
          gone.delete(id)
        }
        for (const id of result.removed) {
          gone.add(id)
          touched.delete(id)
        }
        // Things it made itself are not news to it.
        mind.knownObjects = [...new Set([...mind.knownObjects, ...result.upserted])]
        appraisals.push(...eventsFromStep(result.events, [...before, ...objects]))
        justNow.push(...result.events.map((e) => describeEvent(e, [...before, ...objects])))
        for (const e of result.events) {
          remember.push({
            at: nowIso,
            kind: e.kind === 'finished' ? 'made' : 'step',
            text: `${finishing.verb}: ${describeEvent(e, [...before, ...objects])}`,
            verb: finishing.verb,
            ...(e.objectId ? { objectId: e.objectId } : {}),
          })
        }
        if (result.events.length > 0) parts.push(`${finishing.verb}: ${result.events.map((e) => PAST[e.kind]).join(', ')}`)
        spotKeys = spotsFor(objects)
      } else {
        failed = true
        notes.push(`step ${goals.now.index + 1} (${finishing.verb}) could not happen: ${result.reason}`)
        justNow.push(`${finishing.verb} did not work out: ${result.reason}`)
        remember.push({ at: nowIso, kind: 'event', text: `${finishing.verb} did not work out: ${result.reason}`, verb: finishing.verb })
        appraisals.push({ kind: 'blocked' })
        triggers = [...triggers, { kind: 'blocked', score: 0.9, detail: `${finishing.verb} did not work out: ${result.reason}` }]
      }
    }
  }
  const objectIds = new Set(objects.map((o) => o.id))

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
    const goalRef = `today:${index}`
    const heldBeliefs = step.because && step.because.length > 0 ? { beliefRefs: step.because } : {}
    const targetName = step.targetId ? (objects.find((o) => o.id === step.targetId)?.name ?? step.targetId) : ''
    remember.push({
      at: nowIso,
      kind: 'step',
      text: `Started ${step.verb}${targetName ? ` (${targetName})` : ''}: ${started.reason}`,
      verb: step.verb,
      ...(step.targetId && objectIds.has(step.targetId) ? { objectId: step.targetId } : {}),
      goalRef,
      ...heldBeliefs,
    })
    steps.push({ at: nowIso, verb: step.verb, ...(step.targetId ? { targetId: step.targetId } : {}), reason: started.reason, goalRef, ...heldBeliefs })
    parts.push(`step ${index + 1}/${goals.today!.steps.length}: ${step.verb}`)
  }

  // Following its own plan is routine: no need to think when one step ends and another waits.
  const onlyStepDone = triggers.length === 1 && triggers[0]!.kind === 'stepDone'
  const nextIndex = goals.now ? goals.now.index + 1 : 0
  const moreSteps = goals.today ? nextIndex < goals.today.steps.length : false
  let thinkKind: ThinkKind | 'bedtime' | null = null
  if (onlyStepDone && moreSteps) {
    startStep(nextIndex)
  } else if (triggers.length > 0) {
    thinkKind = thinkKindFor(triggers)
  } else {
    notes.push(asleep ? 'asleep: no thinking' : 'no trigger, no call')
  }

  let prompt: TickResult['prompt']
  let beliefs = w.beliefs
  const beliefIds = new Set(liveBeliefs(beliefs).map((b) => b.id))
  /** The plan as plan steps, and whether the body could really carry it out, played out from what it holds now. */
  const checkPlan = (plan: LlmStep[]) => {
    const steps = plan.map((s) => planStepFrom(s, beliefIds))
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
            holding,
            stored,
            position: { x: body.pos.x, z: body.pos.z },
            skills,
            seed: intentionSeed(forkling.seed, nowMs),
          })
    return { usable, check }
  }

  const system = buildSystem({ pack, name: forkling.name, speciesPersona: deps.speciesPersona, persona: w.persona })

  /** Every call to a model goes through here, so every one meets the same guards: prompt size, dry run, key, budget. */
  const ask = async <T>(kind: CallKind, model: ModelId, user: string, schema: z.ZodType<T>, maxTokens = MAX_OUTPUT_TOKENS): Promise<LlmResult<T> | null> => {
    const tokens = estimateTokens(system) + estimateTokens(user)
    const maxUsd = estimateCallUsd(model, tokens, maxTokens)
    prompt ??= { model, kind, system, user, tokens, maxUsd }
    if (tokens > MAX_PROMPT_TOKENS) {
      notes.push(`prompt too long (about ${tokens} tokens): no call`)
    } else if (deps.dryRun) {
      notes.push(`dry run: ${kind} call to ${model}, about ${tokens} tokens, at most $${maxUsd.toFixed(4)}`)
    } else if (!deps.llm) {
      notes.push('no credentials: no call')
    } else if (!canSpend(budget, maxUsd)) {
      notes.push(`monthly budget reached ($${budget.spentUsd.toFixed(2)} of $${budget.capUsd}): no call`)
    } else {
      try {
        const effort = model === 'claude-sonnet-5-5' ? 'medium' : 'low'
        const result = await deps.llm.complete({ kind, model, system, user, maxTokens, effort, schema })
        const call: BudgetCall = { at: nowIso, kind, model, ...result.usage, usd: costUsd(model, result.usage) }
        calls.push(call)
        budget = recordCall(budget, call)
        mind.lastThinkAt = nowIso
        return result
      } catch (e) {
        notes.push(`call failed: ${(e as Error).message}`)
      }
    }
    return null
  }

  let decision: Decision | null = null
  let thought = false
  if (thinkKind && thinkKind !== 'bedtime') {
    const model: ModelId = thinkKind === 'weekly' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5'
    const user = buildUser({
      kind: thinkKind,
      forkling,
      goals,
      mindState: mind,
      objects,
      spotKinds: [...spotKeys].filter((k) => !objectIds.has(k) && !k.startsWith('for:')),
      triggers,
      events,
      localTime: `${weekday(tz, nowMs)} ${today} ${clock(tz, nowMs)}`,
      wakeTime: clock(tz, window.wakeMs),
      bedTime: clock(tz, window.bedMs),
      hoursLeft: Math.max(0, Math.round((window.bedMs - nowMs) / 3_600_000)),
      body: { x: body.pos.x, z: body.pos.z, needs: body.needs as Record<string, number> },
      nowMs,
      holding,
      stored,
      skills,
      temperament,
      feelings: describeFeelings(feelings),
      justNow,
      beliefs,
      memory: w.summary,
    })
    let asking = user
    // A plan the body cannot carry out gets one more chance, with the reasons, before the body falls back on itself.
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await ask(thinkKind, model, asking, Decision)
      if (!result) break
      if (!result.parsed) {
        notes.push(`no usable answer (stopped: ${result.stopReason ?? 'unknown'})`)
        break
      }
      decision = result.parsed
      thought = true
      const checked = decision.plan && decision.plan.length > 0 ? checkPlan(decision.plan) : null
      if (!checked || checked.check.ok || attempt === 1) break
      notes.push(`plan turned down (${checked.check.reasons.join('; ')}): asking again`)
      asking = [
        user,
        '',
        '## Your plan was turned down',
        'It cannot be carried out as written:',
        ...checked.check.reasons.map((r) => `- ${r}`),
        'Write the whole plan again so that every step can happen.',
      ].join('\n')
    }
  }

  // Bedtime: the day goes into a diary entry and into what it believes. Only what the day's stream backs up is kept.
  const evening = eveningOf(tz, forkling.seed, nowMs)
  let journal: { date: string; text: string } | null = null
  if (thinkKind === 'bedtime') {
    const stream = readStream(dir, evening)
    if (stream.length === 0) {
      mind.lastReflectDate = evening
      notes.push('nothing to reflect on today: no call')
    } else {
      const ids = new Set(stream.map((e) => e.id))
      let turnedDown: string[] | undefined
      for (let attempt = 0; attempt < 2; attempt++) {
        const user = buildReflectionUser({
          name: forkling.name,
          date: evening,
          localTime: `${weekday(tz, nowMs)} ${today} ${clock(tz, nowMs)}`,
          timeZone: tz,
          goals,
          beliefs,
          summary: w.summary,
          stream,
          ...(turnedDown ? { turnedDown } : {}),
        })
        const result = await ask('bedtime', 'claude-sonnet-5-5', user, Reflection, REFLECT_OUTPUT_TOKENS)
        if (!result) break
        if (!result.parsed) {
          notes.push(`no usable reflection (stopped: ${result.stopReason ?? 'unknown'})`)
          break
        }
        const checked = checkReflection(result.parsed, ids, beliefs)
        if (checked.retry && attempt === 0) {
          notes.push(`reflection turned down (${checked.dropped.length} unsupported claims): asking again`)
          turnedDown = checked.dropped
          continue
        }
        notes.push(...checked.dropped.map((d) => `claim dropped, ${d}`))
        const text = renderJournal(evening, checked.reflection)
        const before = beliefs
        beliefs = applyBeliefOps(beliefs, checked.reflection.beliefOps, nowIso)
        if (text) {
          journal = { date: evening, text }
          parts.push('wrote the journal')
        }
        const changed = beliefs.filter((b) => !same(b, before.find((o) => o.id === b.id))).length
        if (changed > 0) parts.push(`${changed} belief${changed === 1 ? '' : 's'} changed`)
        mind.lastReflectDate = evening
        break
      }
    }
  }

  // Overnight the memory is rewritten on the Batch API, at half price: sent once after the diary, collected when ready.
  let summaryNext: string | null = null
  if (mind.memoryBatch) {
    if (!deps.dryRun && deps.llm) {
      try {
        const outcome = await deps.llm.fetchBatch(mind.memoryBatch.id, MemorySlots)
        if (outcome.status === 'pending') {
          notes.push('the memory rewrite is still running')
        } else {
          mind.memoryBatch = null
          if (outcome.status === 'failed') {
            notes.push(`the memory rewrite ${outcome.reason}: keeping the old memory`)
          } else {
            const call: BudgetCall = { at: nowIso, kind: 'memory', model: 'claude-haiku-5-5', ...outcome.usage, usd: costUsd('claude-haiku-5-5', outcome.usage, { batch: true }) }
            calls.push(call)
            budget = recordCall(budget, call)
            const slots = MemorySlots.safeParse(outcome.parsed)
            summaryNext = slots.success ? renderSummary(slots.data) : null
            if (summaryNext) parts.push('rewrote its memory')
            else notes.push('the memory rewrite had nothing usable: keeping the old memory')
          }
        }
      } catch (e) {
        notes.push(`could not check the memory rewrite: ${(e as Error).message}`)
      }
    }
  } else if (asleep && mind.lastReflectDate === evening && mind.lastMemoryDate !== evening) {
    const diary = journal?.text ?? readText(dir, `journal/${evening}.md`)
    const user = buildMemoryUser({ date: evening, summary: w.summary, journal: diary, beliefs })
    const tokens = estimateTokens(system) + estimateTokens(user)
    const maxUsd = estimateCallUsd('claude-haiku-5-5', tokens, MEMORY_OUTPUT_TOKENS) / 2
    prompt ??= { model: 'claude-haiku-5-5', kind: 'memory', system, user, tokens, maxUsd }
    if (tokens > MAX_PROMPT_TOKENS) {
      notes.push(`prompt too long (about ${tokens} tokens): no memory rewrite`)
    } else if (deps.dryRun) {
      notes.push(`dry run: memory rewrite on the Batch API, about ${tokens} tokens, at most $${maxUsd.toFixed(4)}`)
    } else if (!deps.llm) {
      notes.push('no credentials: no memory rewrite')
    } else if (!canSpend(budget, maxUsd)) {
      notes.push(`monthly budget reached ($${budget.spentUsd.toFixed(2)} of $${budget.capUsd}): no memory rewrite`)
    } else {
      try {
        const id = await deps.llm.submitBatch({ kind: 'memory', model: 'claude-haiku-5-5', system, user, maxTokens: MEMORY_OUTPUT_TOKENS, effort: 'low', schema: MemorySlots })
        mind.memoryBatch = { id, date: evening }
        mind.lastMemoryDate = evening
        parts.push('sent its memory off to be rewritten')
      } catch (e) {
        notes.push(`could not send the memory rewrite: ${(e as Error).message}`)
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

    if (decision.stayUpLate?.trim() && !asleep && hourInZone(tz, nowMs) >= LATE_NIGHT_FROM_HOUR) {
      lateNight = today
      mind.lateNightReason = clampText(decision.stayUpLate.trim(), 200)
      parts.push('staying up late')
    }

    // What the mind took in and thought, for the day's stream.
    for (const t of triggers) {
      if (t.kind === 'novelty' || t.kind === 'blocked' || t.kind === 'need') remember.push({ at: nowIso, kind: 'trigger', text: t.detail })
    }
    for (const e of events) remember.push({ at: nowIso, kind: 'visitor', text: `A visitor left a ${e.type}.` })
    if (decision.thought.trim()) remember.push({ at: nowIso, kind: 'thought', text: decision.thought.trim() })

    // What the mind took in counts for how it feels: something new, a need running low, a plan that did not work out.
    for (const t of triggers) {
      if (t.kind === 'novelty' || t.kind === 'need' || (t.kind === 'blocked' && !failed)) appraisals.push({ kind: t.kind })
    }

    if (thinkKind === 'morning') mind.lastPlanDate = today
    mind.knownObjects = [...new Set([...mind.knownObjects, ...objects.map((o) => o.id)])]
    mind.seenEventTypes = [...new Set([...mind.seenEventTypes, ...events.map((e) => e.type)])]

    if (decision.plan && decision.plan.length > 0) {
      const { usable, check } = checkPlan(decision.plan)
      if (check.ok) {
        goals.today = { date: today, steps: usable, reason: clampText((decision.planReason ?? decision.thought).trim() || 'This is what I feel like doing.', 200) }
        startStep(0, decision.thought)
        if (thinkKind !== 'morning') parts.push('new plan')
      } else {
        mind.rejections = [...mind.rejections, { at: nowIso, reasons: check.reasons.slice(0, 8) }].slice(-10)
        notes.push(`plan rejected: ${check.reasons.join('; ')}`)
        remember.push({ at: nowIso, kind: 'rejected', text: `A plan was turned down: ${check.reasons[0] ?? 'it could not be carried out'}` })
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

  // How it feels now, from what happened, its taste and its quirks.
  if (temperament && deps.pools) {
    const felt = appraise(feelings, appraisals, temperament, deps.pools)
    // Stored to two places, so the label always matches what the file says.
    feelings = { valence: round(felt.valence, 2), arousal: round(felt.arousal, 2) }
    mood = moodLabel(feelings)
  }

  // Wake, bedtime and the body: written when something happened, or once per half hour so the repo stays fresh.
  if (asleep !== forkling.asleep) parts.push(asleep ? 'went to bed' : 'woke up')
  const inboxConsumed = thought && w.inbox.length > 0
  const goalsChanged = !same(goals, w.goals)
  const mindChanged = !same(mind, w.mindState)
  const budgetChanged = !same(budget, w.budget)
  const skillsChanged = !same(skills, w.skills)
  const beliefsChanged = !same(beliefs, w.beliefs)
  const carryingChanged = !same(holding, forkling.holding) || !same(stored, forkling.stored)
  const writeBody =
    started !== null ||
    goalsChanged ||
    mindChanged ||
    inboxConsumed ||
    skillsChanged ||
    carryingChanged ||
    rolled ||
    asleep !== forkling.asleep ||
    (appraisals.length > 0 && mood !== forkling.mood) ||
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
      const { holding: _held, ...rest } = forkling
      const next = Forkling.parse({
        ...rest,
        needs: Object.fromEntries(Object.entries(body.needs).map(([id, v]) => [id, round(v, 1)])),
        position: [round(body.pos.x, 2), 0, round(body.pos.z, 2)],
        mood,
        feelings: { valence: round(feelings.valence, 2), arousal: round(feelings.arousal, 2) },
        intention,
        ...(holding ? { holding } : {}),
        stored,
        asleep,
        ...(lateNight ? { lateNight } : {}),
        lastTickAt: nowIso,
      })
      if (writeJson(dir, 'forkling.json', next)) written.push('forkling.json')
    }
    for (const id of touched) {
      const object = objects.find((o) => o.id === id)
      if (object && writeJson(dir, `objects/${id}.json`, object)) written.push(`objects/${id}.json`)
    }
    for (const id of gone) {
      deleteFile(dir, `objects/${id}.json`)
      written.push(`objects/${id}.json`)
    }
    if (goalsChanged && writeJson(dir, 'mind/goals.json', goals)) written.push('mind/goals.json')
    if (mindChanged && writeJson(dir, 'mind/state.json', mind)) written.push('mind/state.json')
    if (budgetChanged && writeJson(dir, 'brain/budget.json', budget)) written.push('brain/budget.json')
    if (skillsChanged && writeJson(dir, 'brain/skills.json', skills)) written.push('brain/skills.json')
    if (rolled && temperament && writeJson(dir, 'brain/temperament.json', temperament)) written.push('brain/temperament.json')
    if (beliefsChanged && writeJson(dir, 'memory/beliefs.json', beliefs)) written.push('memory/beliefs.json')
    if (journal && writeText(dir, `journal/${journal.date}.md`, journal.text)) written.push(`journal/${journal.date}.md`)
    if (summaryNext && writeText(dir, 'memory/summary.md', summaryNext)) written.push('memory/summary.md')
    if (remember.length > 0) {
      appendStream(dir, today, remember)
      written.push(`memory/stream/${today}.jsonl`)
    }
    if (steps.length > 0) {
      for (const entry of steps) appendTimeline(dir, today, entry)
      written.push(`memory/timeline/${today}.jsonl`)
    }
    // A new morning clears out streams past their keeping time.
    if (!asleep && forkling.asleep) written.push(...prune(dir, today))
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
