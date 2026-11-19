import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runChecks } from '../src/run/check.ts'
import { checkSnapshotFormat, checkSnapshotFresh, snapshotFreshCheck } from '../src/sources/snapshot.ts'
import { readSourceList } from '../src/sources/list.ts'

const list = readSourceList()
const now = new Date('2026-11-20T06:00:00Z')
const onList = list.sources.filter((s) => s.state === 'on the list')

type Entry = { url: string; host: string; source: string; status: number; contentType?: string; file?: string; bytes?: number; sha256?: string }

// A snapshot on disk in the agreed format (docs/spec/audit/lanes/s.md): manifest.json and files/<sha16>.<ext>.
function snapshot(opts: { takenAt?: string; drop?: string; extra?: Entry[]; corrupt?: boolean; missingFile?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'qa-snap-'))
  mkdirSync(join(dir, 'files'))
  const entries: Entry[] = []
  const sources: Record<string, { items: number }> = {}
  for (const s of onList) {
    if (s.id === opts.drop) continue
    const body = `<html>${s.id}</html>`
    const sha = createHash('sha256').update(body).digest('hex')
    const file = `files/${sha.slice(0, 16)}.html`
    if (!opts.missingFile) writeFileSync(join(dir, file), opts.corrupt ? `${body}!` : body)
    const host = s.hosts[0]!
    entries.push({ url: `https://${host}/robots.txt`, host, source: s.id, status: 404 })
    entries.push({ url: `https://${host}/x`, host, source: s.id, status: 200, contentType: 'text/html', file, bytes: body.length, sha256: sha })
    sources[s.id] = { items: 3 }
  }
  entries.push(...(opts.extra ?? []))
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ version: 1, takenAt: opts.takenAt ?? '2026-11-16T05:00:00Z', engine: 'abc123', userAgent: 'forkling', entries, sources }))
  return dir
}

const fps = (fs: { fingerprint: string }[]) => fs.map((f) => f.fingerprint)

describe('the web snapshot, format (fast tier)', () => {
  it('a good snapshot passes', () => {
    expect(checkSnapshotFormat(snapshot(), list)).toEqual([])
  })

  it('no snapshot committed yet is nothing to check in the PR tier', () => {
    expect(checkSnapshotFormat(mkdtempSync(join(tmpdir(), 'qa-none-')), list)).toEqual([])
  })

  it('a URL off the allowlist is a major', () => {
    const f = checkSnapshotFormat(snapshot({ extra: [{ url: 'https://www.reddit.com/r/memes', host: 'www.reddit.com', source: 'imgflip', status: 200 }] }), list)
    expect(fps(f)).toEqual(['sources.web-snapshot-format|not-allowed|https://www.reddit.com/r/memes'])
    expect(f[0]!.severity).toBe('major')
  })

  it('a missing file and a file that does not match its hash', () => {
    expect(fps(checkSnapshotFormat(snapshot({ missingFile: true }), list)).every((x) => x.startsWith('sources.web-snapshot-format|no-file|'))).toBe(true)
    expect(fps(checkSnapshotFormat(snapshot({ corrupt: true }), list)).every((x) => x.startsWith('sources.web-snapshot-format|hash|'))).toBe(true)
  })

  it('a manifest that does not parse', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qa-bad-'))
    writeFileSync(join(dir, 'manifest.json'), '{"version": 2}')
    expect(fps(checkSnapshotFormat(dir, list))).toEqual(['sources.web-snapshot-format|manifest'])
  })
})

describe('the web snapshot, fresh and complete (live run)', () => {
  it('a snapshot 4 days old with every source passes', () => {
    expect(checkSnapshotFresh(snapshot(), list, now)).toEqual([])
  })

  it('planted: a snapshot 20 days old', () => {
    const f = checkSnapshotFresh(snapshot({ takenAt: '2026-10-31T05:00:00Z' }), list, now)
    expect(fps(f)).toEqual(['sources.web-snapshot-age'])
    expect(f[0]!.severity).toBe('major')
    expect(f[0]!.what).toContain('20 days')
  })

  it('planted: a source on the list with no items in the snapshot', () => {
    expect(fps(checkSnapshotFresh(snapshot({ drop: 'esolang' }), list, now))).toEqual(['sources.web-snapshot-missing|esolang'])
  })

  it('no snapshot at all: the live check did not run', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'qa-none-'))
    const findings = await runChecks([snapshotFreshCheck(empty, list)], { now })
    expect(fps(findings)).toEqual(['qa.check-did-not-run|sources.web-snapshot-fresh'])
  })
})
