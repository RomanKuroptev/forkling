import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { realEnvFile, scoreRuns } from '../../src/behaviour/runner.ts'
import { readLevels } from '../../src/behaviour/score.ts'

describe('planted: a behaviour seed that never ran (no key, a crash before the first tick)', () => {
  it('gives qa.check-did-not-run for that seed instead of crashing the whole score', async () => {
    const root = mkdtempSync(join(tmpdir(), 'qa-dnr-'))
    const world = join(root, 'seed-0', 'world')
    mkdirSync(world, { recursive: true })
    const { findings } = await scoreRuns([{ label: 'seed-0', world, outDir: join(root, 'seed-0', 'out') }], readLevels(), 'real-7d-1s', root, new Date('2026-11-20T12:00:00Z'))
    expect(findings.map((f) => f.fingerprint)).toEqual(['qa.check-did-not-run|behaviour:real-7d-1s:seed-0'])
    expect(findings[0]!.what).toContain('stopped with')
  })
})

describe('a real run finds the key file the mind scripts use', () => {
  it('uses the repo root .env when none is given and it exists, and the given one otherwise', () => {
    expect(realEnvFile(undefined, (p) => p.endsWith('.env'), 'C:/r')).toBe(join('C:/r', '.env'))
    expect(realEnvFile(undefined, () => false, 'C:/r')).toBeUndefined()
    expect(realEnvFile('x.env', () => true, 'C:/r')).toBe('x.env')
  })
})
