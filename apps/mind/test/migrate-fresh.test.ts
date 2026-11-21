import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { BudgetLedger, Interests, MindState, POINTS_HELD_MAX } from '@forkling/schema'
import { DAILY_POINTS } from '@forkling/sim'
import { SESSION_LIMITS } from '../src/builds/session.ts'
import { FRESH_ARCHIVE, freshPlanLines, migrateFresh } from '../src/migrate-fresh.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { readWorld } from '../src/world.ts'

const template = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))

let world: string
const put = (rel: string, content: string) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const text = (rel: string) => readFileSync(join(world, rel), 'utf8')

/** Files that must come through byte for byte. */
const KEPT: Record<string, string> = {
  'self/seed.md': 'I am Merge, an AI with a cat body.\n',
  'brain/budget.json': JSON.stringify({ month: '2026-11', spentUsd: 9.87, capUsd: 12 }),
  'brain/credits.json': JSON.stringify({ credits: [] }),
  'mind/config.json': '{}',
  'mind/sources.json': '{}',
  'mind/health.json': '{"ok":true}',
  'mind/ticks/2026-11-20.jsonl': '{"at":"x"}\n',
  'mind/notes-hidden.json': '[]',
  'notes/n-2026-11-16-cd4487.json': '{"id":"n-2026-11-16-cd4487"}',
  'memory/visitors.json': '{}',
  '.github/workflows/mind.yml': 'name: mind',
  'archive/journal/2026-10-31.md': '# The first morning\n\nI looked at the sea.\n',
  'archive/memory/summary.md': 'Pet memory.',
  'archive/mind/goals.json': '{"pet":true}',
}

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'merge-fresh-'))
  const forkling = JSON.parse(readFileSync(join(template, 'forkling.json'), 'utf8')) as Record<string, unknown>
  put('forkling.json', `${JSON.stringify({ ...forkling, name: 'Merge', seed: 20260101, timezone: 'Europe/Stockholm' }, null, 2)}\n`)
  for (const [rel, content] of Object.entries(KEPT)) put(rel, content)
  // Merge's v1 life: memory, goals, wants, points, diary, notebook, souvenirs, trails, works, places, its page, projects and requests.
  put('memory/beliefs.json', '[{"id":"b1","text":"Check the terrain model first."}]')
  put('memory/people.json', '[]')
  put('memory/summary.md', '## Terrain first\nLidar.')
  put('memory/stream/2026-11-20.jsonl', '{"kind":"wake"}\n')
  put('memory/timeline/2026-11-20.jsonl', '{"verb":"wander"}\n')
  put('memory/odd.json', '{}')
  put('brain/interests.json', '{"topics":{"lidar":{}},"current":null,"past":[]}')
  put('mind/goals.json', '{"long":{"text":"lidar"}}')
  put('mind/wants.json', '{"items":[]}')
  put('mind/state.json', JSON.stringify({ lastPlanDate: '2026-11-20', allowance: { points: 411, day: '2026-11-20' }, grants: [{ at: '2026-11-20T05:48:23.565Z', points: 300, source: 'daily' }] }))
  put('mind/builds/a.json', '{}')
  put('journal/.gitkeep', '')
  put('journal/2026-11-19.md', '# A Day of Odd Languages\n\nI read about Thue.\n')
  put('notebook/writing/turing.md', '# Turing Tarpit')
  put('souvenirs/2026-11-13-airborne-lidar.json', '{"id":"2026-11-13-airborne-lidar"}')
  put('trails/2026-11-12-1.json', '{"id":"2026-11-12-1"}')
  put('works/stand-still/meta.json', '{"id":"stand-still"}')
  put('works/stand-still/index.html', '<p>still</p>')
  put('places/home.json', '{"id":"home","changed":true}')
  put('places/workshop.json', '{"id":"workshop","changed":true}')
  put('places/grown-place-10.json', '{"id":"grown-place-10"}')
  put('self/page.md', 'Notes to myself. Check the terrain model.')
  put('self/page-history/2026-11-18T10-00-00Z.md', 'Older notes.')
  put('self/about.md', 'I am a cat who reads about lidar.')
  put('projects/p1/project.json', '{}')
  put('requests/workshop.md', '---\nid: "workshop"\n---\n')
  put('self/requests/r1.md', 'A tool.')
})

describe('migrate-fresh: Merge v1 archived, the mind starts again', () => {
  it('says what it would do on a dry run, and changes nothing', () => {
    const plan = migrateFresh(world, template, { apply: false })
    expect(plan.applied).toBe(false)
    expect(plan.moves).toEqual(expect.arrayContaining([{ from: 'journal', to: 'archive/v1/journal' }, { from: 'memory/beliefs.json', to: 'archive/v1/memory/beliefs.json' }, { from: 'mind/state.json', to: 'archive/v1/mind/state.json' }]))
    expect(plan.writes).toEqual(expect.arrayContaining(['places/home.json', 'mind/state.json', 'memory/beliefs.json']))
    expect(plan.removes).toEqual([])
    expect(existsSync(join(world, FRESH_ARCHIVE))).toBe(false)
    expect(text('journal/2026-11-19.md')).toContain('Thue')
    expect(text('places/home.json')).toContain('changed')
  })

  it('moves the old life to archive/v1 with the same relative paths', () => {
    migrateFresh(world, template, { apply: true })
    const moved = [
      'memory/beliefs.json',
      'memory/people.json',
      'memory/summary.md',
      'memory/stream/2026-11-20.jsonl',
      'memory/timeline/2026-11-20.jsonl',
      'memory/odd.json',
      'brain/interests.json',
      'mind/goals.json',
      'mind/wants.json',
      'mind/state.json',
      'mind/builds/a.json',
      'journal/2026-11-19.md',
      'notebook/writing/turing.md',
      'souvenirs/2026-11-13-airborne-lidar.json',
      'trails/2026-11-12-1.json',
      'works/stand-still/meta.json',
      'places/home.json',
      'places/grown-place-10.json',
      'self/page.md',
      'self/page-history/2026-11-18T10-00-00Z.md',
      'self/about.md',
      'projects/p1/project.json',
      'requests/workshop.md',
      'self/requests/r1.md',
    ]
    for (const rel of moved) expect(existsSync(join(world, 'archive/v1', rel)), rel).toBe(true)
    expect(text('archive/v1/journal/2026-11-19.md')).toContain('Thue')
    expect(text('archive/v1/places/home.json')).toContain('changed')
    for (const rel of ['memory/timeline', 'memory/odd.json', 'mind/wants.json', 'mind/builds', 'works', 'places/grown-place-10.json', 'self/page.md', 'self/page-history', 'self/about.md', 'projects/p1', 'requests/workshop.md', 'self/requests', 'notebook/writing']) {
      expect(existsSync(join(world, rel)), rel).toBe(false)
    }
  })

  it('keeps who it is, its money, its running state, its visitors and the pet-era archive byte for byte', () => {
    migrateFresh(world, template, { apply: true })
    for (const [rel, content] of Object.entries(KEPT)) expect(text(rel), rel).toBe(content)
    expect(BudgetLedger.parse(JSON.parse(text('brain/budget.json'))).spentUsd).toBe(9.87)
    expect(readdirSync(join(world, 'archive')).sort()).toEqual(['journal', 'memory', 'mind', 'v1'])
    expect(readdirSync(join(world, 'archive/journal'))).toEqual(['2026-10-31.md'])
    expect(existsSync(join(world, 'archive/v1/memory/visitors.json'))).toBe(false)
  })

  it('writes the fresh starting files from the template', () => {
    migrateFresh(world, template, { apply: true })
    const same = (rel: string) => expect(text(rel), rel).toBe(readFileSync(join(template, rel), 'utf8'))
    for (const rel of ['places/home.json', 'places/workshop.json', 'memory/beliefs.json', 'memory/people.json', 'memory/summary.md', 'mind/goals.json', 'mind/state.json', 'brain/interests.json']) same(rel)
    for (const dir of ['journal', 'notebook', 'souvenirs', 'trails', 'projects', 'requests', 'memory/stream']) expect(readdirSync(join(world, dir)), dir).toEqual(['.gitkeep'])
    expect(readdirSync(join(world, 'places')).sort()).toEqual(['home.json', 'workshop.json'])
  })

  it('leaves a world the engine reads, with no points in hand so the first waking tick grants the starting amount', () => {
    migrateFresh(world, template, { apply: true })
    const w = readWorld(world, () => '2026-11')
    expect(w.goals).toEqual({})
    expect(w.beliefs).toEqual([])
    expect(w.page).toBe('')
    expect(w.about).toBe('')
    expect(w.budget.spentUsd).toBe(9.87)
    expect(w.mindState.allowance).toBeUndefined()
    expect(w.mindState.grants).toBeUndefined()
    expect(Interests.parse(w.interests).topics).toEqual({})
    expect(MindState.parse(JSON.parse(text('archive/v1/mind/state.json'))).allowance?.points).toBe(411)
  })

  it('does nothing the second time and keeps the archive as it was', () => {
    migrateFresh(world, template, { apply: true })
    put('journal/2026-11-21.md', '# The first new day')
    const again = migrateFresh(world, template, { apply: true })
    expect(again.moves).toEqual([])
    expect(again.writes).toEqual([])
    expect(text('archive/v1/journal/2026-11-19.md')).toContain('Thue')
    expect(existsSync(join(world, 'archive/v1/journal/2026-11-21.md'))).toBe(false)
    expect(text('journal/2026-11-21.md')).toBe('# The first new day')
  })

  it('is a no-op the second time also for paths the first run had nothing of (it wrote them fresh)', () => {
    for (const rel of ['memory/people.json', 'projects', 'requests', 'self/requests']) rmSync(join(world, rel), { recursive: true })
    const first = migrateFresh(world, template, { apply: true })
    expect(first.writes).toEqual(expect.arrayContaining(['memory/people.json', 'projects/.gitkeep', 'requests/.gitkeep']))
    const again = migrateFresh(world, template, { apply: false })
    expect(again.moves).toEqual([])
    expect(again.writes).toEqual([])
  })

  it('refuses a folder that is not a world', () => {
    const empty = mkdtempSync(join(tmpdir(), 'not-a-world-'))
    expect(() => migrateFresh(empty, template, { apply: true })).toThrow(/forkling\.json/)
  })
})

describe('migrate-fresh --start-points: the fresh Merge starts with points in hand (Roman, 21 November)', () => {
  // 10:00 in Stockholm on 21 November; 23:30 UTC on the 20th is already the 21st there.
  const NOW = new Date('2026-11-21T09:00:00Z')
  const fresh = (n: number, now = NOW) => migrateFresh(world, template, { apply: true, startPoints: n, now: () => now })

  it('writes a fresh state holding the points, for today in Stockholm, with one grant saying where they came from', () => {
    const plan = fresh(500)
    expect(plan.startPoints).toBe(500)
    expect(MindState.safeParse(JSON.parse(text('mind/state.json'))).success).toBe(true)
    expect(JSON.parse(text('mind/state.json'))).toEqual({ allowance: { points: 500, day: '2026-11-21' }, grants: [{ at: '2026-11-21T09:00:00.000Z', points: 500, source: 'fresh start' }] })
    const w = readWorld(world, () => '2026-11')
    expect(w.mindState.allowance).toEqual({ points: 500, day: '2026-11-21' })
    expect(MindState.parse(JSON.parse(text('archive/v1/mind/state.json'))).allowance?.points).toBe(411)
  })

  it('takes the day in Stockholm, not in UTC', () => {
    fresh(500, new Date('2026-11-20T23:30:00Z'))
    expect(MindState.parse(JSON.parse(text('mind/state.json'))).allowance?.day).toBe('2026-11-21')
  })

  it('500 is enough for a build session to start (a session needs 300 in hand)', () => {
    fresh(500)
    expect(readWorld(world, () => '2026-11').mindState.allowance!.points).toBeGreaterThanOrEqual(SESSION_LIMITS.startPoints)
  })

  it('a waking tick that day adds no daily grant; the next day adds it as usual', async () => {
    fresh(500)
    const cat = loadSpecies('cat')
    const deps = (at: string) => ({ now: new Date(at), llm: null, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })
    await runTick(world, deps('2026-11-21T09:10:00Z'))
    const same = MindState.parse(JSON.parse(text('mind/state.json')))
    expect(same.allowance).toEqual({ points: 500, day: '2026-11-21' })
    expect(same.grants!.map((g) => g.source)).toEqual(['fresh start'])
    await runTick(world, deps('2026-11-22T09:10:00Z'))
    const next = MindState.parse(JSON.parse(text('mind/state.json')))
    expect(next.allowance!.day).toBe('2026-11-22')
    expect(next.allowance!.points).toBe(500 + DAILY_POINTS)
    expect(next.grants!.map((g) => g.source)).toEqual(['fresh start', 'daily'])
  })

  it('says the start points on a dry run and writes nothing', () => {
    const plan = migrateFresh(world, template, { apply: false, startPoints: 500, now: () => NOW })
    expect(plan.startPoints).toBe(500)
    expect(plan.writes).toContain('mind/state.json')
    const lines = freshPlanLines(plan).join('\n')
    expect(lines).toMatch(/^Dry run/)
    expect(lines).toContain('write  mind/state.json (500 start points for 2026-11-21)')
    expect(MindState.parse(JSON.parse(text('mind/state.json'))).allowance?.points).toBe(411)
  })

  it('is a no-op the second time, and keeps the points already given', () => {
    fresh(500)
    const again = fresh(500, new Date('2026-11-22T09:00:00Z'))
    expect(again.moves).toEqual([])
    expect(again.writes).toEqual([])
    expect(again.startPoints).toBeUndefined()
    expect(MindState.parse(JSON.parse(text('mind/state.json'))).allowance).toEqual({ points: 500, day: '2026-11-21' })
  })

  it('is a no-op the second time also when Merge had no state to archive', () => {
    rmSync(join(world, 'mind/state.json'))
    fresh(500)
    const again = fresh(500)
    expect(again.moves).toEqual([])
    expect(again.writes).toEqual([])
  })

  it('without --start-points the fresh state is the template one, as before', () => {
    const plan = migrateFresh(world, template, { apply: true, now: () => NOW })
    expect(plan.startPoints).toBeUndefined()
    expect(text('mind/state.json')).toBe(readFileSync(join(template, 'mind/state.json'), 'utf8'))
  })

  it('refuses points that are not a whole number from 0 to the most that may be held', () => {
    for (const n of [-1, 1.5, POINTS_HELD_MAX + 1, Number.NaN]) expect(() => fresh(n), String(n)).toThrow(/start points/)
    expect(() => fresh(POINTS_HELD_MAX)).not.toThrow()
  })
})
