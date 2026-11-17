import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BudgetLedger, Goals, Interests, MindState, type LongGoalReview } from '@forkling/schema'
import type { LlmClient, LlmRequest, LlmResult } from '../src/llm.ts'
import { buildGoalReviewUser } from '../src/prompts/goal-review.ts'
import { appendTimeline } from '../src/stream.ts'
import { makeAsk } from '../src/tick/ask.ts'
import type { Tick } from '../src/tick/context.ts'
import { goalReviewStep } from '../src/tick/weekly.ts'

const NOW = '2026-11-16T14:00:00Z'
const usage = { input: 4_000, cacheRead: 0, cacheWrite: 0, output: 600 }
const answer = (over: Partial<LongGoalReview> = {}): LongGoalReview => ({ action: 'continue', text: null, reason: 'It is still what I want.', ...over })
const GOAL = { text: 'Learn how lidar reveals buried structures.', reason: 'The finds keep pulling at me.', setAt: '2026-11-11T17:13:17Z', reviewedAt: '2026-11-11T17:13:17Z' }

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goal-review-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function tick(reply: LongGoalReview | null | 'throw', over: Record<string, unknown> = {}, mind: Record<string, unknown> = {}, long: Record<string, unknown> | null = GOAL) {
  const seen: LlmRequest[] = []
  const llm = {
    async complete(request: LlmRequest) {
      seen.push(request)
      if (reply === 'throw') throw new Error('network down')
      return { parsed: reply, usage, stopReason: reply ? 'end_turn' : 'refusal' } as LlmResult<unknown>
    },
  } as unknown as LlmClient
  const t = {
    dir,
    today: '2026-11-16',
    tz: 'Europe/Stockholm',
    nowIso: NOW,
    nowMs: Date.parse(NOW),
    asleep: false,
    deps: { llm },
    system: 'the seed',
    notes: [] as string[],
    parts: [] as string[],
    attempts: [] as Tick['attempts'],
    calls: [] as Tick['calls'],
    remember: [] as Tick['remember'],
    budget: BudgetLedger.parse({ month: '2026-11' }),
    mind: MindState.parse(mind),
    goals: Goals.parse(long ? { long } : {}),
    interests: Interests.parse({ version: 2, topics: { lidar: { weight: 62, firstSeen: '2026-11-10T07:00:00Z', lastFed: '2026-11-14T07:00:00Z', history: [] } } }),
    ...over,
  } as unknown as Tick
  t.ask = makeAsk(t)
  return { t, seen }
}

describe('the long goal is looked at every 3 days (and not only on Sunday)', () => {
  it('makes one Sonnet call at medium effort when the goal was last reviewed 3 days ago, with the seed first', async () => {
    const { t, seen } = tick(answer())
    await goalReviewStep(t)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ kind: 'goalreview', model: 'claude-sonnet-5-5', effort: 'medium', system: 'the seed' })
  })

  it('makes no call when it was reviewed less than 3 days ago, while asleep, with no long goal, or in a dry run', async () => {
    for (const [over, mind, long] of [
      [{}, {}, { ...GOAL, reviewedAt: '2026-11-14T15:00:00Z' }],
      [{ asleep: true }, {}, GOAL],
      [{}, {}, null],
      [{ deps: { llm: {} as LlmClient, dryRun: true } }, {}, GOAL],
    ] as const) {
      const { t, seen } = tick(answer(), over, mind, long as Record<string, unknown> | null)
      await goalReviewStep(t)
      expect(seen).toHaveLength(0)
    }
  })

  it('keeping the goal marks it reviewed now, so the next look is 3 days away', async () => {
    const { t } = tick(answer({ action: 'continue' }))
    await goalReviewStep(t)
    expect(t.goals.long).toEqual({ ...GOAL, reviewedAt: NOW })
  })

  it('changing the goal writes the new one, in its own words, with the reason in memory', async () => {
    const { t } = tick(answer({ action: 'change', text: 'Make one silly toy about a thing the internet laughed at.', reason: 'Lidar has had five days.' }))
    await goalReviewStep(t)
    expect(t.goals.long).toMatchObject({ text: 'Make one silly toy about a thing the internet laughed at.', reviewedAt: NOW, setAt: NOW })
    expect(t.remember.map((r) => r.text).join(' ')).toMatch(/Lidar has had five days/)
  })

  it('dropping the goal removes it and says why', async () => {
    const { t } = tick(answer({ action: 'drop', reason: 'I was only circling it.' }))
    await goalReviewStep(t)
    expect(t.goals.long).toBeUndefined()
    expect(t.remember.map((r) => r.text).join(' ')).toMatch(/I was only circling it/)
  })

  it('a call that gives nothing waits 30 minutes before trying again, and leaves the goal as it was', async () => {
    for (const reply of [null, 'throw'] as const) {
      const { t } = tick(reply)
      await goalReviewStep(t)
      expect(t.goals.long).toEqual(GOAL)
      expect(t.mind.goalReviewTriedAt).toBe(NOW)
    }
    const soon = tick(answer(), { nowIso: '2026-11-16T14:10:00Z', nowMs: Date.parse('2026-11-16T14:10:00Z') }, { goalReviewTriedAt: NOW })
    await goalReviewStep(soon.t)
    expect(soon.seen).toHaveLength(0)
  })

  it('runs early, a day after the last review, when the goal topic is closed for writing, and only once that day', async () => {
    const reviewed = { ...GOAL, reviewedAt: '2026-11-15T14:00:00Z' }
    const { t, seen } = tick(answer({ action: 'change', text: 'Make one sketch about lidar light.', reason: 'The pages are closed for now.' }), {}, { goalReviewEarly: { date: '2026-11-16', closed: 3 } }, reviewed)
    await goalReviewStep(t)
    expect(seen).toHaveLength(1)
    expect(t.goals.long?.text).toBe('Make one sketch about lidar light.')
    expect(t.mind.goalReviewEarly).toBeUndefined()
    expect(t.mind.goalReviewEarlyOn).toBe('2026-11-16')
    // The same day it is flagged again: no second early review.
    t.mind.goalReviewEarly = { date: '2026-11-16', closed: 3 }
    t.goals.long = { ...t.goals.long!, reviewedAt: '2026-11-15T14:00:00Z' }
    await goalReviewStep(t)
    expect(seen).toHaveLength(1)
  })

  it('ignores an early flag from another day', async () => {
    const { t, seen } = tick(answer(), {}, { goalReviewEarly: { date: '2026-11-15', closed: 3 } }, { ...GOAL, reviewedAt: '2026-11-15T14:00:00Z' })
    await goalReviewStep(t)
    expect(seen).toHaveLength(0)
  })

  it('a failed early try keeps the flag for the next try', async () => {
    const { t } = tick(null, {}, { goalReviewEarly: { date: '2026-11-16', closed: 3 } }, { ...GOAL, reviewedAt: '2026-11-15T14:00:00Z' })
    await goalReviewStep(t)
    expect(t.mind.goalReviewEarly).toEqual({ date: '2026-11-16', closed: 3 })
    expect(t.mind.goalReviewEarlyOn).toBeUndefined()
  })

  it('does not run in the same tick as a weekly review that has just looked at the goal', async () => {
    const { t, seen } = tick(answer(), { parts: ['weekly review'] })
    await goalReviewStep(t)
    expect(seen).toHaveLength(0)
  })
})

describe('the goal review prompt', () => {
  it('asks the weekly review\'s own question about the long goal, and nothing else about who Merge is', async () => {
    const user = buildGoalReviewUser({ localTime: 'Monday 2026-11-16 15:00', timeZone: 'Europe/Stockholm', longGoal: { text: GOAL.text, reason: GOAL.reason, since: '2026-11-11', reviewed: '2026-11-11' }, steps: ['2026-11-15 write Leaf area index: more of the same'], interests: ['lidar (62)'] })
    expect(user).toContain('## Your long goal')
    expect(user).toContain(`${GOAL.text} (since 2026-11-11). Why: ${GOAL.reason}`)
    expect(user).toContain('last looked at on 2026-11-11')
    expect(user).toContain('continue, finish, drop or change (with the new text), and why')
    expect(user).toContain('<data source="steps">')
    expect(user).toContain('lidar (62)')
    expect(user).not.toMatch(/about\.md|renames|request:/)
    await expect(user).toMatchFileSnapshot('./golden/user-goal-review.txt')
  })
})
