/**
 * The nine mind verbs and the validation of a plan made of them (spec 2.4 and 2.6). Pure. Code checks a plan and gives
 * its reasons back to the next decide call; it never chooses a step.
 */
import { planCost, type PricedStep } from './allowance.ts'
import { tiredLimits, type MoodState } from './mood.ts'

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
  /** Places that may grow: a tag, or a topic of what is shown in it, at weight 30 or more with 3 souvenirs kept since, and no construction (spec 2.5). */
  expandable: ReadonlySet<string>
  /** Whether an interest has earned a new place and fewer than 2 place requests are open (spec 2.5). */
  canFound: boolean
  /** Visitor notes found and not yet answered. */
  notes: ReadonlySet<string>
  wants: readonly { id: string }[]
  /** The latest steps from before this plan, oldest first. */
  recent: readonly { verb: string }[]
  used: { repliesToday: number; sketchesToday: number; foundThisWeek: number }
  lastExpandedPlace: string | null
}

export type MindPlanResult = { ok: true; steps: MindStep[] } | { ok: false; reasons: string[] }

const MIN_STEPS = 3
const MAX_STEPS = 8
const MAX_REASON = 140
/** The wants list is allowed to start empty: until it holds this many, a step need not point at one. */
const COLD_START_WANTS = 3
const NO_NEW_STEP_BEFORE_BED_MS = 45 * 60_000
const MAX_REPLIES_PER_DAY = 5
const MAX_SKETCHES_PER_DAY = 3
const MAX_FOUND_PER_WEEK = 1
const CARE_VERBS = new Set<MindVerb>(['tend', 'revisit', 'expand'])
const BUILD_VERBS = new Set<MindVerb>(['expand', 'found', 'tinker'])
const isVerb = (v: unknown): v is MindVerb => (MIND_VERBS as readonly unknown[]).includes(v)

export function validateMindPlan(input: readonly MindStep[], c: MindPlanContext): MindPlanResult {
  const reasons: string[] = []
  const steps = input.map((s) => (isVerb(s.verb) ? { ...s, minutes: clampMinutes(s.verb, s.minutes) } : s))

  if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) reasons.push(`a plan has ${MIN_STEPS} to ${MAX_STEPS} steps, and this one has ${steps.length}`)
  const limits = tiredLimits(c.mood)
  if (limits.maxSteps !== null && steps.length > limits.maxSteps) reasons.push(`you are tired (energy ${c.mood.energy}): a plan has at most ${limits.maxSteps} steps today`)

  const wantIds = new Set(c.wants.map((w) => w.id))
  const needsWant = c.wants.length >= COLD_START_WANTS
  let replies = c.used.repliesToday
  let sketches = c.used.sketchesToday
  let found = c.used.foundThisWeek
  let lastExpanded = c.lastExpandedPlace
  let startMs = c.startMs
  const verbs = c.recent.map((r) => r.verb)

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

    const care = CARE_VERBS.has(verb)
    if (s.wantId != null && !wantIds.has(s.wantId)) here.push(`${n}: want "${s.wantId}" does not exist`)
    else if (needsWant && !care && s.wantId == null) here.push(`${n}: it serves no want (name one of: ${[...wantIds].join(', ')})`)

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
        else if (!c.expandable.has(target)) here.push(`${n}: "${target}" is not ready to grow`)
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
        if (s.size === 'sketch') {
          sketches++
          if (sketches > MAX_SKETCHES_PER_DAY) here.push(`${n}: at most ${MAX_SKETCHES_PER_DAY} sketches a day`)
        }
        break
      case 'write':
        if (!target) here.push(`${n}: write needs a place or a subject`)
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

  const valid = steps.filter((s): s is MindStep => isVerb(s.verb))
  const cost = planCost(valid)
  if (cost > c.pointsInHand) reasons.push(`the plan costs ${cost} points and you have ${c.pointsInHand} in hand`)

  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, steps: valid }
}
