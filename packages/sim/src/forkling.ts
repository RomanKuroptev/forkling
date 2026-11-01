import type { AnimationSlot, Intention, MicroBehavior, NeedId, SpeciesAction, SpeciesPack } from '@forkling/schema'
import { findPath, isWalkable, nearestWalkable, type NavGrid, type Point2 } from './nav.ts'
import type { Feelings } from './appraisal.ts'
import { applyAction, ASLEEP_DECAY, decayNeeds, initialNeeds, type Needs } from './needs.ts'
import { createPrng, type Prng } from './prng.ts'
import { isDusk } from './time.ts'
import { STRONG_NEED } from './surprise.ts'
import { fixableNeeds, pickAction, requirementsMet, scoreActions } from './utility.ts'

/** Recommended fixed timestep in seconds. The sim is deterministic for a seed at any fixed step. */
export const STEP = 0.1

/** How close to a visitor counts as having reached them, in meters. */
const ARRIVE_DISTANCE = 1.3
/** A forkling gives up on a visitor who has wandered beyond this multiple of its notice radius. */
const LOSE_VISITOR_FACTOR = 1.5
const REPATH_INTERVAL = 1
/** Seconds of near-zero progress while moving before the stuck guard steps in. */
const STUCK_SECONDS = 2

export interface StepContext {
  grid: NavGrid
  /** The visitor's position, or null when nobody is there. */
  visitor: Point2 | null
  /** Hours since midnight, 0 to 24. */
  timeOfDay: number
  /** Bedtime by the sleep schedule. When absent, night hours stand in for it. */
  asleep?: boolean
  /** Spots the world offers, by kind (`food`, `perch`, `sunbeam`...). */
  spots: Record<string, Point2[]>
}

/**
 * What the mind wants it to be doing for now: favoured when it chooses, never forced. Its needs and a visitor still win.
 * `until` is on the sim clock, in seconds.
 */
export interface Focus {
  action: string
  /** An object id or a spot kind to go to. */
  targetId?: string
  /** A place to go to, for actions that wander. */
  position?: Point2
  until: number
}

/** A focused action's score is at least this and doubled when a need or a visitor keeps it from simply winning. */
const FOCUS_SCORE = 1

export type Phase = 'moving' | 'acting' | 'micro'

/** An intention as the body tracks it: like the repo's `Intention`, but with `startedAt` in seconds on the sim clock. */
export type BodyIntention = Omit<Intention, 'startedAt'> & { startedAt: number }

/** The repo form of a body intention. The sim clock is in seconds since the Unix epoch once playback anchors it. */
export function toRepoIntention(intention: BodyIntention): Intention {
  const { targetId, ...rest } = intention
  // `for:<verb>` is how the sim names "any object this verb fits": a label of its own, not something that is in the world.
  return { ...rest, ...(targetId && !targetId.startsWith('for:') ? { targetId } : {}), startedAt: new Date(intention.startedAt * 1000).toISOString() }
}

/**
 * A forkling's body: where it is, what it is doing and why. Plain data plus a seeded PRNG. `stepForkling`
 * mutates it in place, so the render loop and tests share one code path.
 */
export interface ForklingState {
  pack: SpeciesPack
  behaviors: MicroBehavior[]
  rng: Prng
  /** Seconds since the forkling was created. */
  time: number
  pos: Point2
  /** Yaw in radians, 0 facing +z. */
  heading: number
  needs: Needs
  intention: BodyIntention
  action: SpeciesAction
  phase: Phase
  /** The animation slot to play right now. The viewer resolves it against the pack's clips. */
  slot: AnimationSlot
  /** The micro-behavior in progress, if any, and what to do when it ends: resume the action (for its full duration) or choose anew. */
  micro: { behavior: MicroBehavior; resume: 'acting' | 'replan'; actingDuration?: number } | null
  /** Seconds into the current acting or micro phase. */
  elapsed: number
  duration: number
  path: Point2[]
  goal: Point2 | null
  chasing: boolean
  noticed: boolean
  repathTimer: number
  progressTimer: number
  progressPos: Point2
  stuckSeconds: number
  repaths: number
  /** An action to start with instead of choosing, e.g. the intention from `forkling.json`. Used once. */
  firstAction: string | null
  focus: Focus | null
  /** Whether its paws are full, which changes how it walks. */
  holding: boolean
  /** What its quirks do to each verb's appeal. Fixed for life, from its temperament. */
  quirkWeights: Record<string, number>
  /** How it feels, from the repo state. Fixed for a replay, so everyone who replays it chooses the same way. */
  feelings?: Feelings
}

export interface CreateOptions {
  /** Sim clock at creation, in seconds. Playback uses Unix time. */
  time?: number
  /** Starting needs. Needs the pack declares but this leaves out start at the pack's initial value. */
  needs?: Needs
  /** Start with this action id if the pack has it and its target can be reached. */
  firstAction?: string
  focus?: Focus
  holding?: boolean
  quirkWeights?: Record<string, number>
  feelings?: Feelings
}

const IDLE_ACTION: SpeciesAction = {
  id: 'idle',
  satisfies: {},
  durationSec: [0, 0],
  target: { type: 'none' },
  slot: 'idle',
  gait: 'walk',
  requires: [],
  spontaneous: 0,
  reason: 'Just looking around.',
  group: 'body',
  effect: 'none',
  hands: 'any',
  accepts: [],
}

/** Used when nothing the pack offers can be reached, so a forkling always has something to do. */
const PAUSE_ACTION: SpeciesAction = { ...IDLE_ACTION, id: 'pause', durationSec: [2, 4] }

export function createForkling(
  pack: SpeciesPack,
  behaviors: MicroBehavior[],
  seed: number,
  start: Point2,
  opts: CreateOptions = {},
): ForklingState {
  const time = opts.time ?? 0
  const needs = initialNeeds(pack)
  for (const id of Object.keys(needs) as (keyof Needs)[]) {
    const given = opts.needs?.[id]
    if (given !== undefined) needs[id] = given
  }
  return {
    pack,
    behaviors,
    rng: createPrng(seed),
    time,
    pos: { ...start },
    heading: 0,
    needs,
    intention: { type: IDLE_ACTION.id, startedAt: time, seed: seed >>> 0, reason: IDLE_ACTION.reason },
    action: IDLE_ACTION,
    phase: 'acting',
    slot: 'idle',
    micro: null,
    elapsed: 0,
    duration: 0,
    path: [],
    goal: null,
    chasing: false,
    noticed: false,
    repathTimer: 0,
    progressTimer: 0,
    progressPos: { ...start },
    stuckSeconds: 0,
    repaths: 0,
    firstAction: opts.firstAction ?? null,
    focus: opts.focus ?? null,
    holding: opts.holding ?? false,
    quirkWeights: opts.quirkWeights ?? {},
    ...(opts.feelings ? { feelings: opts.feelings } : {}),
  }
}

const dist = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z)

/** How it gets about on the way to an action: running is always on four legs, a full pair of paws carries, a task is done upright. */
function movingSlot(s: ForklingState, action: SpeciesAction): AnimationSlot {
  if (action.gait === 'run') return 'run'
  if (s.holding) return 'carry'
  return action.body === 'upright' ? 'walkUpright' : 'walk'
}

/** Point the body at what the mind wants now (or nothing), and let it start straight away. */
export function setFocus(s: ForklingState, focus: Focus | null, ctx: StepContext): void {
  s.focus = focus
  replan(s, ctx)
}

const activeFocus = (s: ForklingState): Focus | null => (s.focus && s.time < s.focus.until ? s.focus : null)

export function stepForkling(s: ForklingState, dt: number, ctx: StepContext): void {
  s.time += dt
  s.needs = decayNeeds(s.needs, s.pack, dt, ctx.asleep === true ? ASLEEP_DECAY : 1)

  const radius = s.pack.perception.noticeRadius
  const visitorDistance = ctx.visitor ? dist(s.pos, ctx.visitor) : null
  if (visitorDistance !== null && visitorDistance <= radius && !s.noticed) {
    // Noticing someone is a reason to reconsider, whatever it was doing.
    s.noticed = true
    s.micro = null
    replan(s, ctx)
  } else if (visitorDistance === null || visitorDistance > radius * LOSE_VISITOR_FACTOR) {
    s.noticed = false
  }

  if (s.phase === 'acting' && s.elapsed >= s.duration) finishAction(s, ctx)

  if (s.phase === 'moving') move(s, dt, ctx)
  else if (s.phase === 'acting') act(s, dt, ctx)
  else tickMicro(s, dt, ctx)
}

function move(s: ForklingState, dt: number, ctx: StepContext): void {
  const { walkSpeed, runSpeed } = s.pack.locomotion
  const speed = s.action.gait === 'run' ? runSpeed : walkSpeed
  s.slot = movingSlot(s, s.action)

  if (s.chasing) {
    const radius = s.pack.perception.noticeRadius
    if (!ctx.visitor || dist(s.pos, ctx.visitor) > radius * LOSE_VISITOR_FACTOR) {
      replan(s, ctx)
      return
    }
    if (dist(s.pos, ctx.visitor) <= ARRIVE_DISTANCE) {
      s.path = []
    } else {
      s.repathTimer += dt
      if (s.repathTimer >= REPATH_INTERVAL) {
        s.repathTimer = 0
        const goal = nearestWalkable(ctx.grid, ctx.visitor, 6)
        const path = goal ? findPath(ctx.grid, s.pos, goal) : null
        if (goal && path) {
          s.goal = goal
          s.path = path
        }
      }
    }
  }

  let remaining = speed * dt
  while (remaining > 0 && s.path.length > 0) {
    const wp = s.path[0]!
    const d = dist(s.pos, wp)
    if (d <= remaining) {
      if (d > 1e-9) s.heading = Math.atan2(wp.x - s.pos.x, wp.z - s.pos.z)
      s.pos = { x: wp.x, z: wp.z }
      remaining -= d
      s.path.shift()
    } else {
      s.heading = Math.atan2(wp.x - s.pos.x, wp.z - s.pos.z)
      s.pos = { x: s.pos.x + ((wp.x - s.pos.x) / d) * remaining, z: s.pos.z + ((wp.z - s.pos.z) / d) * remaining }
      remaining = 0
    }
  }

  if (s.path.length === 0) {
    startActing(s)
    return
  }

  // Stuck guard: if it barely moved for a couple of seconds, try one fresh path, then pick something else.
  s.progressTimer += dt
  if (s.progressTimer >= 1) {
    s.stuckSeconds = dist(s.pos, s.progressPos) < speed * 0.25 ? s.stuckSeconds + 1 : 0
    s.progressPos = { ...s.pos }
    s.progressTimer = 0
    if (s.stuckSeconds >= STUCK_SECONDS) {
      s.stuckSeconds = 0
      const path = s.goal && s.repaths < 1 ? findPath(ctx.grid, s.pos, s.goal) : null
      if (path) {
        s.repaths++
        s.path = path
      } else {
        replan(s, ctx)
      }
    }
  }
}

function act(s: ForklingState, dt: number, ctx: StepContext): void {
  s.slot = s.action.slot
  const slice = Math.min(dt, Math.max(0, s.duration - s.elapsed))
  // Needs are satisfied gradually while the action is performed, so an interruption keeps what was gained.
  if (s.duration > 0 && slice > 0) s.needs = applyAction(s.needs, s.action, slice / s.duration)
  s.elapsed += dt
  if (s.action.target.type === 'visitor' && ctx.visitor && dist(s.pos, ctx.visitor) > 1e-6) {
    s.heading = Math.atan2(ctx.visitor.x - s.pos.x, ctx.visitor.z - s.pos.z)
  }
}

function tickMicro(s: ForklingState, dt: number, ctx: StepContext): void {
  s.elapsed += dt
  if (s.elapsed < s.duration || !s.micro) return
  const { resume, actingDuration } = s.micro
  s.micro = null
  if (resume === 'acting') {
    s.phase = 'acting'
    s.elapsed = 0
    s.duration = actingDuration ?? 0
    s.slot = s.action.slot
  } else {
    replan(s, ctx)
  }
}

function rollMicro(s: ForklingState, when: MicroBehavior['when']): MicroBehavior | null {
  for (const b of s.behaviors) {
    if (b.when === when && s.rng.next() < b.chance) return b
  }
  return null
}

function startMicro(s: ForklingState, behavior: MicroBehavior, resume: 'acting' | 'replan'): void {
  s.phase = 'micro'
  // The micro borrows elapsed/duration, so remember how long the action it interrupts should last.
  s.micro = resume === 'acting' ? { behavior, resume, actingDuration: s.duration } : { behavior, resume }
  s.elapsed = 0
  s.duration = behavior.durationSec
  s.slot = behavior.slot ?? 'idle'
}

function startActing(s: ForklingState): void {
  s.chasing = false
  s.path = []
  s.phase = 'acting'
  s.elapsed = 0
  s.duration = s.rng.range(s.action.durationSec[0], s.action.durationSec[1])
  s.slot = s.action.slot
  if (s.action.slot === 'sleep') {
    const tuck = rollMicro(s, 'beforeSleep')
    if (tuck) startMicro(s, tuck, 'acting')
  }
}

function finishAction(s: ForklingState, ctx: StepContext): void {
  if (s.firstAction) {
    replan(s, ctx)
    return
  }
  const micro = rollMicro(s, s.action.slot === 'sleep' ? 'afterWake' : 'idle') ?? (isDusk(ctx.timeOfDay) ? rollMicro(s, 'dusk') : null)
  if (micro) startMicro(s, micro, 'replan')
  else replan(s, ctx)
}

interface Resolved {
  path: Point2[]
  goal: Point2 | null
  chasing: boolean
  targetId?: string
}

/** Pick the next action by utility, find where it happens, and start towards it. */
function replan(s: ForklingState, ctx: StepContext): void {
  s.micro = null
  if (!isWalkable(ctx.grid, s.pos.x, s.pos.z)) {
    const snapped = nearestWalkable(ctx.grid, s.pos, 10)
    if (snapped) s.pos = { ...snapped }
  }

  const spotKinds = new Set(Object.keys(ctx.spots).filter((k) => (ctx.spots[k]?.length ?? 0) > 0))
  const focus = activeFocus(s)
  const visitorDistance = ctx.visitor ? dist(s.pos, ctx.visitor) : null
  const scoring = {
    visitorDistance,
    holding: s.holding,
    timeOfDay: ctx.timeOfDay,
    ...(ctx.asleep !== undefined ? { asleep: ctx.asleep } : {}),
  }

  if (s.firstAction) {
    const first = s.pack.actions.find((a) => a.id === s.firstAction)
    s.firstAction = null
    // What the repo says it was doing is resumed only if it is still allowed now.
    const target = first && requirementsMet(first, s.pack, scoring) ? resolveTarget(s, first, ctx) : null
    if (first && target) {
      begin(s, first, target)
      return
    }
  }

  // What the mind planned owns the visible action. It gives way for one action when a need is critically low and the
  // body can raise it right now (and the planned verb would not), or when someone has come up to say hello.
  const visitorNear = visitorDistance !== null && visitorDistance <= s.pack.perception.noticeRadius
  if (focus && !visitorNear) {
    const planned = s.pack.actions.find((a) => a.id === focus.action)
    const plannedTarget = planned && requirementsMet(planned, s.pack, scoring) ? resolveTarget(s, planned, ctx) : null
    const fixable = fixableNeeds(s.pack, { ...scoring, spotKinds })
    const fixing = (Object.entries(s.needs) as [NeedId, number | undefined][]).filter(([id, v]) => v !== undefined && v < STRONG_NEED && fixable.has(id)).map(([id]) => id)
    const planFixes = !!planned && fixing.some((id) => (planned.satisfies[id] ?? 0) > 0)
    if (fixing.length > 0 && !planFixes) {
      let helpers = scoreActions(s.needs, s.pack, { ...scoring, spotKinds, quirkWeights: s.quirkWeights, ...(s.feelings ? { feelings: s.feelings } : {}) }).filter((c) => fixing.some((id) => (c.action.satisfies[id] ?? 0) > 0))
      for (let attempt = 0; attempt < 5 && helpers.length > 0; attempt++) {
        const action = pickAction(helpers, s.rng)
        const target = resolveTarget(s, action, ctx)
        if (target) {
          begin(s, action, target)
          return
        }
        helpers = helpers.filter((c) => c.action !== action)
      }
    }
    if (planned && plannedTarget) {
      begin(s, planned, plannedTarget)
      return
    }
  }

  let candidates = scoreActions(s.needs, s.pack, { ...scoring, spotKinds, quirkWeights: s.quirkWeights, ...(s.feelings ? { feelings: s.feelings } : {}), ...(focus ? { focusAction: focus.action } : {}) })
  if (focus) {
    candidates = candidates.map((c) => (c.action.id === focus.action ? { ...c, score: Math.max(c.score * 2, FOCUS_SCORE) } : c))
  }
  for (let attempt = 0; attempt < 5 && candidates.length > 0; attempt++) {
    const action = pickAction(candidates, s.rng)
    const target = resolveTarget(s, action, ctx)
    if (target) {
      begin(s, action, target)
      return
    }
    candidates = candidates.filter((c) => c.action !== action)
  }
  begin(s, PAUSE_ACTION, { path: [], goal: null, chasing: false })
}

function begin(s: ForklingState, action: SpeciesAction, target: Resolved): void {
  s.action = action
  s.intention = {
    type: action.id,
    ...(target.targetId ? { targetId: target.targetId } : {}),
    startedAt: s.time,
    seed: s.rng.int(2147483647),
    reason: action.reason,
  }
  s.path = target.path
  s.goal = target.goal
  s.chasing = target.chasing
  s.repathTimer = 0
  s.progressTimer = 0
  s.progressPos = { ...s.pos }
  s.stuckSeconds = 0
  s.repaths = 0
  if (target.path.length === 0) {
    startActing(s)
  } else {
    s.phase = 'moving'
    s.slot = movingSlot(s, action)
  }
}

function resolveTarget(s: ForklingState, action: SpeciesAction, ctx: StepContext): Resolved | null {
  const target = action.target
  const focus = activeFocus(s)?.action === action.id ? s.focus : null
  switch (target.type) {
    case 'none':
      return { path: [], goal: null, chasing: false }

    case 'wander': {
      if (focus?.position) {
        const goal = nearestWalkable(ctx.grid, focus.position, 8)
        const path = goal ? findPath(ctx.grid, s.pos, goal) : null
        if (goal && path) return { path, goal, chasing: false }
      }
      for (let i = 0; i < 6; i++) {
        const angle = s.rng.range(0, Math.PI * 2)
        const r = s.rng.range(target.radius * 0.3, target.radius)
        const goal = nearestWalkable(ctx.grid, { x: s.pos.x + Math.sin(angle) * r, z: s.pos.z + Math.cos(angle) * r }, 8)
        const path = goal ? findPath(ctx.grid, s.pos, goal) : null
        if (goal && path) return { path, goal, chasing: false }
      }
      return null
    }

    case 'visitor': {
      if (!ctx.visitor) return null
      if (dist(s.pos, ctx.visitor) <= ARRIVE_DISTANCE) return { path: [], goal: null, chasing: false, targetId: 'visitor' }
      const goal = nearestWalkable(ctx.grid, ctx.visitor, 6)
      const path = goal ? findPath(ctx.grid, s.pos, goal) : null
      return goal && path ? { path, goal, chasing: true, targetId: 'visitor' } : null
    }

    // A focus on a particular object goes there; otherwise any spot of the action's kind, or object the verb works on, will do.
    case 'spot':
    case 'object': {
      const fallback = target.type === 'spot' ? target.kind : `for:${action.id}`
      const label = focus?.targetId && (ctx.spots[focus.targetId]?.length ?? 0) > 0 ? focus.targetId : fallback
      const spots = [...(ctx.spots[label] ?? [])].sort((a, b) => dist(s.pos, a) - dist(s.pos, b) || a.x - b.x || a.z - b.z)
      const n = Math.min(spots.length, 4)
      if (n === 0) return null
      // Mostly the nearest spots, but not always the same one.
      const first = Math.floor(s.rng.next() ** 2 * n)
      for (let i = 0; i < n; i++) {
        const goal = nearestWalkable(ctx.grid, spots[(first + i) % n]!, 3)
        const path = goal ? findPath(ctx.grid, s.pos, goal) : null
        if (goal && path) return { path, goal, chasing: false, targetId: label }
      }
      return null
    }
  }
}
