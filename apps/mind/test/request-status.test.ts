import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MindState } from '@forkling/schema'
import { requestStatusStep } from '../src/tick/requests.ts'
import type { Tick } from '../src/tick/context.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'req-status-'))
  mkdirSync(join(dir, 'self/requests'), { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const put = (date: string, status: string, title = 'A reader') => writeFileSync(join(dir, `self/requests/${date}.md`), ['---', 'kind: tool', `title: ${title}`, `status: ${status}`, '---', 'Could I read one more site?', ''].join('\n'))
const tick = (nowMs: number, mind: Record<string, unknown> = {}) => ({ dir, nowMs, nowIso: new Date(nowMs).toISOString(), mind: MindState.parse(mind), remember: [] as Tick['remember'], parts: [] as string[] }) as unknown as Tick
const T0 = Date.parse('2026-11-23T10:00:00Z')
const carry = (t: Tick) => ({ requestStatuses: t.mind.requestStatuses })

describe('a change of status is a stream event (spec v4 8)', () => {
  it('the first look only records what is there, with no event', () => {
    put('2026-11-22', 'open')
    const t = tick(T0)
    requestStatusStep(t)
    expect(t.remember).toEqual([])
    expect(t.mind.requestStatuses).toEqual({ '2026-11-22': 'open' })
  })
  it('a status Roman changed becomes one event of importance 6, once', () => {
    put('2026-11-22', 'open')
    const t = tick(T0)
    requestStatusStep(t)
    put('2026-11-22', 'yes')
    const later = tick(T0 + 11 * 60_000, carry(t))
    requestStatusStep(later)
    expect(later.remember).toHaveLength(1)
    expect(later.remember[0]).toMatchObject({ kind: 'event', importance: 6 })
    expect(later.remember[0]!.text).toMatch(/A reader/)
    expect(later.remember[0]!.text).toMatch(/yes/)
    const again = tick(T0 + 30 * 60_000, carry(later))
    requestStatusStep(again)
    expect(again.remember).toEqual([])
  })
  it('writes nothing to the state of the mind when nothing changed', () => {
    put('2026-11-22', 'open')
    const t = tick(T0)
    requestStatusStep(t)
    const same = tick(T0 + 60_000, carry(t))
    const before = JSON.stringify(same.mind)
    requestStatusStep(same)
    expect(JSON.stringify(same.mind)).toBe(before)
  })
  it('a new request is not a change', () => {
    put('2026-11-22', 'open')
    const t = tick(T0)
    requestStatusStep(t)
    put('2026-11-29', 'open', 'Another')
    const later = tick(T0 + 11 * 60_000, carry(t))
    requestStatusStep(later)
    expect(later.remember).toEqual([])
    expect(later.mind.requestStatuses).toEqual({ '2026-11-22': 'open', '2026-11-29': 'open' })
  })
})
