import { describe, expect, it } from 'vitest'
import { ALLOWLIST } from '@forkling/mind/src/web/allowlist.ts'
import { checkListMatchesEngine, checkPromisedMissing, readSourceList, SourceList, type Source } from '../src/sources/list.ts'

const onList = (id: string, hosts: string[], group: Source['group'] = 'reference'): Source => ({
  id,
  name: id,
  group,
  hosts,
  state: 'on the list',
  reason: 'on the allowlist',
  trial: null,
  promisedBy: 'spec 6.1',
})

const engineHosts = ALLOWLIST.map((r) => r.host)
// A list that covers the engine exactly, one source per host.
const matching = (): Source[] => engineHosts.map((h) => onList(h.replaceAll('.', '-'), [h]))
const exists = () => true

describe('qa/sources.json', () => {
  it('parses, and the real file matches the engine', () => {
    expect(checkListMatchesEngine(readSourceList(), engineHosts)).toEqual([])
  })

  it('reports no missing pulse source as major once Roman dropped Show HN, Lobsters, Mastodon trends and Imgflip Top New (20 November; Lemmy memes came back after its second trial), all for Roman with an answer', () => {
    const findings = checkPromisedMissing(readSourceList())
    const major = findings.filter((f) => f.severity === 'major').map((f) => f.fingerprint)
    expect(major).toEqual([])
    const dropped = findings.filter((f) => f.severity === 'info').map((f) => f.fingerprint)
    expect(dropped.sort()).toEqual(['sources.promised-missing|imgflip-new', 'sources.promised-missing|lobsters', 'sources.promised-missing|mastodon-trends', 'sources.promised-missing|show-hn'])
    for (const f of findings) {
      expect(f.fixKind).toBe('roman')
      expect(f.what).toMatch(/Recommended:/)
    }
  })

  it('refuses Reddit and Know Your Meme, whatever their state', () => {
    const reddit = { sources: [{ ...onList('reddit', ['www.reddit.com']), state: 'dropped by Roman', recommended: 'drop' }] }
    expect(SourceList.safeParse(reddit).success).toBe(false)
    const kym = { sources: [{ ...onList('kym', ['knowyourmeme.com']), state: 'trial failed', recommended: 'drop' }] }
    expect(SourceList.safeParse(kym).success).toBe(false)
  })

  it('a source that is not on the list must say what Roman should do', () => {
    const noAnswer = { sources: [{ ...onList('x', ['x.example']), state: 'trial failed' }] }
    expect(SourceList.safeParse(noAnswer).success).toBe(false)
  })
})

describe('planted: the list goes stale', () => {
  it('a source on the list whose host is not in the allowlist', () => {
    const f = checkListMatchesEngine({ sources: [...matching(), onList('ghost', ['ghost.example'])] }, engineHosts, exists)
    expect(f.map((x) => x.fingerprint)).toEqual(['sources.list-matches-engine|not-in-engine|ghost.example'])
    expect(f[0]!.severity).toBe('major')
  })

  it('an allowlist host missing from the file', () => {
    const f = checkListMatchesEngine({ sources: matching().slice(1) }, engineHosts, exists)
    expect(f.map((x) => x.fingerprint)).toEqual([`sources.list-matches-engine|not-in-file|${engineHosts[0]}`])
  })

  it('a trial report that does not exist', () => {
    const lost: Source = { ...onList('lost', ['lost.example']), state: 'trial failed', trial: 'docs/spec/w2-trials/lost.example.md', recommended: 'drop' }
    const f = checkListMatchesEngine({ sources: [...matching(), lost] }, engineHosts, (p) => !p.includes('lost'))
    expect(f.map((x) => x.fingerprint)).toEqual(['sources.list-matches-engine|no-trial|lost'])
  })

  it('a promised source off the allowlist is reported; a passed trial is a code fix, a choice is Roman’s', () => {
    const sources: Source[] = [
      { ...onList('pulse-a', ['a.example'], 'pulse'), state: 'trial passed, not added', trial: 'docs/spec/w2-trials/a.md', recommended: 'wire it' },
      { ...onList('pulse-b', ['b.example'], 'pulse'), state: 'blocked by robots.txt', recommended: 'drop' },
      { ...onList('maker-c', ['c.example'], 'maker'), state: 'trial failed', recommended: 'drop' },
      { ...onList('ref-d', ['d.example']), state: 'dropped by Roman', recommended: 'leave it out' },
    ]
    expect(checkPromisedMissing({ sources }).map((x) => [x.fingerprint, x.severity, x.fixKind])).toEqual([
      ['sources.promised-missing|pulse-a', 'major', 'code'],
      ['sources.promised-missing|pulse-b', 'major', 'roman'],
      ['sources.promised-missing|maker-c', 'minor', 'roman'],
      ['sources.promised-missing|ref-d', 'info', 'roman'],
    ])
  })
})
