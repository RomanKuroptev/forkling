import type { AnimationSlot, Intention, MicroBehavior, SpeciesAction, SpeciesPack } from '@forkling/schema'
import { findPath, isWalkable, nearestWalkable, type NavGrid, type Point2 } from './nav.ts'
import { applyAction, decayNeeds, initialNeeds, type Needs } from './needs.ts'
import { createPrng, type Prng } from './prng.ts'
import { isDusk } from './time.ts'
import { pickAction, scoreActions } from './utility.ts'

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
  /** Spots the world offers, by kind (`food`, `perch`, `sunbeam`...). */
  spots: Record<string, Point2[]>
}

export type Phase = 'moving' | 'acting' | 'micro'

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
  intention: Intention
  action: SpeciesAction
  phase: Phase
  /** The animation slot to play right now. The viewer resolves it against the pack's clips. */
  slot: AnimationSlot
  /** The micro-behavior in progress, if any, and what to do when it ends. */
  micro: { behavior: MicroBehavior; resume: 'acting' | 'replan' } | null
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
}

const IDLE_ACTION: SpeciesAction = {
  id: 'idle',
  satisfies: {},
  durationSec: [0, 0],
  target: { type: 'none' },
  slot: 'idle',
  gait: 'walk',
  requires: [],
  reason: 'Just looking around.',
}

/** Used when nothing the pack offers can be reached, so a forkling always has something to do. */
const PAUSE_ACTION: SpeciesAction = { ...IDLE_ACTION, id: 'pause', durationSec: [2, 4] }

export function createForkling(pack: SpeciesPack, behaviors: MicroBehavior[], seed: number, start: Point2): ForklingState {
  return {
    pack,
    behaviors,
    rng: createPrng(seed),
    time: 0,
    pos: { ...start },
    heading: 0,
    needs: initialNeeds(pack),
    intention: { type: IDLE_ACTION.id, startedAt: 0, seed: seed >>> 0, reason: IDLE_ACTION.reason },
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
  }
}

const dist = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z)

export function stepForkling(s: ForklingState, dt: number, ctx: StepContext): void {
  s.time += dt
  s.needs = decayNeeds(s.needs, s.pack, dt)

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
  s.slot = s.action.gait

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
  const { resume } = s.micro
  s.micro = null
  if (resume === 'acting') {
    s.phase = 'acting'
    s.elapsed = 0
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
  s.micro = { behavior, resume }
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
  let candidates = scoreActions(s.needs, s.pack, {
    visitorDistance: ctx.visitor ? dist(s.pos, ctx.visitor) : null,
    timeOfDay: ctx.timeOfDay,
    spotKinds,
  })
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
    s.slot = action.gait
  }
}

function resolveTarget(s: ForklingState, action: SpeciesAction, ctx: StepContext): Resolved | null {
  const target = action.target
  switch (target.type) {
    case 'none':
      return { path: [], goal: null, chasing: false }

    case 'wander': {
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

    case 'spot': {
      const spots = [...(ctx.spots[target.kind] ?? [])].sort((a, b) => dist(s.pos, a) - dist(s.pos, b) || a.x - b.x || a.z - b.z)
      const n = Math.min(spots.length, 4)
      if (n === 0) return null
      // Mostly the nearest spots, but not always the same one.
      const first = Math.floor(s.rng.next() ** 2 * n)
      for (let i = 0; i < n; i++) {
        const goal = nearestWalkable(ctx.grid, spots[(first + i) % n]!, 3)
        const path = goal ? findPath(ctx.grid, s.pos, goal) : null
        if (goal && path) return { path, goal, chasing: false, targetId: target.kind }
      }
      return null
    }
  }
}
