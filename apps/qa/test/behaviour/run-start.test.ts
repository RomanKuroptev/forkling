import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lastLoggedDay, runStart } from '../../src/behaviour/runner.ts'
import { repoRoot } from '../../src/paths.ts'

const TZ = 'Europe/Stockholm'
const NOW = Date.parse('2026-11-20T12:00:00Z')

function world(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'qa-run-start-'))
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), content)
  }
  return dir
}

describe('where a behaviour run starts', () => {
  it('day-7 starts at its own clock (2026-11-26), never inside the R2 days it already lived', () => {
    const day7 = join(repoRoot(), 'test', 'fixtures', 'worlds', 'day-7')
    expect(lastLoggedDay(day7)).toBe('2026-11-25')
    expect(runStart(day7, TZ, undefined, NOW)).toBe('2026-11-26')
  })

  it('a world logged past its clock starts the day after its last logged day', () => {
    const w = world({ 'qa.json': JSON.stringify({ now: '2026-11-26T14:00:00+01:00' }), 'memory/stream/2026-11-29.jsonl': '{}\n', 'notebook/plans/2026-11-30.md': '# Plan\n' })
    expect(runStart(w, TZ, undefined, NOW)).toBe('2026-12-01')
  })

  it('a world with no clock and no logged days starts tomorrow, as before', () => {
    expect(runStart(world({ 'forkling.json': '{}' }), TZ, undefined, NOW)).toBe('2026-11-21')
  })

  it('a given start is kept, unless it falls inside the days the world has already logged', () => {
    const w = world({ 'journal/2026-11-24.md': '# A day\n', 'mind/ticks/2026-11-23.jsonl': '{}\n' })
    expect(runStart(w, TZ, '2026-11-20', NOW)).toBe('2026-11-25')
    expect(runStart(w, TZ, '2026-12-03', NOW)).toBe('2026-12-03')
  })
})
