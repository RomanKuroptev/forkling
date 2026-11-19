import { describe, expect, it } from 'vitest'
import { Finding, Findings } from '../src/report/finding.ts'

const good = {
  id: 'page.no-sideways-scroll',
  fingerprint: 'page.no-sideways-scroll|/diary/|390x844|day',
  area: 'page',
  severity: 'major',
  title: 'The diary page scrolls sideways on a phone',
  what: 'At 390 px wide the page is 431 px wide.',
  causes: 'On a phone the whole page slides left and right.',
  evidence: ['qa-out/pages/diary-390-day.png'],
  where: 'apps/site/src/diary.ts',
  fixKind: 'code',
  fixture: 'day-7',
  firstSeen: '2026-11-20',
  runs: 1,
}

describe('Finding', () => {
  it('accepts the example from spec section 3', () => {
    expect(Finding.parse(good)).toEqual(good)
  })

  it('makes where and fixture optional', () => {
    const { where: _w, fixture: _f, ...rest } = good
    expect(Finding.safeParse(rest).success).toBe(true)
  })

  it.each([
    ['severity', 'critical'],
    ['area', 'everything'],
    ['fixKind', 'magic'],
    ['firstSeen', '20 November'],
    ['runs', 0],
    ['title', ''],
  ])('rejects a bad %s', (key, value) => {
    expect(Finding.safeParse({ ...good, [key]: value }).success).toBe(false)
  })

  it('rejects an svg as evidence (pictures are PNG)', () => {
    expect(Finding.safeParse({ ...good, evidence: ['qa-out/sheet.svg'] }).success).toBe(false)
  })

  it('rejects two findings with one fingerprint in a findings file', () => {
    expect(Findings.safeParse([good, good]).success).toBe(false)
    expect(Findings.safeParse([good, { ...good, fingerprint: 'other' }]).success).toBe(true)
  })
})
