import { describe, expect, it } from 'vitest'
import { StreamEntry } from '@forkling/schema'
import type { PlanStep } from '@forkling/schema'
import { landMindStep } from '../src/tick/mind-step.ts'
import { dayLines } from '../src/tick/sleep.ts'
import type { Tick } from '../src/tick/context.ts'

const entry = (n: number, over: Record<string, unknown> = {}): StreamEntry => StreamEntry.parse({ id: `2026-11-16#${n}`, at: `2026-11-16T10:0${n}:00Z`, kind: 'event', text: `line ${n}`, ...over })

describe('engine lines stay out of what the diary and the reflection are given', () => {
  it('drops a line the code flagged as an engine report, and keeps the rest in order', () => {
    const stream = [entry(1), entry(2, { engine: true, text: 'My tend of Home was turned down (a label ran 131 characters, not 120), so nothing changed.' }), entry(3, { kind: 'thought', text: 'a thought' }), entry(4, { kind: 'made', text: 'wrote a page' })]
    expect(dayLines(stream).map((e) => e.text)).toEqual(['line 1', 'a thought', 'wrote a page'])
  })

  it('still reads and writes the flag, so the site and the log keep the line', () => {
    expect(entry(1, { engine: true }).engine).toBe(true)
    expect(entry(1).engine).toBeUndefined()
  })
})

describe('a step that names a place that does not exist rests, and says so in words that are true', () => {
  const tick = () => {
    const t = { places: [{ id: 'home' }], remember: [], justNow: [], notes: [], parts: [], moodEvents: [], nowIso: '2026-11-16T10:00:00Z' } as unknown as Tick
    return t
  }
  const step = (verb: string, targetId: string): PlanStep => ({ verb, targetId, reason: 'I want to.', minutes: 30 }) as PlanStep

  it('puts it in the tick log and in what it is told next, never as a line of its day (no "not built yet")', () => {
    for (const verb of ['tend', 'revisit', 'expand']) {
      const t = tick()
      landMindStep(t, step(verb, 'the-attic'), 0)
      expect(t.remember).toEqual([])
      expect(t.notes.join(' ')).toMatch(/"the-attic" is not a place that exists yet/)
      expect(t.notes.join(' ')).not.toMatch(/not built/)
      expect(t.justNow.join(' ')).toMatch(/"the-attic": it is not a place yet/)
    }
  })
})
