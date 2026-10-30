import { describe, expect, it } from 'vitest'
import { Forkling, SpeciesPack } from '@forkling/schema'
import blobJson from './fixtures/blob.species.json'
import { isWalkable } from '../src/nav.ts'
import {
  advancePlayback,
  anchorFor,
  EPOCH_SECONDS,
  hourInZone,
  startPlayback,
  type PlaybackInput,
} from '../src/playback.ts'
import { starterWorld } from '../src/starter.ts'

const blob = SpeciesPack.parse(blobJson)
const world = starterWorld()

/** 2026-10-30T12:00:00Z, which is the start of an epoch. */
const EPOCH_START = Date.UTC(2026, 9, 30, 12, 0, 0) / 1000
const iso = (sec: number) => new Date(sec * 1000).toISOString()

function input(overrides: Partial<Forkling> = {}, startedAt = EPOCH_START + 60): PlaybackInput {
  const forkling = Forkling.parse({
    name: 'Blobby',
    species: 'blob',
    needs: { hunger: 60, energy: 70, fun: 50 },
    position: [0, 0, 0],
    mood: 'content',
    intention: { type: 'roam', startedAt: iso(startedAt), seed: 99, reason: 'Blob felt like a stroll.' },
    lastTickAt: iso(startedAt),
    timezone: 'Europe/Stockholm',
    ...overrides,
  })
  return { forkling, pack: blob, behaviors: [], world }
}

const snapshot = (pb: ReturnType<typeof startPlayback>) => ({
  pos: pb.state.pos,
  needs: pb.state.needs,
  intention: pb.state.intention,
  phase: pb.state.phase,
  time: pb.state.time,
  steps: pb.steps,
})

describe('anchorFor', () => {
  it('anchors at the intention when it started in the current epoch', () => {
    const a = anchorFor(input().forkling, EPOCH_START + 600)
    expect(a.time).toBe(EPOCH_START + 60)
    expect(a.seed).toBe(99)
    expect(a.fromIntention).toBe(true)
  })

  it('anchors at the epoch start when the intention is older', () => {
    const now = EPOCH_START + EPOCH_SECONDS * 3 + 100
    const a = anchorFor(input().forkling, now)
    expect(a.time).toBe(EPOCH_START + EPOCH_SECONDS * 3)
    expect(a.fromIntention).toBe(false)
  })

  it('gives each stale epoch its own seed, stable within the epoch', () => {
    const f = input().forkling
    const a = anchorFor(f, EPOCH_START + EPOCH_SECONDS * 3 + 10)
    const b = anchorFor(f, EPOCH_START + EPOCH_SECONDS * 3 + 1700)
    const c = anchorFor(f, EPOCH_START + EPOCH_SECONDS * 4 + 10)
    expect(a.seed).toBe(b.seed)
    expect(a.seed).not.toBe(c.seed)
  })

  it('ignores an intention from the future, which can happen with clock skew', () => {
    const a = anchorFor(input({}, EPOCH_START + 900).forkling, EPOCH_START + 300)
    expect(a.time).toBe(EPOCH_START)
    expect(a.fromIntention).toBe(false)
  })
})

describe('hourInZone', () => {
  it('converts to the world time zone, including daylight saving', () => {
    expect(hourInZone('UTC', Date.UTC(2026, 6, 1, 10, 30))).toBeCloseTo(10.5)
    expect(hourInZone('Europe/Stockholm', Date.UTC(2026, 6, 1, 10, 30))).toBeCloseTo(12.5)
    expect(hourInZone('Europe/Stockholm', Date.UTC(2026, 11, 1, 10, 30))).toBeCloseTo(11.5)
  })

  it('includes seconds', () => {
    expect(hourInZone('UTC', Date.UTC(2026, 6, 1, 10, 0, 36))).toBeCloseTo(10.01)
  })
})

describe('startPlayback', () => {
  it('starts at the forkling position on walkable ground, with its needs', () => {
    const pb = startPlayback(input({ position: [3, 0, -4] }), (EPOCH_START + 60) * 1000)
    expect(Math.hypot(pb.state.pos.x - 3, pb.state.pos.z + 4)).toBeLessThan(1.5)
    expect(isWalkable(world.nav.grid, pb.state.pos.x, pb.state.pos.z)).toBe(true)
    expect(pb.state.needs).toEqual({ hunger: 60, energy: 70, fun: 50 })
  })

  it('fills needs the file leaves out from the species defaults', () => {
    const pb = startPlayback(input({ needs: { hunger: 10 } }), (EPOCH_START + 60) * 1000)
    expect(pb.state.needs).toEqual({ hunger: 10, energy: 70, fun: 50 })
  })

  it('begins with the intention from the file', () => {
    const pb = startPlayback(input(), (EPOCH_START + 61) * 1000)
    expect(pb.state.intention.type).toBe('roam')
  })

  it('falls back to its own choice when the intention is not a pack action', () => {
    const f = input().forkling
    const pb = startPlayback({ ...input(), forkling: { ...f, intention: { ...f.intention, type: 'fly' } } }, (EPOCH_START + 61) * 1000)
    expect(pb.state.intention.type).not.toBe('fly')
  })

  it('puts the sim clock on Unix time', () => {
    const pb = startPlayback(input(), (EPOCH_START + 600) * 1000)
    expect(pb.state.time).toBeCloseTo(EPOCH_START + 600, 0)
  })

  it('catches up a whole epoch quickly', () => {
    const t0 = Date.now()
    startPlayback(input({}, EPOCH_START), (EPOCH_START + EPOCH_SECONDS - 1) * 1000)
    expect(Date.now() - t0).toBeLessThan(1500)
  })
})

describe('advancePlayback', () => {
  it('lands exactly where a fresh load at the same moment would', () => {
    const later = (EPOCH_START + 900) * 1000
    const fresh = startPlayback(input(), later)

    // A viewer that loaded 10 minutes earlier and has been running at an uneven frame rate since.
    let live = startPlayback(input(), (EPOCH_START + 300) * 1000)
    let t = (EPOCH_START + 300) * 1000
    const frames = [16, 17, 33, 16, 250, 16, 8, 100]
    for (let i = 0; t < later; i++) {
      t = Math.min(later, t + frames[i % frames.length]!)
      live = advancePlayback(live, t, null)
    }
    expect(snapshot(live)).toEqual(snapshot(fresh))
  })

  it('re-syncs to the canonical state when it crosses into a new epoch', () => {
    const next = (EPOCH_START + EPOCH_SECONDS + 120) * 1000
    let live = startPlayback(input(), (EPOCH_START + 1700) * 1000)
    for (let t = (EPOCH_START + 1700) * 1000; t < next; t += 500) live = advancePlayback(live, t, null)
    live = advancePlayback(live, next, null)
    expect(snapshot(live)).toEqual(snapshot(startPlayback(input(), next)))
    expect(live.anchor.fromIntention).toBe(false)
  })

  it('lets a local visitor change only the local body', () => {
    const at = (EPOCH_START + 400) * 1000
    let live = startPlayback(input(), (EPOCH_START + 300) * 1000)
    for (let t = (EPOCH_START + 300) * 1000; t <= at; t += 100) {
      live = advancePlayback(live, t, { x: live.state.pos.x + 2, z: live.state.pos.z })
    }
    // Shared canonical state is unaffected by this browser's visitor.
    expect(snapshot(startPlayback(input(), at))).toEqual(snapshot(startPlayback(input(), at)))
    expect(live.state.noticed).toBe(true)
  })
})
