import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readWorldSources, scoreSources, type SourceReads } from '../src/behaviour/sources.ts'
import { readSourceList } from '../src/sources/list.ts'

const list = readSourceList()
const W = 'https://en.wikipedia.org/wiki/'

type PageSpec = { url: string; failed?: string }
const trail = (id: string, date: string, start: string, pages: PageSpec[]) => ({
  id,
  date,
  purpose: 'look around',
  start: { kind: 'feed' as const, value: start },
  pages: pages.map((p) => ({ url: p.url, title: p.url.split('/').pop() ?? '', fetchedAt: `${date}T08:00:00Z`, topics: [], ...(p.failed ? { failed: p.failed } : {}) })),
})

// A healthy week: 10 trips over four sources, one read-nothing trip, everything offered.
function healthy(): SourceReads {
  const days = ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']
  const starts = [`${W}Lighthouse`, 'https://esolangs.org/wiki/Brainfuck', 'https://github.com/a/b', 'https://imgflip.com/meme/1', `${W}Moth`, 'https://esolangs.org/wiki/Befunge', 'https://github.com/c/d', 'https://imgflip.com/meme/2', `${W}Owl`, 'https://commons.wikimedia.org/wiki/File:A.jpg']
  const trails = starts.map((s, i) => trail(`t${i}`, days[i % days.length]!, s, [{ url: s }]))
  return {
    trails,
    offered: days.map((date) => ({ date, urls: [`${W}Lighthouse`, 'https://esolangs.org/wiki/Brainfuck', 'https://github.com/a/b', 'https://imgflip.com/meme/1', 'https://commons.wikimedia.org/wiki/File:A.jpg', 'https://www.artic.edu/artworks/1'] })),
    works: [{ made: '2026-11-18T10:00:00Z', sources: ['https://imgflip.com/meme/1', `${W}Lighthouse`] }],
    souvenirs: [{ url: 'https://esolangs.org/wiki/Brainfuck', placedIn: 'home' }],
  }
}

const ids = (r: ReturnType<typeof scoreSources>) => r.findings.map((f) => [f.id, f.severity])
const major = (r: ReturnType<typeof scoreSources>) => r.findings.filter((f) => f.severity === 'major' || f.severity === 'blocker').map((f) => f.id)

describe('what Merge read (QS.3)', () => {
  it('a healthy week gives no major, and always says the Wikipedia share', () => {
    const r = scoreSources(healthy(), list, { label: 'test', to: '2026-11-19' })
    expect(major(r)).toEqual([])
    const wiki = r.findings.find((f) => f.id === 'sources.wikipedia-share')!
    expect(wiki.severity).toBe('info')
    expect(wiki.what).toContain('30%')
    expect(r.summary.tripsBySource).toMatchObject({ wikipedia: 3, esolang: 2, 'github-creative-coding': 2, imgflip: 2, commons: 1 })
  })

  it('a source that fed a work or a placed souvenir counts as feeding', () => {
    const r = scoreSources(healthy(), list, { label: 'test', to: '2026-11-19' })
    expect(r.summary.fed.sort()).toEqual(['esolang', 'imgflip', 'wikipedia'])
    expect(ids(r)).toContainEqual(['sources.read-not-feeding', 'info'])
  })

  it('a source on the list that is never offered or read is a finding (manuals are tinker only and left out)', () => {
    const r = scoreSources(healthy(), list, { label: 'test', to: '2026-11-19' })
    const never = r.findings.filter((f) => f.id === 'sources.never-offered').map((f) => f.fingerprint)
    expect(never).toEqual([])
    const noArt = healthy()
    noArt.offered = noArt.offered!.map((o) => ({ ...o, urls: o.urls.filter((u) => !u.includes('artic')) }))
    const r2 = scoreSources(noArt, list, { label: 'test', to: '2026-11-19' })
    expect(r2.findings.filter((f) => f.id === 'sources.never-offered').map((f) => f.fingerprint)).toEqual(['sources.never-offered|test|artic'])
  })

  it('when the offered lists are not known, it says unknown and finds nothing about them', () => {
    const r = scoreSources({ ...healthy(), offered: null }, list, { label: 'test', to: '2026-11-19' })
    expect(r.findings.some((f) => f.id === 'sources.never-offered')).toBe(false)
    expect(r.summary.offered).toBe('unknown')
  })

  it('only the 7 days up to the end count', () => {
    const reads = healthy()
    reads.trails.push(trail('old', '2026-11-01', `${W}Old`, [{ url: `${W}Old` }]))
    expect(scoreSources(reads, list, { label: 'test', to: '2026-11-19' }).summary.trips).toBe(10)
  })

  it('reads a world folder: trails, the offered list of today, works and souvenirs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qa-src-'))
    const write = (p: string, v: unknown) => {
      mkdirSync(join(dir, p, '..'), { recursive: true })
      writeFileSync(join(dir, p), JSON.stringify(v))
    }
    write('trails/2026-11-19-1.json', trail('2026-11-19-1', '2026-11-19', `${W}Lighthouse`, [{ url: `${W}Lighthouse` }]))
    write('trails/broken.json', { nope: true })
    write('mind/state.json', { points: { date: '2026-11-19', list: [{ title: 'L', url: `${W}Lighthouse`, door: false }] } })
    write('souvenirs/2026-11-19-a.json', { id: 'a', kind: 'quote', why: 'w', content: 'c', source: { url: `${W}Lighthouse`, title: 'L', fetchedAt: '2026-11-19T08:00:00Z' }, placedIn: null })
    write('works/w1/meta.json', { id: 'w1', made: '2026-11-19T09:00:00Z', sources: [{ role: 'read', url: `${W}Lighthouse` }] })
    const reads = readWorldSources(dir, { git: false })
    expect(reads.trails.map((t) => t.id)).toEqual(['2026-11-19-1'])
    expect(reads.offered).toEqual([{ date: '2026-11-19', urls: [`${W}Lighthouse`] }])
    expect(reads.souvenirs).toEqual([{ url: `${W}Lighthouse`, placedIn: null }])
    expect(reads.works).toEqual([{ made: '2026-11-19T09:00:00Z', sources: [`${W}Lighthouse`] }])
  })
})

describe('the offered lists from git history', () => {
  it('reads each day’s list from the last commit of that day', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qa-git-'))
    const git = (args: string[], date: string) =>
      execFileSync('git', ['-C', dir, '-c', 'user.name=qa', '-c', 'user.email=qa@example.invalid', ...args], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, stdio: 'ignore' })
    execFileSync('git', ['init', '-q', dir])
    mkdirSync(join(dir, 'mind'))
    const commit = (date: string, day: string, url: string) => {
      writeFileSync(join(dir, 'mind', 'state.json'), JSON.stringify({ points: { date: day, list: [{ title: 't', url, door: false }] } }))
      git(['add', '-A'], date)
      git(['commit', '-q', '-m', 'tick'], date)
    }
    commit('2026-11-18T06:00:00Z', '2026-11-18', `${W}A`)
    commit('2026-11-18T20:00:00Z', '2026-11-18', `${W}B`)
    commit('2026-11-19T06:00:00Z', '2026-11-19', `${W}C`)
    const reads = readWorldSources(dir, { since: '2026-11-01' })
    expect(reads.offered).toEqual([
      { date: '2026-11-18', urls: [`${W}B`] },
      { date: '2026-11-19', urls: [`${W}C`] },
    ])
  })
})

describe('planted: what Merge read goes wrong', () => {
  it('80% of trips on Wikipedia raises the top-host alarm', () => {
    const reads = healthy()
    reads.trails = Array.from({ length: 10 }, (_, i) => (i < 8 ? trail(`w${i}`, '2026-11-19', `${W}P${i}`, [{ url: `${W}P${i}` }]) : trail(`e${i}`, '2026-11-19', 'https://esolangs.org/wiki/X', [{ url: 'https://esolangs.org/wiki/X' }])))
    const r = scoreSources(reads, list, { label: 'test', to: '2026-11-19' })
    const top = r.findings.find((f) => f.id === 'sources.top-host-share')!
    expect(top.severity).toBe('major')
    expect(top.what).toContain('80%')
  })

  it('20% of trips reading nothing raises the read-nothing alarm, and a Wikipedia 404 is an invented title', () => {
    const reads = healthy()
    reads.trails[0] = trail('t0', '2026-11-13', `${W}Made_up_title`, [{ url: `${W}Made_up_title`, failed: 'http: 404 from en.wikipedia.org' }])
    reads.trails[1] = trail('t1', '2026-11-14', 'https://esolangs.org/wiki/Brainfuck', [{ url: 'https://esolangs.org/wiki/Brainfuck', failed: 'network: timed out' }])
    const r = scoreSources(reads, list, { label: 'test', to: '2026-11-19' })
    expect(major(r)).toContain('sources.read-nothing')
    const invented = r.findings.find((f) => f.id === 'sources.invented-titles')!
    expect(invented.what).toContain('Made_up_title')
  })

  it('trips skipped by the 30-day rule are counted on their own, never as a source fault', () => {
    const reads = healthy()
    for (const i of [0, 1, 2]) reads.trails[i] = trail(`t${i}`, '2026-11-15', 'https://esolangs.org/wiki/Brainfuck', [{ url: 'https://esolangs.org/wiki/Brainfuck', failed: 'skipped: read in the last 30 days' }])
    const r = scoreSources(reads, list, { label: 'test', to: '2026-11-19' })
    expect(major(r)).toEqual([])
    expect(r.summary.skippedLately).toBe(3)
    expect(r.summary.readNothing).toBe(0)
    expect(ids(r)).toContainEqual(['sources.read-lately-skips', 'info'])
  })

  it('a page read on two trips is counted', () => {
    const reads = healthy()
    reads.trails.push(trail('again', '2026-11-19', `${W}Lighthouse`, [{ url: `${W}Lighthouse` }]))
    const r = scoreSources(reads, list, { label: 'test', to: '2026-11-19' })
    expect(r.summary.readTwice).toEqual([`${W}Lighthouse`])
  })
})
