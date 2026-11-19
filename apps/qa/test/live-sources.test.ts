import { describe, expect, it } from 'vitest'
import { checkImgflipFreshness, checkSourceHealth, PROBES, type ImgflipHistory } from '../src/live/sources.ts'
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
    expect(seen.every((u) => !/reddit|knowyourmeme|lemmy|mastodon/.test(u))).toBe(true)
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

describe('Imgflip freshness', () => {
  const ids = (from: number, n = 100) => Array.from({ length: n }, (_, i) => String(from + i))
  const hist = (...entries: [string, string[]][]): ImgflipHistory => ({ version: 1, entries: entries.map(([date, ids]) => ({ date, ids })) })

  it('no history yet is info, never a pass on freshness', () => {
    const r = checkImgflipFreshness(null, '2026-11-20', ids(0))
    expect(r.findings.map((f) => [f.fingerprint, f.severity])).toEqual([['sources.imgflip-freshness', 'info']])
    expect(r.findings[0]!.what).toMatch(/no history yet/)
    expect(r.history.entries).toEqual([{ date: '2026-11-20', ids: ids(0) }])
  })

  it('counts the formats new since the last run', () => {
    const r = checkImgflipFreshness(hist(['2026-11-13', ids(0)]), '2026-11-20', ids(3))
    expect(r.findings[0]!.what).toContain('3 of 100')
    expect(r.findings[0]!.severity).toBe('info')
  })

  it('planted: the same list two weeks running is a major for Roman', () => {
    const r = checkImgflipFreshness(hist(['2026-11-05', ids(0)], ['2026-11-13', ids(0)]), '2026-11-20', ids(0))
    const stale = r.findings.find((f) => f.fingerprint === 'sources.imgflip-stale')!
    expect(stale.severity).toBe('major')
    expect(stale.fixKind).toBe('roman')
  })

  it('keeps the last 8 runs, one per day', () => {
    let h: ImgflipHistory | null = null
    for (let d = 1; d <= 10; d++) h = checkImgflipFreshness(h, `2026-11-${String(d).padStart(2, '0')}`, ids(d)).history
    h = checkImgflipFreshness(h, '2026-11-10', ids(99)).history
    expect(h!.entries.map((e) => e.date)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'])
    expect(h!.entries.at(-1)!.ids[0]).toBe('99')
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
