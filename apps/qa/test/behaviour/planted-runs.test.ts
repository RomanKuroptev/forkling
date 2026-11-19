import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeDay0, runSeeds, scoreRuns } from '../../src/behaviour/runner.ts'
import type { Scenario } from '../../src/behaviour/scenarios.ts'
import { readLevels } from '../../src/behaviour/score.ts'
import { repoRoot } from '../../src/paths.ts'

/**
 * Planted behaviour (steps.md QB.7), through the real runner: the fast-forward loop on the web snapshot with a fake model that
 * always picks the same topic, never makes memes, or rests 40%. Each must raise its own alarm, and a plain fake raises none of
 * the three. One simulated day each, so the suite stays a few minutes long.
 */

const THE_THREE = ['behaviour.repeated-words', 'behaviour.memes', 'behaviour.rest']

async function planted(scenario: Scenario): Promise<string[]> {
  const root = mkdtempSync(join(tmpdir(), `qa-planted-${scenario}-`))
  const runs = await runSeeds({ mode: 'fake', days: 1, seeds: 1, capUsd: 1, world: makeDay0(join(root, 'day-0')), outRoot: root, snapshot: join(repoRoot(), 'qa', 'web-snapshot'), scenario, start: '2026-11-20' })
  const { findings } = await scoreRuns(runs, readLevels(), scenario, root, new Date('2026-11-21T12:00:00Z'))
  return findings.filter((f) => f.severity !== 'info').map((f) => f.id)
}

describe('planted behaviour on the fakes', () => {
  it('the plain fake raises none of the three alarms', async () => {
    const ids = await planted('plain')
    expect(ids.filter((id) => THE_THREE.includes(id))).toEqual([])
  }, 600_000)

  it('always the same topic raises repeated words', async () => {
    expect(await planted('same-topic')).toContain('behaviour.repeated-words')
  }, 600_000)

  it('never a meme raises the meme alarm', async () => {
    expect(await planted('no-memes')).toContain('behaviour.memes')
  }, 600_000)

  it('resting 40% raises the rest alarm', async () => {
    expect(await planted('rest-40')).toContain('behaviour.rest')
  }, 600_000)
})
