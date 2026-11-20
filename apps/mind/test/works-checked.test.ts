import { describe, expect, it } from 'vitest'
import { WorkMeta } from '@forkling/schema'
import { checkedWorks } from '../src/builds/works.ts'

const work = (id: string, made: string, over: Partial<WorkMeta> = {}) =>
  WorkMeta.parse({ id, title: id.replace(/-/g, ' '), kind: 'art', about: 'a thing', interest: null, made, status: 'shelf', size: 'sketch', ...over })

const NOW = Date.parse('2026-11-20T12:00:00Z')

/** Issue #400: Merge kept planning to "run" sketches the work check had already run. It is told what the check found. */
describe('checkedWorks: the work check result of the recent works', () => {
  it('says a kept or put-away work ran and drew, and a scrap did not pass, with its reason', () => {
    const works = [
      work('counter-toy', '2026-11-20T09:00:00Z'),
      work('rain-grid', '2026-11-19T09:00:00Z', { status: 'scrap', scrapReason: 'uncaught error: x is not defined' }),
      work('old-loom', '2026-11-18T09:00:00Z', { status: 'retired', retireReason: 'done with it', size: 'full' }),
    ]
    expect(checkedWorks(works, { nowMs: NOW, timezone: 'Europe/Stockholm' })).toEqual([
      { title: 'counter toy', size: 'sketch', made: '2026-11-20', ran: true },
      { title: 'rain grid', size: 'sketch', made: '2026-11-19', ran: false, why: 'uncaught error: x is not defined' },
      { title: 'old loom', size: 'full', made: '2026-11-18', ran: true },
    ])
  })

  it('shows only the last 7 days, newest first, at most 6', () => {
    const works = [work('too-old', '2026-11-12T09:00:00Z'), ...Array.from({ length: 8 }, (_, n) => work(`w-${n}`, `2026-11-1${4 + (n % 6)}T0${n}:00:00Z`))]
    const out = checkedWorks(works, { nowMs: NOW, timezone: 'Europe/Stockholm' })
    expect(out).toHaveLength(6)
    expect(out.map((w) => w.title)).not.toContain('too old')
    expect([...out].sort((a, b) => b.made.localeCompare(a.made))).toEqual(out)
  })

  it('is empty with no works', () => {
    expect(checkedWorks([], { nowMs: NOW, timezone: 'Europe/Stockholm' })).toEqual([])
  })
})
