/**
 * The nine mind verbs and the validation of a plan made of them (spec 2.4 and 2.6). Pure. Code checks a plan and gives
 * its reasons back to the next decide call; it never chooses a step.
 */
import { planCost, type PricedStep, type Prices } from './allowance.ts'
import { tiredLimits, type MoodState } from './mood.ts'
import { sameSubject, writesOnTopic, type WrittenPage } from './topic-cluster.ts'

export const MIND_VERBS = ['wander', 'tend', 'revisit', 'expand', 'found', 'tinker', 'write', 'reply', 'rest'] as const
export type MindVerb = (typeof MIND_VERBS)[number]

/**
 * Minutes a step may take. The decide call chooses within the range and code clamps. Expand takes no range in the spec,
 * only "starts a 3 h construction"; 20 to 40 minutes to issue the request is an assumption, the same as found's.
 */
export const VERB_MINUTES: Record<MindVerb, readonly [number, number]> = {
  wander: [20, 40],
  tend: [20, 60],
  revisit: [15, 30],
  expand: [20, 40],
  found: [20, 40],
  tinker: [60, 120],
  write: [20, 45],
  reply: [10, 10],
  rest: [30, 90],
}

export function clampMinutes(verb: MindVerb, minutes: number): number {
  const [lo, hi] = VERB_MINUTES[verb]
  if (!Number.isFinite(minutes)) return lo
  return Math.min(hi, Math.max(lo, Math.round(minutes)))
}

/** One step of a plan: a verb with a target, a reason in Merge's words, and the want it serves. */
export interface MindStep extends PricedStep {
  verb: MindVerb
  /** A topic, a place id, a name, an idea, a note id or nothing, by verb. */
  target: string | null
  /** One sentence, up to 140 characters. */
  reason: string
  minutes: number
  /** The want this step serves. Care steps (tend, revisit, expand) serve their place instead. */
  wantId?: string | null
}

/**
 * The variety switches Roman has turned on (spec 12.3, `mind/config.json`). A rule is on when its field is here. Both only refuse a
 * step, with a reason Merge can read, and never choose one.
 */
export interface VarietyContext {
  /** No more than `limit` writes on one subject in `days` days. `pages` are the pages written, newest last. */
  sameTopicWrites?: { limit: number; days: number; pages: readonly WrittenPage[] }
  /** No tinker on the same work more than `limit` times in a row. `recent` are the targets of the latest tinkers, oldest first. */
  sameWorkTinker?: { limit: number; recent: readonly string[] }
}

/**
 * Today's starting points (front-page links and doors), when they are known: at least one trip a day starts from one of them, not
 * from a topic Merge chose (Roman, 16 November: five days of trips all began as its own interests typed in as titles).
 */
export interface StartingPointsContext {
  /** Whether a wander target is one of today's starting points (an address). */
  isPoint(target: string): boolean
  /** Whether a trip today has already started from one. */
  takenToday: boolean
}

export interface MindPlanContext {
  /** When the first step starts, and when it is bed time. */
  startMs: number
  bedMs: number
  mood: MoodState
  pointsInHand: number
  /** Place ids that exist. */
  places: ReadonlySet<string>
  /** Places that have had no care for 7 or more days. */
  revisitable: ReadonlySet<string>
  /** Places that may be expanded: not closed and not under construction (spec v4 2.2, the rails only). */
  expandable: ReadonlySet<string>
  /** Places that have earned the lower price of an expand (spec v4 2.2). */
  expandEarned?: ReadonlySet<string>
  /** Whether an interest has earned a new place and fewer than 2 place requests are open (spec 2.5). */
  canFound: boolean
  /** Visitor notes found and not yet answered. */
  notes: ReadonlySet<string>
  wants: readonly { id: string }[]
  /** The prices in force (the weekly reset); the starting prices when absent. */
  prices?: Prices
  /** Whether Merge has a long goal: a step may then name it as want "long". */
  longGoal?: boolean
  /** The latest steps from before this plan, oldest first. */
  recent: readonly { verb: string }[]
  used: { repliesToday: number; foundThisWeek: number }
  lastExpandedPlace: string | null
  variety?: VarietyContext
  points?: StartingPointsContext
  /** Found notes that have waited 3 hours or more for their reply step: the plan must make room for each (spec 16: answered the same day). */
  overdueNotes?: ReadonlySet<string>
}

export type MindPlanResult = { ok: true; steps: MindStep[] } | { ok: false; reasons: string[] }

const MIN_STEPS = 3
const MAX_STEPS = 8
const MAX_REASON = 140
/** A step may name a want but never has to (audit 17 Nov). While there are fewer wants than this, the reflection runs on the cold-start threshold. */
export const COLD_START_WANTS = 3
/** The id a step uses to point at the long goal. */
export const LONG_GOAL_WANT = 'long'
/** The words every same-topic rejection starts with, so the mind can tell that rule from the others. */
export const SAME_TOPIC_REASON = 'you have written about this'
const NO_NEW_STEP_BEFORE_BED_MS = 45 * 60_000
/** The starting-point rule is not asked in the last hours of the day: a trip needs time. */
const STARTING_POINT_MIN_LEFT_MS = 3 * 3_600_000
/** A reply takes 10 minutes and nothing starts in the last 45 before bed, so the reply rule is not asked in the last hour. */
const REPLY_MIN_LEFT_MS = 3_600_000
const MAX_REPLIES_PER_DAY = 5
export const MAX_FOUND_PER_WEEK = 1
const BUILD_VERBS = new Set<MindVerb>(['expand', 'found', 'tinker'])
const isVerb = (v: unknown): v is MindVerb => (MIND_VERBS as readonly unknown[]).includes(v)

export function validateMindPlan(input: readonly MindStep[], c: MindPlanContext): MindPlanResult {
  const reasons: string[] = []
  const steps = input.map((s) => (isVerb(s.verb) ? { ...s, minutes: clampMinutes(s.verb, s.minutes) } : s))

  if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) reasons.push(`a plan has ${MIN_STEPS} to ${MAX_STEPS} steps, and this one has ${steps.length}`)
  const limits = tiredLimits(c.mood)
  if (limits.maxSteps !== null && steps.length > limits.maxSteps) reasons.push(`you are tired (energy ${c.mood.energy}): a plan has at most ${limits.maxSteps} steps today`)

  const wantIds = new Set(c.wants.map((w) => w.id))
  if (c.longGoal) wantIds.add(LONG_GOAL_WANT)
  let replies = c.used.repliesToday
  let found = c.used.foundThisWeek
  let lastExpanded = c.lastExpandedPlace
  let startMs = c.startMs
  const verbs = c.recent.map((r) => r.verb)
  // Pages and tinkers the plan itself adds count against the later steps of the same plan.
  const plannedPages: WrittenPage[] = []
  const plannedTinkers: string[] = []

  steps.forEach((s, i) => {
    const n = `step ${i + 1}`
    const here: string[] = []
    const at = startMs
    startMs += (isVerb(s.verb) ? s.minutes : 0) * 60_000
    verbs.push(s.verb)

    if (!isVerb(s.verb)) {
      reasons.push(`${n}: "${String(s.verb)}" is not one of the nine verbs (${MIND_VERBS.join(', ')})`)
      return
    }
    const verb = s.verb
    const target = s.target?.trim() || null

    if (verbs.length >= 3 && verbs.slice(-3).every((v) => v === verb)) here.push(`${n}: "${verb}" three times in a row`)

    const reason = s.reason.trim()
    if (!reason) here.push(`${n}: it has no reason`)
    else if (reason.length > MAX_REASON) here.push(`${n}: the reason is over ${MAX_REASON} characters (${reason.length})`)

    if (s.wantId != null && !wantIds.has(s.wantId)) here.push(`${n}: want "${s.wantId}" does not exist`)

    if (at > c.bedMs - NO_NEW_STEP_BEFORE_BED_MS) {
      const minutes = Math.round((c.bedMs - at) / 60_000)
      here.push(minutes >= 0 ? `${n}: it would start ${minutes} minutes before bed, and nothing starts in the last 45` : `${n}: it would start after bed time`)
    }

    if (BUILD_VERBS.has(verb) && !limits.allowBuilds) {
      here.push(`${n}: you are too tired for ${verb} today`)
      reasons.push(...here)
      return
    }

    switch (verb) {
      case 'wander':
        if (!target) here.push(`${n}: wander needs a topic, a feed item or a souvenir to start from`)
        break
      case 'tend':
        if (!target) here.push(`${n}: tend needs a place`)
        else if (!c.places.has(target)) here.push(`${n}: there is no place "${target}"`)
        break
      case 'revisit':
        if (!target) here.push(`${n}: revisit needs a place`)
        else if (!c.places.has(target)) here.push(`${n}: there is no place "${target}"`)
        else if (!c.revisitable.has(target)) here.push(`${n}: "${target}" has not gone 7 days without care`)
        break
      case 'expand':
        if (!target) here.push(`${n}: expand needs a place`)
        else if (!c.places.has(target)) here.push(`${n}: there is no place "${target}"`)
        else if (!c.expandable.has(target)) here.push(`${n}: "${target}" is closed or still under construction, so it cannot be expanded`)
        else if (lastExpanded === target) here.push(`${n}: expand on "${target}" twice in a row`)
        if (target) lastExpanded = target
        break
      case 'found':
        if (!target || target.length < 3 || target.length > 40) here.push(`${n}: the name of a new place must be 3 to 40 characters`)
        if (!c.canFound) here.push(`${n}: no interest has earned a new place yet, or two requests are already open`)
        else if (found >= MAX_FOUND_PER_WEEK) here.push(`${n}: found is ${MAX_FOUND_PER_WEEK} a week`)
        found++
        break
      case 'tinker':
        if (!target) here.push(`${n}: tinker needs an idea`)
        else if (c.variety?.sameWorkTinker) {
          const { limit, recent } = c.variety.sameWorkTinker
          const last = [...recent, ...plannedTinkers].slice(-limit)
          if (last.length >= limit && last.every((r) => sameSubject(r, target))) here.push(`${n}: you have made the same work ${limit} times in a row ("${last.at(-1)!.slice(0, 50)}"): make or change something else this time`)
          plannedTinkers.push(target)
        }
        break
      case 'write':
        if (!target) here.push(`${n}: write needs a place or a subject`)
        else if (c.variety?.sameTopicWrites) {
          const { limit, days, pages } = c.variety.sameTopicWrites
          const hits = writesOnTopic({ target, reason: s.reason }, [...pages, ...plannedPages], { nowMs: c.startMs, days })
          if (hits.length >= limit) {
            const titles = hits.slice(-3).map((h) => `"${h.title.slice(0, 40)}"`).join(', ')
            here.push(`${n}: ${SAME_TOPIC_REASON} ${hits.length} times in the last ${days} days (${titles}): write about something else, or make or read something instead`)
          }
          plannedPages.push({ at: new Date(at).toISOString(), title: target, target, text: s.reason })
        }
        break
      case 'reply':
        if (!target) here.push(`${n}: reply needs a note`)
        else if (!c.notes.has(target)) here.push(`${n}: there is no waiting note "${target}"`)
        replies++
        if (replies > MAX_REPLIES_PER_DAY) here.push(`${n}: at most ${MAX_REPLIES_PER_DAY} replies a day`)
        break
      case 'rest':
        if (target) here.push(`${n}: rest takes no target`)
        break
    }
    reasons.push(...here)
  })

  if (c.points && !c.points.takenToday && c.bedMs - c.startMs >= STARTING_POINT_MIN_LEFT_MS) {
    const wanders = steps.map((s, i) => ({ s, i })).filter(({ s }) => s.verb === 'wander')
    if (!wanders.some(({ s }) => c.points!.isPoint(s.target?.trim() ?? ''))) {
      const ask = 'today no trip has started from one of the starting points (listed above, with the doors), and at least one a day does: start a wander from one of them, by its address, not from a topic you chose'
      reasons.push(wanders.length > 0 ? `step ${wanders[0]!.i + 1}: ${ask}` : `the plan has no wander, and ${ask}`)
    }
  }

  if (c.overdueNotes && c.overdueNotes.size > 0 && c.bedMs - c.startMs >= REPLY_MIN_LEFT_MS) {
    const answered = new Set(steps.filter((s) => s.verb === 'reply').map((s) => s.target?.trim() ?? ''))
    for (const id of c.overdueNotes) {
      if (c.notes.has(id) && !answered.has(id)) reasons.push(`the note "${id}" has waited 3 hours or more for an answer: add a reply step for it (you may reply, decline it with a reason, or keep it)`)
    }
  }

  const valid = steps.filter((s): s is MindStep => isVerb(s.verb))
  const cost = planCost(valid.map((s) => (s.verb === 'expand' && s.target && c.expandEarned?.has(s.target.trim()) ? { ...s, earned: true } : s)), c.prices)
  if (cost > c.pointsInHand) reasons.push(`the plan costs ${cost} points and you have ${c.pointsInHand} in hand`)

  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, steps: valid }
}
