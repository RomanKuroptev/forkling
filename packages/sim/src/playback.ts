import type { Forkling, MicroBehavior, SpeciesPack } from '@forkling/schema'
import { createForkling, STEP, stepForkling, type Focus, type ForklingState, type StepContext } from './forkling.ts'
import { nearestWalkable, type Point2 } from './nav.ts'
import { isAsleepAt } from './sleep.ts'
import { sunDirection } from './sky.ts'
import type { StarterWorld } from './starter.ts'
import { collectSpots } from './world.ts'

/**
 * Playback length in seconds. When the repo's intention is older than the current epoch, the body restarts from the
 * repo state at the epoch start. 30 minutes matches the mind's cron (M4), which will write fresh state each tick.
 */
export const EPOCH_SECONDS = 30 * 60

export interface PlaybackInput {
  forkling: Forkling
  pack: SpeciesPack
  behaviors: MicroBehavior[]
  world: StarterWorld
  /** Unix seconds when the repo state was written (its commit time). Edits then take effect from that moment. */
  stateTime?: number
}

/** Where playback starts: a moment, and the seed that makes everything after it deterministic. */
export interface Anchor {
  /** Unix seconds. */
  time: number
  seed: number
  epoch: number
  /** What the anchor is: the intention starting, the repo being changed, or a stale state restarting at the epoch. */
  source: 'intention' | 'commit' | 'epoch'
}

/** A body being played back. Every viewer that plays the same input steps on the same grid of instants. */
export interface Playback {
  input: PlaybackInput
  anchor: Anchor
  state: ForklingState
  /** Fixed steps taken since the anchor. */
  steps: number
  /**
   * True while this browser's visitor is interacting with the forkling. The body then reacts to them and may drift from
   * what other viewers see; once the visitor leaves and the interaction ends, it rejoins the shared timeline.
   */
  local: boolean
  ctx: StepContext
  spotMinute: number
  hourCache: { minute: number; hour: number }
  asleepCache: { minute: number; asleep: boolean }
}

const epochOf = (sec: number) => Math.floor(sec / EPOCH_SECONDS)

/** A distinct, stable seed per epoch, so a stale forkling still does something different every half hour. */
function mixSeed(seed: number, epoch: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(epoch, 0xc2b2ae35)
  h ^= h >>> 16
  h = Math.imul(h, 0x27d4eb2f)
  h ^= h >>> 15
  return h >>> 0
}

/**
 * Where playback starts. The repo state describes the forkling as of the later of its intention starting and its last
 * commit, as long as that is in the current epoch; otherwise it restarts from the repo state at the epoch start.
 */
export function anchorFor(forkling: Forkling, nowSec: number, stateTime?: number): Anchor {
  const epoch = epochOf(nowSec)
  const inEpoch = (t: number) => t <= nowSec && epochOf(t) === epoch
  const started = Date.parse(forkling.intention.startedAt) / 1000
  const seed = forkling.intention.seed
  if (stateTime !== undefined && inEpoch(stateTime) && (!inEpoch(started) || stateTime > started)) {
    return { time: stateTime, seed: mixSeed(seed, Math.floor(stateTime)), epoch, source: 'commit' }
  }
  if (inEpoch(started)) return { time: started, seed, epoch, source: 'intention' }
  return { time: epoch * EPOCH_SECONDS, seed: mixSeed(seed, epoch), epoch, source: 'epoch' }
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Hours since local midnight in an IANA time zone, at a Unix time in milliseconds. */
export function hourInZone(timezone: string, ms: number): number {
  let format = formatters.get(timezone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    formatters.set(timezone, format)
  }
  let h = 0
  let m = 0
  let s = 0
  for (const part of format.formatToParts(new Date(ms))) {
    if (part.type === 'hour') h = Number(part.value)
    else if (part.type === 'minute') m = Number(part.value)
    else if (part.type === 'second') s = Number(part.value)
  }
  return h + m / 60 + s / 3600
}

/** Time of day at a sim instant. Looked up once per minute, so it stays cheap and identical across viewers. */
function hourAt(pb: Playback, sec: number): number {
  const minute = Math.floor(sec / 60)
  if (minute !== pb.hourCache.minute) {
    pb.hourCache = { minute, hour: hourInZone(pb.input.forkling.timezone, minute * 60_000) }
  }
  return (pb.hourCache.hour + (sec - minute * 60) / 3600) % 24
}

/** Whether the forkling is in bed at a sim instant, by its sleep schedule. Looked up once per minute. */
function asleepAt(pb: Playback, sec: number): boolean {
  const minute = Math.floor(sec / 60)
  if (minute !== pb.asleepCache.minute) {
    const { forkling } = pb.input
    pb.asleepCache = {
      minute,
      asleep: isAsleepAt(minute * 60_000, { seed: forkling.seed, timezone: forkling.timezone, lateNight: forkling.lateNight }),
    }
  }
  return pb.asleepCache.asleep
}

function stepOnce(pb: Playback, visitor: Point2 | null): void {
  const { pack, world } = pb.input
  const t = pb.anchor.time + (pb.steps + 1) * STEP
  pb.ctx.timeOfDay = hourAt(pb, t)
  pb.ctx.asleep = asleepAt(pb, t)
  const minute = Math.floor(t / 60)
  if (minute !== pb.spotMinute) {
    pb.spotMinute = minute
    pb.ctx.spots = collectSpots(pack, world.cfg, world.nav, world.spawn, sunDirection(pb.ctx.timeOfDay), world.objects)
  }
  pb.ctx.visitor = visitor
  stepForkling(pb.state, STEP, pb.ctx)
  pb.steps++
}

function stepTo(pb: Playback, nowSec: number, visitor: Point2 | null): void {
  const target = Math.floor((nowSec - pb.anchor.time) / STEP + 1e-9)
  while (pb.steps < target) stepOnce(pb, visitor)
}

/** The focus the mind wrote into the intention, if there is one. */
function focusFor(forkling: Forkling): { focus?: Focus } {
  const { until, type, targetId, position } = forkling.intention
  if (!until) return {}
  return {
    focus: {
      action: type,
      ...(targetId ? { targetId } : {}),
      ...(position ? { position: { x: position[0], z: position[1] } } : {}),
      until: Date.parse(until) / 1000,
    },
  }
}

/**
 * The canonical body at `nowMs`: start from the repo state at the anchor and catch up with no visitor. Every viewer
 * that calls this at the same moment gets the same result.
 */
export function startPlayback(input: PlaybackInput, nowMs: number): Playback {
  const { forkling, pack, behaviors, world } = input
  const anchor = anchorFor(forkling, nowMs / 1000, input.stateTime)
  const [x, , z] = forkling.position
  const start = nearestWalkable(world.nav.grid, { x, z }, 25) ?? { x: world.spawn.x, z: world.spawn.z }
  const state = createForkling(pack, behaviors, anchor.seed, start, {
    time: anchor.time,
    needs: forkling.needs,
    firstAction: forkling.intention.type,
    ...focusFor(forkling),
  })
  const pb: Playback = {
    input,
    anchor,
    state,
    steps: 0,
    local: false,
    ctx: { grid: world.nav.grid, visitor: null, timeOfDay: 0, spots: {} },
    spotMinute: -1,
    hourCache: { minute: -1, hour: 0 },
    asleepCache: { minute: -1, asleep: false },
  }
  stepTo(pb, nowMs / 1000, null)
  return pb
}

/**
 * Run a live body forward to `nowMs` on the shared step grid. It follows the canonical timeline until this browser's
 * visitor comes within notice range, reacts to them locally, and rejoins the canonical timeline once they have left and
 * it is no longer busy with them. Crossing into a new epoch always re-syncs.
 */
export function advancePlayback(pb: Playback, nowMs: number, visitor: Point2 | null): Playback {
  const nowSec = nowMs / 1000
  if (epochOf(nowSec) !== pb.anchor.epoch) return startPlayback(pb.input, nowMs)

  const radius = pb.input.pack.perception.noticeRadius
  const distance = visitor ? Math.hypot(visitor.x - pb.state.pos.x, visitor.z - pb.state.pos.z) : Infinity
  if (!pb.local && distance <= radius) pb.local = true
  stepTo(pb, nowSec, pb.local ? visitor : null)

  if (pb.local) {
    const gone = !visitor || Math.hypot(visitor.x - pb.state.pos.x, visitor.z - pb.state.pos.z) > radius * 1.5
    if (gone && pb.state.intention.targetId !== 'visitor') return startPlayback(pb.input, nowMs)
  }
  return pb
}
