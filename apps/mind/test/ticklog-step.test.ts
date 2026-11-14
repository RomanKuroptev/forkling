import { TickStep, type Goals } from '@forkling/schema'
import { describe, expect, it } from 'vitest'
import { stepOf } from '../src/ticklog.ts'

const goalsWith = (targetId: string) =>
  ({
    now: { index: 0, startedAt: '2026-11-17T11:39:00.000Z', until: '2026-11-17T12:09:00.000Z' },
    today: { steps: [{ verb: 'tend', targetId }] },
  }) as unknown as Goals

describe('the step the tick log records', () => {
  it('keeps a short target as it is', () => {
    expect(stepOf(goalsWith('home'))?.targetId).toBe('home')
  })

  // A plan step's target is not capped, but the tick log's is (60). A long one used to make logTick throw on every tick
  // until the step ended (found in the W5 test run, 17 Nov).
  it('cuts a long target so the line still fits the tick log schema', () => {
    const step = stepOf(goalsWith('x'.repeat(200)))
    expect(step?.targetId?.length).toBeLessThanOrEqual(60)
    expect(() => TickStep.parse(step)).not.toThrow()
  })
})
