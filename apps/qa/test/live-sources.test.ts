import { describe, expect, it } from 'vitest'
import { backfillImgflip, checkImgflipFreshness, checkSourceHealth, mergeHistory, PROBES, type ImgflipHistory } from '../src/live/sources.ts'
import { readSourceList } from '../src/sources/list.ts'
import { healthyRoutes, memes, recordedFetch, withRoutes, type Routes } from './recorded/web.ts'

const list = readSourceList()
const now = new Date('2026-11-20T05:30:00Z')

async function run(routes: Routes, seen: string[] = []) {
  return checkSourceHealth({ fetchImpl: recordedFetch(routes, seen), sleep: async () => {}, now, list, history: null })
}
const majors = (fs: { severity: string; fingerprint: string }[]) => fs.filter((f) => f.severity === 'major' || f.severity === 'blocker').map((f) => f.fingerprint)

describe('source health (QS.2) on a recorded web', () => {
  it('a healthy web gives no blocker or major', async () => {
    const r = await run(healthyRoutes())
    expect(majors(r.findings)).toEqual([])
    expect(r.imgflipIds).toHaveLength(100)
  })

  it('every source on the list has a live probe', () => {
    const onList = list.sources.filter((s) => s.state === 'on the list').map((s) => s.id)
    expect(PROBES.map((p) => p.source).sort()).toEqual(onList.sort())
  })

  it('reads robots.txt before anything else on a host, and only allowlisted hosts', async () => {
    const seen: string[] = []
    await run(healthyRoutes(), seen)
    for (const host of ['en.wikipedia.org', 'esolangs.org', 'api.imgflip.com', 'p5js.org']) {
      const first = seen.findIndex((u) => new URL(u).hostname === host)
      expect(seen[first]).toBe(`https://${host}/robots.txt`)
    }
    expect(seen.every((u) => !/reddit|knowyourmeme|mastodon/.test(u))).toBe(true)
  })

  it('a host that does not answer is a major for that source, and the others still run', async () => {
    const r = await run(withRoutes([[/^https:\/\/api\.artic\.edu\/api\/v1\/artworks\/search\?query/, { status: 500, body: '' }]]))
    expect(majors(r.findings)).toEqual(['sources.host-answers|artic'])
  })

  it('a sample page under 120 words is a finding', async () => {
    const r = await run(withRoutes([[/^https:\/\/en\.wikipedia\.org\/wiki\/Lighthouse$/, { body: '<div id="mw-content-text"><p>Too short. <a href="/wiki/X">X</a></p></div>' }]]))
    expect(majors(r.findings)).toEqual(['sources.sample-page|wikipedia'])
  })
})

describe('planted: sources break', () => {
  it('a parser that returns 0 items (the Esolang front page changed its layout)', async () => {
    const r = await run(withRoutes([[/^https:\/\/esolangs\.org\/wiki\/Main_Page$/, { body: '<html><body><main><p>Welcome to the new wiki!</p></main></body></html>' }]]))
    const f = r.findings.find((x) => x.fingerprint === 'sources.items|esolang')!
    expect(f.severity).toBe('major')
    expect(f.what).toContain('0 items')
  })

  it('a robots.txt that now disallows is a blocker, and the host is not read further', async () => {
    const seen: string[] = []
    const r = await run(withRoutes([[/^https:\/\/esolangs\.org\/robots\.txt$/, { body: 'User-agent: *\nDisallow: /wiki/\n', type: 'text/plain' }]]), seen)
    const f = r.findings.find((x) => x.fingerprint === 'sources.robots|esolangs.org')!
    expect(f.severity).toBe('blocker')
    expect(seen.filter((u) => u.startsWith('https://esolangs.org/'))).toEqual(['https://esolangs.org/robots.txt'])
  })

  it('a robots.txt that cannot be read means the source is not checked: qa.check-did-not-run', async () => {
    const r = await run(withRoutes([[/^https:\/\/esolangs\.org\/robots\.txt$/, { status: 503, body: '' }]]))
    expect(r.findings.map((f) => f.fingerprint)).toContain('qa.check-did-not-run|sources.items|esolang')
  })
})

const ids = (from: number, n = 100) => Array.from({ length: n }, (_, i) => String(from + i))
const hist = (...entries: [string, string[]][]): ImgflipHistory => ({ version: 1, entries: entries.map(([date, ids]) => ({ date, ids })) })

describe('Imgflip freshness', () => {

  it('no history yet is info, never a pass on freshness', () => {
    const r = checkImgflipFreshness(null, '2026-11-20', ids(0))
    expect(r.findings.map((f) => [f.fingerprint, f.severity])).toEqual([['sources.imgflip-freshness', 'info']])
    expect(r.findings[0]!.what).toMatch(/no history yet/)
    expect(r.history.entries).toEqual([{ date: '2026-11-20', ids: ids(0) }])
  })

  it('counts the formats new since the last run', () => {
    const r = checkImgflipFreshness(hist(['2026-11-13', ids(0)]), '2026-11-20', ids(3))
    expect(r.findings[0]!.what).toContain('3 of the top 100')
    expect(r.findings[0]!.severity).toBe('info')
  })

  it('planted: the same list two weeks running is a major for Roman', () => {
    const r = checkImgflipFreshness(hist(['2026-11-05', ids(0)], ['2026-11-13', ids(0)]), '2026-11-20', ids(0))
    const stale = r.findings.find((f) => f.fingerprint === 'sources.imgflip-stale')!
    expect(stale.severity).toBe('major')
    expect(stale.fixKind).toBe('roman')
  })

  it('keeps the last 30 days, one entry per day (long enough for the two-week alarm)', () => {
    let h: ImgflipHistory | null = null
    for (let d = 1; d <= 40; d++) h = checkImgflipFreshness(h, new Date(Date.UTC(2026, 9, d)).toISOString().slice(0, 10), ids(d)).history
    h = checkImgflipFreshness(h, '2026-11-09', ids(99)).history
    expect(h!.entries).toHaveLength(30)
    expect(h!.entries[0]!.date).toBe('2026-10-11')
    expect(h!.entries.at(-1)).toEqual({ date: '2026-11-09', ids: ids(99) })
  })

  it('no history and nothing to back-fill says when the first verdict is due', () => {
    expect(checkImgflipFreshness(null, '2026-11-20', ids(0)).findings[0]!.what).toContain('2026-12-04')
  })
})

describe('Imgflip history back-filled from Merge’s morning lists', () => {
  const page = (id: string) => `https://imgflip.com/meme/${id}`
  const morning = (date: string, memeIds: string[]) => ({ date, urls: ['https://en.wikipedia.org/wiki/Moth', ...memeIds.map(page), 'https://github.com/a/b'] })

  it('takes the Imgflip formats of each morning, in order, and leaves out a morning with none', () => {
    const b = backfillImgflip([morning('2026-11-05', ['1', '2', '3']), { date: '2026-11-06', urls: ['https://esolangs.org/wiki/X'] }, morning('2026-11-07', ['4'])])
    expect(b).toEqual([
      { date: '2026-11-05', ids: ['1', '2', '3'], backfilled: true },
      { date: '2026-11-07', ids: ['4'], backfilled: true },
    ])
    expect(backfillImgflip(null)).toEqual([])
  })

  it('merges with the artefact, the artefact winning per date', () => {
    const merged = mergeHistory(hist(['2026-11-07', ids(500)]), backfillImgflip([morning('2026-11-05', ['1']), morning('2026-11-07', ['2'])]))
    expect(merged!.entries).toEqual([
      { date: '2026-11-05', ids: ['1'], backfilled: true },
      { date: '2026-11-07', ids: ids(500) },
    ])
    expect(mergeHistory(null, [])).toBeNull()
  })

  it('compares like with like: a back-filled top 6 against today’s top 6', () => {
    const top = ['10', '11', '12', '13', '14', '15']
    const r = checkImgflipFreshness(mergeHistory(null, backfillImgflip([morning('2026-11-13', top)])), '2026-11-20', [...top.slice(0, 5), '99', ...ids(1000, 94)])
    expect(r.findings[0]!.what).toContain('1 of the top 6')
    expect(r.findings[0]!.what).toContain("back-filled from Merge's morning list")
  })

  it('planted: a back-filled list from 15 days ago equal to today’s gives the major', () => {
    const top = ['10', '11', '12', '13', '14', '15']
    const history = mergeHistory(null, backfillImgflip([morning('2026-11-05', top), morning('2026-11-12', top)]))
    const r = checkImgflipFreshness(history, '2026-11-20', [...top, ...ids(1000, 94)])
    const stale = r.findings.find((f) => f.fingerprint === 'sources.imgflip-stale')!
    expect(stale.severity).toBe('major')
    expect(stale.what).toContain("2026-11-05 (back-filled from Merge's morning list, top 6)")
  })

  it('the live check feeds its ids into the history', async () => {
    const r = await checkSourceHealth({
      fetchImpl: recordedFetch(withRoutes([[/^https:\/\/api\.imgflip\.com\/get_memes$/, { body: memes(ids(0)), type: 'application/json' }]])),
      sleep: async () => {},
      now,
      list,
      history: hist(['2026-11-05', ids(0)], ['2026-11-13', ids(0)]),
    })
    expect(majors(r.findings)).toEqual(['sources.imgflip-stale'])
    expect(r.history?.entries.at(-1)?.date).toBe('2026-11-20')
  })
})
