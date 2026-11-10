import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { BudgetLedger, Forkling, Interests, MindState } from '@forkling/schema'
import { migrateToW1 } from '../src/migrate.ts'
import { DEFAULT_SEED } from '../src/seed.ts'
import { readWorld } from '../src/world.ts'

const template = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))

let world: string
const put = (rel: string, content: string) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const text = (rel: string) => readFileSync(join(world, rel), 'utf8')

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'merge-'))
  // A pet-era repo: needs and a mood word in forkling.json, objects, art, a diary, beliefs, goals and a ledger.
  put(
    'forkling.json',
    JSON.stringify({
      name: 'Merge',
      species: 'cat',
      seed: 20260101,
      needs: { hunger: 5 },
      position: [-6, 0, 12],
      mood: 'upset',
      feelings: { valence: -0.6, arousal: 0.4 },
      intention: { type: 'eat', startedAt: '2026-11-08T08:00:00Z', seed: 1, reason: 'The bowl is empty.' },
      lastTickAt: '2026-11-08T08:00:00Z',
      timezone: 'Europe/Stockholm',
    }),
  )
  put('objects/sunny-rock.json', '{"id":"sunny-rock"}')
  put('art/the-sea.json', '{"id":"the-sea"}')
  put('art/photos/a.jpg', 'jpg')
  put('notebook/plans/2026-11-08.md', '# Plan')
  put('journal/2026-11-08.md', '# A day\n\nI watched the rock.\n')
  put('journal/people.json', '[]')
  put('memory/stream/2026-11-08.jsonl', '{"kind":"wake"}\n')
  put('memory/timeline/2026-11-08.jsonl', '{"verb":"eat"}\n')
  put('memory/beliefs.json', '[{"id":"b1"}]')
  put('memory/summary.md', 'Old memory.')
  put('brain/persona.md', 'Merge is a cat.')
  put('brain/temperament.json', '{"likes":[]}')
  put('brain/skills.json', '{"making":{"xp":10,"level":1}}')
  put('brain/interests.json', '{"topics":{"clay":{}}}')
  put('brain/budget.json', JSON.stringify({ month: '2026-11', spentUsd: 1.25 }))
  put('mind/goals.json', '{"long":{"text":"x"}}')
  put('mind/state.json', '{"knownObjects":["sunny-rock"]}')
  put('mind/ticks/2026-11-08.jsonl', '{"at":"x"}\n')
  put('mind/health.json', '{}')
  put('mind/builds/a.json', '{}')
  put('CLAUDE.md', '# The builder (old)')
  put('.github/workflows/build.yml', 'name: build')
  put('.github/workflows/validate.yml', 'name: validate')
  put('.github/workflows/mind.yml', 'name: mind (old)')
})

describe('migrating a pet-era world to W1', () => {
  it('says what it would do on a dry run, and changes nothing', () => {
    const plan = migrateToW1(world, template, { apply: false })
    expect(plan.moves).toEqual(expect.arrayContaining([{ from: 'objects', to: 'archive/objects' }, { from: 'journal', to: 'archive/journal' }, { from: 'brain/persona.md', to: 'archive/brain/persona.md' }]))
    expect(plan.applied).toBe(false)
    expect(existsSync(join(world, 'archive'))).toBe(false)
    expect(text('journal/2026-11-08.md')).toContain('I watched the rock.')
  })

  it('archives the old journal, objects, art, notes and memory, so the mind starts fresh', () => {
    const plan = migrateToW1(world, template, { apply: true })
    expect(plan.applied).toBe(true)
    expect(text('archive/journal/2026-11-08.md')).toContain('I watched the rock.')
    expect(text('archive/objects/sunny-rock.json')).toContain('sunny-rock')
    expect(existsSync(join(world, 'archive/art/photos/a.jpg'))).toBe(true)
    expect(text('archive/memory/summary.md')).toBe('Old memory.')
    expect(text('archive/memory/beliefs.json')).toContain('b1')
    expect(text('archive/brain/persona.md')).toBe('Merge is a cat.')
    expect(text('archive/brain/temperament.json')).toContain('likes')
    expect(text('archive/mind/goals.json')).toContain('"long"')
    expect(existsSync(join(world, 'objects'))).toBe(false)
    expect(existsSync(join(world, 'art'))).toBe(false)
    expect(readdirSync(join(world, 'journal'))).toEqual(['.gitkeep'])
    expect(text('memory/beliefs.json').trim()).toBe('[]')
    expect(text('memory/summary.md')).toBe(readFileSync(join(template, 'memory/summary.md'), 'utf8'))
    expect(JSON.parse(text('mind/goals.json'))).toEqual({})
    expect(MindState.parse(JSON.parse(text('mind/state.json'))).knownObjects).toEqual([])
    expect(Interests.parse(JSON.parse(text('brain/interests.json'))).topics).toEqual({})
    expect(existsSync(join(world, 'brain/persona.md'))).toBe(false)
  })

  it('keeps who it is, what it has spent, and its tick log', () => {
    migrateToW1(world, template, { apply: true })
    const forkling = Forkling.parse(JSON.parse(text('forkling.json')))
    expect(forkling).toMatchObject({ name: 'Merge', seed: 20260101, timezone: 'Europe/Stockholm', mood: 0, energy: 0.5 })
    expect(text('forkling.json')).not.toMatch(/needs|feelings/)
    expect(forkling.intention.type).toBe('sit')
    expect(BudgetLedger.parse(JSON.parse(text('brain/budget.json'))).spentUsd).toBe(1.25)
    expect(text('mind/ticks/2026-11-08.jsonl')).toBe('{"at":"x"}\n')
  })

  it('gives it the seed, the new CLAUDE.md and the new workflows, and removes the builder and validate workflows', () => {
    migrateToW1(world, template, { apply: true })
    expect(text('self/seed.md').trim()).toBe(DEFAULT_SEED)
    expect(text('CLAUDE.md')).toBe(readFileSync(join(template, 'CLAUDE.md'), 'utf8'))
    expect(text('.github/workflows/mind.yml')).toBe(readFileSync(join(template, '.github/workflows/mind.yml'), 'utf8'))
    expect(existsSync(join(world, '.github/workflows/build.yml'))).toBe(false)
    expect(existsSync(join(world, '.github/workflows/validate.yml'))).toBe(false)
  })

  it('leaves a world the engine can read, with the seed it was given', () => {
    migrateToW1(world, template, { apply: true })
    const w = readWorld(world, () => '2026-11')
    expect(w.seed.trim()).toBe(DEFAULT_SEED)
    expect(w.goals).toEqual({})
    expect(w.objects).toEqual([])
  })

  it('does nothing the second time, and does not overwrite the archive', () => {
    migrateToW1(world, template, { apply: true })
    put('journal/2026-11-09.md', '# New')
    const again = migrateToW1(world, template, { apply: true })
    expect(again.moves).toEqual([])
    expect(text('archive/journal/2026-11-08.md')).toContain('I watched the rock.')
    expect(existsSync(join(world, 'archive/journal/2026-11-09.md'))).toBe(false)
    expect(text('journal/2026-11-09.md')).toBe('# New')
  })

  it('refuses a folder that is not a world', () => {
    const empty = mkdtempSync(join(tmpdir(), 'not-a-world-'))
    expect(() => migrateToW1(empty, template, { apply: true })).toThrow(/forkling\.json/)
  })
})
