import { describe, expect, it } from 'vitest'
import { SpeciesPack, type MicroBehavior } from '@forkling/schema'
import blobJson from './fixtures/blob.species.json'
import { resolveSlot } from '../src/animation.ts'
import { runHeadless, type HeadlessOptions } from '../src/headless.ts'

const blob = SpeciesPack.parse(blobJson)

const simulate = (opts: Omit<HeadlessOptions, 'pack'> & { pack?: SpeciesPack }) => runHeadless({ pack: blob, ...opts })

describe('stepForkling with the blob pack (no animations, no behaviors)', () => {
  const run = simulate({ seed: 1, startHour: 10, seconds: 600, visitor: { arrive: 120, leave: 300 } })

  it('keeps every need within 0 and 100', () => {
    expect(run.needsOutOfRange).toBe(0)
  })

  it('never goes 3 seconds without progress while moving', () => {
    expect(run.maxStuckSteps).toBeLessThan(30)
  })

  it('stays on walkable ground the whole time', () => {
    expect(run.offGrid).toBe(0)
  })

  it('does a variety of things in 10 minutes', () => {
    expect(run.intentionTypes.size).toBeGreaterThanOrEqual(4)
  })

  it('only ever raises a need by performing an action that satisfies it', () => {
    expect(run.illegalRises).toEqual([])
  })

  it('produces valid intentions with a reason in the pack voice', () => {
    expect(run.badIntentions).toBe(0)
  })

  it('re-decides the moment it notices the visitor', () => {
    expect(run.noticeStep).not.toBeNull()
    expect(run.noticeStep!.startedAt).toBeCloseTo(run.noticeStep!.time, 5)
  })

  it('is deterministic for a seed and differs between seeds', () => {
    const again = simulate({ seed: 1, startHour: 10, seconds: 600, visitor: { arrive: 120, leave: 300 } })
    expect(again.trace).toEqual(run.trace)
    const other = simulate({ seed: 2, startHour: 10, seconds: 600, visitor: { arrive: 120, leave: 300 } })
    expect(other.trace).not.toEqual(run.trace)
  })

  it('resolves every slot it asks for to nothing, as a pack without animations must', () => {
    for (const slot of run.slots) expect(resolveSlot(slot as never, new Set())).toBeNull()
  })

  it('reaches its spot targets: it eats at the food spot', () => {
    expect(run.intentionTypes.has('eat')).toBe(true)
  })
})

describe('micro-behaviors', () => {
  const behaviors: MicroBehavior[] = [
    { id: 'wiggle', when: 'idle', chance: 0.6, durationSec: 1.5 },
    { id: 'tuck', when: 'beforeSleep', chance: 1, durationSec: 1.2 },
    { id: 'yawn', when: 'afterWake', chance: 1, durationSec: 1 },
    { id: 'zoom', when: 'dusk', chance: 1, durationSec: 1 },
  ]

  it('plays idle, before-sleep and after-wake behaviors', () => {
    const run = simulate({ seed: 3, startHour: 10, seconds: 600, behaviors })
    const ids = new Set(run.micros.map((m) => m.id))
    expect(ids.has('wiggle')).toBe(true)
    expect(ids.has('tuck')).toBe(true)
    expect(ids.has('yawn')).toBe(true)
  })

  it('plays dusk behaviors only at dusk', () => {
    const day = simulate({ seed: 3, startHour: 10, seconds: 300, behaviors })
    expect(day.micros.some((m) => m.id === 'zoom')).toBe(false)
    const dusk = simulate({ seed: 3, startHour: 18.5, seconds: 300, behaviors })
    expect(dusk.micros.some((m) => m.id === 'zoom')).toBe(true)
  })

  it('keeps the invariants with behaviors running', () => {
    const run = simulate({ seed: 4, startHour: 18.8, seconds: 600, behaviors, visitor: { arrive: 60, leave: 200 } })
    expect(run.needsOutOfRange).toBe(0)
    expect(run.offGrid).toBe(0)
    expect(run.illegalRises).toEqual([])
    expect(run.maxStuckSteps).toBeLessThan(30)
  })
})

describe('a visitor never raises needs by themselves', () => {
  it('leaves needs alone while a visitor stands right next to a forkling that ignores them', () => {
    const pack = SpeciesPack.parse({
      ...blobJson,
      // Only the ignore action is available near a visitor, and it satisfies nothing.
      actions: blob.actions.filter((a) => a.id !== 'greet'),
      weights: {},
    })
    const run = simulate({ seed: 5, startHour: 10, seconds: 300, pack, visitor: { arrive: 20, leave: 280 } })
    expect(run.noticeStep).not.toBeNull()
    expect(run.illegalRises).toEqual([])
  })
})
