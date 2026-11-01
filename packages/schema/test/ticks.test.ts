import { describe, expect, it } from 'vitest'
import { Health, TICK_KEEP_DAYS, TickLine } from '../src/ticks.ts'

const line = {
  at: '2026-11-03T09:00:00.000Z',
  engine: 'v0.7.3',
  asleep: false,
  triggers: [{ kind: 'stepDone', score: 0.4 }],
  think: null,
  calls: [],
  notes: ['no trigger, no call'],
  stepBefore: null,
  stepAfter: { index: 0, verb: 'watch', targetId: 'sunny-rock', startedAt: '2026-11-03T09:00:00.000Z', until: '2026-11-03T09:30:00.000Z' },
  planId: '2026-11-03:ab12cd',
  needs: { hunger: 70, energy: 80 },
  mood: 'content',
  wrote: [],
  summary: '',
}

describe('TickLine', () => {
  it('accepts a quiet tick, with no drift notes yet', () => {
    const parsed = TickLine.parse(line)
    expect(parsed.drift).toEqual([])
    expect(parsed.think).toBeNull()
  })

  it('records a call that did not happen, and why', () => {
    const parsed = TickLine.parse({ ...line, think: 'decide', calls: [{ kind: 'decide', model: 'claude-haiku-5-5', usd: 0, ok: false, error: 'monthly budget reached' }] })
    expect(parsed.calls[0]).toMatchObject({ ok: false, error: 'monthly budget reached' })
  })

  it('rejects a kind of thought it does not know', () => {
    expect(TickLine.safeParse({ ...line, think: 'wonder' }).success).toBe(false)
  })

  it('keeps two weeks of days', () => {
    expect(TICK_KEEP_DAYS).toBe(14)
  })
})

describe('Health', () => {
  const quota = { used: 0, max: 4 }
  const health = {
    updatedAt: '2026-11-03T09:00:00.000Z',
    engine: 'v0.7.3',
    date: '2026-11-03',
    lastTick: { at: '2026-11-03T09:00:00.000Z', asleep: false, summary: 'quiet', think: null, triggers: [], callsFailed: 0 },
    plan: { planId: null, stepsLeft: 0, current: null, lastReplanAt: null, idleMinutes: 0 },
    today: { ticks: 1, decideCalls: 0, callsByKind: {}, triggersByKind: {}, failures: 0, rejections: 0, stepsStarted: {}, longestGapMinutes: 0 },
    quotas: { readings: quota, creative: quota, photos: quota, builds: { used: 0, max: 1 }, codeThisWeek: { used: 0, max: 2 } },
    needsCritical: {},
    mood: { label: 'content', minutes: 0 },
    spend: { monthUsd: 0, capUsd: 10, paceUsd: 0.3 },
    openBuild: null,
    warnings: [],
  }

  it('parses a healthy summary', () => {
    expect(Health.parse(health).warnings).toEqual([])
  })

  it('needs every part, so a reader can rely on the shape', () => {
    const { quotas: _q, ...rest } = health
    expect(Health.safeParse(rest).success).toBe(false)
  })
})
