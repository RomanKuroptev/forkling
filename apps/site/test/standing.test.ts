import { describe, expect, it } from 'vitest'
import { standing } from '../src/front.ts'

/** Sharing S6: where a project stands, in plain words from data that exists. No end date, no progress. */

const TZ = 'Europe/Stockholm'
const NOW = Date.parse('2026-11-18T10:00:00Z')

describe('standing', () => {
  it('says the session count and when it was last worked on, counted in days of Merge\'s time zone', () => {
    const at = (iso: string) => [{ at: '2026-11-16T09:00:00Z' }, { at: '2026-11-16T10:00:00Z' }, { at: iso }]
    expect(standing(at('2026-11-18T07:00:00Z'), 'building', TZ, NOW)).toBe('session 3, last worked on today')
    expect(standing(at('2026-11-17T09:00:00Z'), 'building', TZ, NOW)).toBe('session 3, last worked on yesterday')
    expect(standing(at('2026-11-14T09:00:00Z'), 'building', TZ, NOW)).toBe('session 3, last worked on 4 days ago')
  })

  it('uses the local day: 23:30 UTC the evening before is already today in Stockholm', () => {
    expect(standing([{ at: '2026-11-17T23:30:00Z' }], 'building', TZ, NOW)).toBe('session 1, last worked on today')
  })

  it('names a finished or dropped project, and a project with no session, and never an end date or a percentage', () => {
    expect(standing([{ at: '2026-11-17T09:00:00Z' }], 'done', TZ, NOW)).toBe('finished, session 1, last worked on yesterday')
    expect(standing([{ at: '2026-11-17T09:00:00Z' }], 'abandoned', TZ, NOW)).toBe('dropped, session 1, last worked on yesterday')
    expect(standing([], 'building', TZ, NOW)).toBe('not started yet')
    expect(standing([{ at: '2026-11-17T09:00:00Z' }], 'building', TZ, NOW)).not.toMatch(/%|until|due|ends/)
  })
})
