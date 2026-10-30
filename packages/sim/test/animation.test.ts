import { describe, expect, it } from 'vitest'
import type { AnimationSlot } from '@forkling/schema'
import { resolveSlot } from '../src/animation.ts'

const slots = (...s: AnimationSlot[]) => new Set<AnimationSlot>(s)

describe('resolveSlot', () => {
  it('returns the slot itself when the pack has it', () => {
    expect(resolveSlot('run', slots('idle', 'walk', 'run'))).toBe('run')
  })

  it('falls back along the chain: run to walk to idle', () => {
    expect(resolveSlot('run', slots('idle', 'walk'))).toBe('walk')
    expect(resolveSlot('run', slots('idle'))).toBe('idle')
  })

  it('falls back from sleep to sit to idle', () => {
    expect(resolveSlot('sleep', slots('idle', 'sit'))).toBe('sit')
    expect(resolveSlot('sleep', slots('idle'))).toBe('idle')
  })

  it('returns null when nothing in the chain exists, as for a pack with no animations', () => {
    expect(resolveSlot('walk', slots())).toBeNull()
    expect(resolveSlot('climb', slots('walk'))).toBeNull()
  })

  it('does not let a species climb without a climb clip', () => {
    expect(resolveSlot('climb', slots('idle', 'jump'))).not.toBe('climb')
  })
})
