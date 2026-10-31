import { describe, expect, it } from 'vitest'
import { Goals } from '@forkling/schema'
import { bubbleLines } from '../src/forkling/thoughts.ts'

const goals = Goals.parse({
  long: { text: 'Make the sunny rock mine.', reason: 'It is the warmest place.', setAt: '2026-11-03T07:10:00Z', reviewedAt: '2026-11-03T07:10:00Z' },
  today: {
    date: '2026-11-03',
    steps: [
      { verb: 'watch', targetId: 'sunny-rock', reason: 'I want the best seat on the beach.', minutes: 30 },
      { verb: 'explore', position: [3, 4], reason: 'There is shoreline I have not seen.', minutes: 25 },
    ],
    reason: 'A day for claiming things.',
  },
  now: { index: 0, startedAt: '2026-11-03T09:00:00Z', until: '2026-11-03T09:30:00Z' },
})
const intention = { type: 'watch', startedAt: '2026-11-03T09:00:00Z', seed: 1, reason: 'The rock catches the sun first.' }
const at = (iso: string) => Date.parse(iso)

describe('bubbleLines', () => {
  it('says nothing for a forkling with no goals yet', () => {
    expect(bubbleLines({}, intention, false, at('2026-11-03T09:10:00Z'))).toBeNull()
  })

  it('shows the long goal, the current step and why, in its own words', () => {
    const lines = bubbleLines(goals, intention, false, at('2026-11-03T09:10:00Z'))!
    expect(lines.map((l) => l.kind)).toEqual(['goal', 'step', 'reason'])
    expect(lines[0]!.text).toBe('Make the sunny rock mine.')
    expect(lines[1]!.text).toBe('watch at sunny-rock: I want the best seat on the beach.')
    expect(lines[2]!.text).toBe('The rock catches the sun first.')
  })

  it('drops the step once its time is up, so a stale plan is not shown as current', () => {
    const lines = bubbleLines(goals, intention, false, at('2026-11-03T09:40:00Z'))!
    expect(lines.map((l) => l.kind)).toEqual(['goal', 'reason'])
  })

  it('names a place instead of an object when the step has a position', () => {
    const second = Goals.parse({ ...goals, now: { index: 1, startedAt: '2026-11-03T09:30:00Z', until: '2026-11-03T09:55:00Z' } })
    const lines = bubbleLines(second, intention, false, at('2026-11-03T09:40:00Z'))!
    expect(lines[1]!.text).toBe('explore somewhere near 3, 4: There is shoreline I have not seen.')
  })

  it('only dreams while asleep', () => {
    expect(bubbleLines(goals, intention, true, at('2026-11-03T09:10:00Z'))).toEqual([{ kind: 'sleep', text: 'zzz' }])
    expect(bubbleLines({}, intention, true, at('2026-11-03T09:10:00Z'))).toEqual([{ kind: 'sleep', text: 'zzz' }])
  })
})
