import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { Place, Project } from '@forkling/schema'
import { describe, expect, it } from 'vitest'
import { growDay30 } from '../src/fixtures/day30.ts'
import { deriveBuilding, deriveNight } from '../src/fixtures/derive.ts'
import { FIXTURES, fixtureDir, materialize, readQaJson, worldFileList } from '../src/fixtures/fixtures.ts'
import { worldSchemaIssues } from '../src/fixtures/schema.ts'
import { trimWorld } from '../src/fixtures/trim.ts'

const temp = (name: string) => mkdtempSync(join(tmpdir(), `qa-${name}-`))
const write = (dir: string, rel: string, data: string | Buffer) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), data)
}

describe('the committed fixture worlds (audit spec 4)', () => {
  it('are day-0, day-7, day-30, night and building, each with its clock in qa.json', () => {
    expect([...FIXTURES]).toEqual(['day-0', 'day-7', 'day-30', 'night', 'building'])
    for (const name of FIXTURES) {
      const qa = readQaJson(name)
      expect(Number.isFinite(Date.parse(qa.now)), name).toBe(true)
      if (qa.base) expect(FIXTURES, `${name} is made from ${qa.base}`).toContain(qa.base)
    }
  })

  it('every one fits the schemas the engine and the viewer read', () => {
    for (const name of FIXTURES) expect(worldSchemaIssues(materialize(name, join(temp(name), 'world'))), name).toEqual([])
  })

  it('stay small (about 2 MB each)', () => {
    const size = (dir: string): number => worldFileList(dir).reduce((sum, rel) => sum + statSync(join(dir, rel)).size, 0)
    for (const name of FIXTURES) expect(size(fixtureDir(name)), name).toBeLessThan(2_600_000)
  })

  it('day-0 is the fresh start: the two starting places, Merge, its seed, nothing made and no visitors', () => {
    const dir = materialize('day-0', join(temp('d0'), 'world'))
    const files = worldFileList(dir)
    expect(files.filter((f) => f.startsWith('places/') && f.endsWith('.json')).sort()).toEqual(['places/home.json', 'places/workshop.json'])
    expect(JSON.parse(readFileSync(join(dir, 'forkling.json'), 'utf8'))).toMatchObject({ name: 'Merge', species: 'cat', seed: 20260101 })
    expect(readFileSync(join(dir, 'self/seed.md'), 'utf8')).toContain('You are Merge')
    expect(files.some((f) => f.startsWith('works/') && f.endsWith('meta.json'))).toBe(false)
    expect(files.some((f) => f.startsWith('notes/') && f.endsWith('.json'))).toBe(false)
  })

  it('day-30 is day-7 with 23 grown days: many more places, rooms and works, each place within the place rules', () => {
    expect(readQaJson('day-30').base).toBe('day-7')
    const dir = materialize('day-30', join(temp('d30'), 'world'))
    const files = worldFileList(dir)
    expect(files.filter((f) => f.startsWith('places/')).length).toBeGreaterThanOrEqual(10)
    expect(files.filter((f) => f.startsWith('works/') && f.endsWith('meta.json')).length).toBeGreaterThanOrEqual(70)
    expect(files.filter((f) => f.startsWith('trails/')).length).toBeGreaterThanOrEqual(90)
  })

  it('day-30 grows the same way from the same seed', () => {
    const a = materialize('day-7', join(temp('ga'), 'world'))
    const b = materialize('day-7', join(temp('gb'), 'world'))
    expect(growDay30(a, { seed: 30, days: 5, start: '2026-11-26' })).toEqual(growDay30(b, { seed: 30, days: 5, start: '2026-11-26' }))
    for (const rel of worldFileList(a)) expect(readFileSync(join(b, rel), 'utf8'), rel).toBe(readFileSync(join(a, rel), 'utf8'))
  })

  it('night and building are day-7 with a few files changed', () => {
    expect(readQaJson('night').base).toBe('day-7')
    expect(readQaJson('building').base).toBe('day-7')
    const building = materialize('building', join(temp('b'), 'world'))
    const places = worldFileList(building).filter((f) => f.startsWith('places/')).map((f) => Place.parse(JSON.parse(readFileSync(join(building, f), 'utf8'))))
    const now = Date.parse(readQaJson('building').now)
    expect(places.some((p) => p.state.construction && Date.parse(p.state.construction.finishesAt) > now)).toBe(true)
  })
})

describe('making the fixtures', () => {
  it('a broken place file is an issue that names the file (planted)', () => {
    const dir = materialize('day-0', join(temp('bad'), 'world'))
    writeFileSync(join(dir, 'places/home.json'), JSON.stringify({ id: 'Home!', name: 3 }))
    const issues = worldSchemaIssues(dir)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0]).toContain('places/home.json')
  })

  it('a missing forkling.json is an issue (planted)', () => {
    const dir = temp('empty')
    expect(worldSchemaIssues(dir).join('\n')).toContain('forkling.json')
  })

  it('trims a world copy: no git, no archive, no tick log, big pictures made small', () => {
    const src = temp('src')
    write(src, '.git/HEAD', 'ref')
    write(src, 'archive/v1/x.json', '{}')
    write(src, 'mind/ticks/2026-11-20.jsonl', '{}\n')
    write(src, 'mind/config.json', '{}')
    const big = new PNG({ width: 1200, height: 600 })
    for (let i = 0; i < big.data.length; i += 4) {
      big.data[i] = (i * 7919) % 251
      big.data[i + 1] = (i * 104729) % 241
      big.data[i + 2] = (i * 31) % 239
      big.data[i + 3] = 255
    }
    write(src, 'works/w/thumb.png', PNG.sync.write(big))
    const dest = join(temp('dest'), 'world')
    trimWorld(src, dest)
    expect(existsSync(join(dest, '.git'))).toBe(false)
    expect(existsSync(join(dest, 'archive'))).toBe(false)
    expect(existsSync(join(dest, 'mind/ticks'))).toBe(false)
    expect(existsSync(join(dest, 'mind/config.json'))).toBe(true)
    const small = PNG.sync.read(readFileSync(join(dest, 'works/w/thumb.png')))
    expect(small.width).toBeLessThanOrEqual(320)
    expect(small.height).toBe(Math.round((600 * small.width) / 1200))
  })

  it('night moves only the clock, after sunset in Stockholm', () => {
    const night = deriveNight('2026-11-26T14:00:00+01:00')
    expect(night.files).toEqual({})
    expect(night.qa.now).toBe('2026-11-26T21:30:00+01:00')
  })

  it('building puts a place under construction and a project with an open session', () => {
    const day7 = materialize('day-7', join(temp('d7'), 'world'))
    const now = '2026-11-26T14:00:00+01:00'
    const { files, qa } = deriveBuilding(day7, now)
    expect(qa).toMatchObject({ base: 'day-7', now })
    const placeFile = Object.keys(files).find((f) => f.startsWith('places/'))!
    const place = Place.parse(JSON.parse(files[placeFile]!))
    expect(Date.parse(place.state.construction!.finishesAt)).toBeGreaterThan(Date.parse(now))
    const projectFile = Object.keys(files).find((f) => f.startsWith('projects/'))!
    expect(Project.parse(JSON.parse(files[projectFile]!)).status).toBe('building')
    const job = Object.keys(files).find((f) => f.startsWith('mind/builds/'))!
    expect(JSON.parse(files[job]!)).toMatchObject({ kind: 'session' })
    expect(Object.keys(files).some((f) => f.endsWith('.result.json'))).toBe(false)
  })
})
