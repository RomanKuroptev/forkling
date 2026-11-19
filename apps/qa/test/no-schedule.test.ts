import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoRoot } from '../src/paths.ts'

// Roman, 19 November 2026: nothing of the harness runs on a schedule until he says so (steps.md).
const root = repoRoot()
const uncommented = (text: string): string[] => text.split('\n').filter((l) => !l.trim().startsWith('#'))

describe('no schedules', () => {
  it('no workflow of this repo has a schedule: trigger (comments are fine)', () => {
    const dir = join(root, '.github', 'workflows')
    const scheduled = readdirSync(dir)
      .filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))
      .filter((n) => uncommented(readFileSync(join(dir, n), 'utf8')).some((l) => /^\s*schedule\s*:/.test(l)))
    expect(scheduled).toEqual([])
  })

  it('qa/nightly.ps1 names the scheduled task only in a comment, and runs /qa nightly', () => {
    const file = join(root, 'qa', 'nightly.ps1')
    expect(existsSync(file)).toBe(true)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('Register-ScheduledTask')
    expect(uncommented(text).filter((l) => /ScheduledTask/i.test(l))).toEqual([])
    expect(uncommented(text).some((l) => l.includes('claude -p "/qa nightly"'))).toBe(true)
  })
})
