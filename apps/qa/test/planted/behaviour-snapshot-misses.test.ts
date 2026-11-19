import { describe, expect, it } from 'vitest'
import { failedUrls, scoreSources, snapshotMisses, type SourceReads } from '../../src/behaviour/sources.ts'
import { readSourceList } from '../../src/sources/list.ts'
import { snapshotDir } from '../../src/sources/snapshot.ts'

/**
 * Planted (the #401 behaviour gate, qa-out/review/behaviour-gate-401.md): on a run that reads the recorded web snapshot, any
 * address the snapshot never recorded answers 404. 17 of that run's 18 404s were real pages the snapshot missed (Procopius,
 * Fish_ladders, ...), and every one was counted as an invented title and a trip that hit a missing page. A snapshot run
 * alarms only on a page the snapshot itself recorded as missing (a real 404) and on a page reached by a guessed link; a
 * snapshot miss is counted apart, as info.
 */
const list = readSourceList()
const W = 'https://en.wikipedia.org/wiki/'
const DAYS = ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']
const NOT_FOUND = 'http: 404 from en.wikipedia.org'

type PageSpec = { url: string; failed?: string; guess?: true }
const trail = (id: string, date: string, pages: PageSpec[]) => ({
  id,
  date,
  purpose: 'look around',
  start: { kind: 'feed' as const, value: pages[0]!.url },
  pages: pages.map((p) => ({ url: p.url, title: p.url.split('/').pop() ?? '', fetchedAt: `${date}T08:00:00Z`, topics: [], ...(p.failed ? { failed: p.failed } : {}), ...(p.guess ? { guess: true as const } : {}) })),
})

// The real 404 is in the committed snapshot with status 404; the misses are real pages it never recorded.
const REAL_404 = `${W}Drake_Hotline_Bling`
const GUESS = `${W}Two_Buttons`
const MISSES = [`${W}Procopius`, `${W}Fish_ladders`, 'https://github.com/dy/jz']

function week(): SourceReads {
  const ok = [`${W}Lighthouse`, 'https://esolangs.org/wiki/Brainfuck', `${W}Moth`, 'https://esolangs.org/wiki/Befunge', `${W}Owl`]
  const trails = [
    trail('real', DAYS[0]!, [{ url: `${W}Iron_Gate_(Antioch)` }, { url: REAL_404, failed: NOT_FOUND }]),
    trail('guess', DAYS[1]!, [{ url: 'https://imgflip.com/meme/1' }, { url: GUESS, failed: NOT_FOUND, guess: true }]),
    trail('miss-0', DAYS[2]!, [{ url: `${W}Iron_Gate_(Antioch)` }, { url: MISSES[0]!, failed: NOT_FOUND }]),
    trail('miss-1', DAYS[3]!, [{ url: `${W}Dam` }, { url: MISSES[1]!, failed: NOT_FOUND }]),
    trail('miss-2', DAYS[4]!, [{ url: MISSES[2]!, failed: 'http: 404 from api.github.com' }]),
    ...ok.map((u, i) => trail(`ok-${i}`, DAYS[i % DAYS.length]!, [{ url: u }])),
  ]
  // A page skipped by the 30-day rule is neither a miss nor a failure, whatever the snapshot holds.
  trails[5]!.pages.push(trail('x', DAYS[0]!, [{ url: `${W}Read_lately_not_recorded`, failed: 'skipped: read in the last 30 days' }]).pages[0]!)
  return { trails, offered: null, works: [], souvenirs: [] }
}


describe('planted: snapshot misses taken for missing pages', () => {
  it('sorts the failed addresses against the snapshot: the ones it never recorded (the guess too: the score counts a guess anyway)', async () => {
    const missed = await snapshotMisses(snapshotDir(), failedUrls(week()))
    expect([...missed].sort()).toEqual([...MISSES, GUESS].sort())
    expect(missed.has(REAL_404)).toBe(false)
  })

  it('a snapshot run with one real 404, one guess and three misses alarms only on the first two', async () => {
    const reads = week()
    const missed = await snapshotMisses(snapshotDir(), failedUrls(reads))
    const r = scoreSources(reads, list, { label: 'test', to: '2026-11-19', snapshot: { missed } })
    const nothing = r.findings.find((f) => f.id === 'sources.read-nothing')!
    expect(nothing.severity).toBe('major')
    expect(nothing.what).toContain('2 of 10 trips')
    expect(r.summary.hit404).toBe(2)
    expect(r.findings.find((f) => f.id === 'sources.invented-titles')!.what).toBe(`404 on: ${REAL_404}, ${GUESS}.`)
    expect(r.summary.web).toBe('snapshot')
    expect(r.summary.guesses).toEqual([GUESS])
    expect(r.summary.snapshotMisses.sort()).toEqual([...MISSES].sort())
    const misses = r.findings.find((f) => f.id === 'sources.snapshot-misses')!
    expect(misses.severity).toBe('info')
    expect(misses.what).toContain('3 ')
    for (const u of MISSES) expect(misses.what).toContain(u)
  })

  it('the same trips on the live web count every 404, as before', () => {
    const r = scoreSources(week(), list, { label: 'test', to: '2026-11-19' })
    expect(r.summary.web).toBe('live')
    expect(r.summary.hit404).toBe(5)
    expect(r.findings.find((f) => f.id === 'sources.read-nothing')!.what).toContain('5 of 10 trips')
    expect(r.findings.some((f) => f.id === 'sources.snapshot-misses')).toBe(false)
    expect(r.summary.invented).toHaveLength(4)
  })
})
