import type { Forkling, MicroBehavior, SpeciesPack } from '@forkling/schema'
import { createForkling, STEP, stepForkling, type ForklingState, type StepContext } from './forkling.ts'
import { nearestWalkable, type Point2 } from './nav.ts'
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
}

/** Where playback starts: a moment, and the seed that makes everything after it deterministic. */
export interface Anchor {
  /** Unix seconds. */
  time: number
  seed: number
  epoch: number
  /** True when anchored at the repo intention, false when restarting at an epoch boundary. */
  fromIntention: boolean
}

/** A body being played back. Every viewer that plays the same input steps on the same grid of instants. */
export interface Playback {
  input: PlaybackInput
  anchor: Anchor
  state: ForklingState
  /** Fixed steps taken since the anchor. */
  steps: number
  ctx: StepContext
  spotMinute: number
  hourCache: { minute: number; hour: number }
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

export function anchorFor(forkling: Forkling, nowSec: number): Anchor {
  const epoch = epochOf(nowSec)
  const started = Date.parse(forkling.intention.startedAt) / 1000
  if (started <= nowSec && epochOf(started) === epoch) {
    return { time: started, seed: forkling.intention.seed, epoch, fromIntention: true }
  }
  return { time: epoch * EPOCH_SECONDS, seed: mixSeed(forkling.intention.seed, epoch), epoch, fromIntention: false }
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

function stepOnce(pb: Playback, visitor: Point2 | null): void {
  const { pack, world } = pb.input
  const t = pb.anchor.time + (pb.steps + 1) * STEP
  pb.ctx.timeOfDay = hourAt(pb, t)
  const minute = Math.floor(t / 60)
  if (minute !== pb.spotMinute) {
    pb.spotMinute = minute
    pb.ctx.spots = collectSpots(pack, world.cfg, world.nav, world.spawn, sunDirection(pb.ctx.timeOfDay))
  }
  pb.ctx.visitor = visitor
  stepForkling(pb.state, STEP, pb.ctx)
  pb.steps++
}

function stepTo(pb: Playback, nowSec: number, visitor: Point2 | null): void {
  const target = Math.floor((nowSec - pb.anchor.time) / STEP + 1e-9)
  while (pb.steps < target) stepOnce(pb, visitor)
}

/**
 * The canonical body at `nowMs`: start from the repo state at the anchor and catch up with no visitor. Every viewer
 * that calls this at the same moment gets the same result.
 */
export function startPlayback(input: PlaybackInput, nowMs: number): Playback {
  const { forkling, pack, behaviors, world } = input
  const anchor = anchorFor(forkling, nowMs / 1000)
  const [x, , z] = forkling.position
  const start = nearestWalkable(world.nav.grid, { x, z }, 25) ?? { x: world.spawn.x, z: world.spawn.z }
  const state = createForkling(pack, behaviors, anchor.seed, start, {
    time: anchor.time,
    needs: forkling.needs,
    firstAction: forkling.intention.type,
  })
  const pb: Playback = {
    input,
    anchor,
    state,
    steps: 0,
    ctx: { grid: world.nav.grid, visitor: null, timeOfDay: 0, spots: {} },
    spotMinute: -1,
    hourCache: { minute: -1, hour: 0 },
  }
  stepTo(pb, nowMs / 1000, null)
  return pb
}

/**
 * Run a live body forward to `nowMs` on the shared step grid. The visitor is this browser's own and only nudges the
 * local body. Crossing into a new epoch re-syncs to the canonical state.
 */
export function advancePlayback(pb: Playback, nowMs: number, visitor: Point2 | null): Playback {
  const nowSec = nowMs / 1000
  if (epochOf(nowSec) !== pb.anchor.epoch) return startPlayback(pb.input, nowMs)
  stepTo(pb, nowSec, visitor)
  return pb
}
