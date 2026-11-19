import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { repoRoot } from '../paths.ts'
import { deriveBuilding, deriveNight } from './derive.ts'
import { growDay30 } from './day30.ts'
import { FIXTURES, fixtureDir, materialize, QaJson, readQaJson, worldFileList, writeDerived } from './fixtures.ts'
import { worldSchemaIssues } from './schema.ts'
import { trimWorld } from './trim.ts'

export const FIXTURES_USAGE = `  fixtures                     rebuild day-0, night and building from the template and day-7 (pure edits, no model, no network)
           [--import-day7 <dir> [--about <text>]]  make day-7 from a fast-forward world copy (trimmed to about 2 MB)
  live-clone                   a fresh clone of Merge's repo in qa-out/live/world, remote removed (read-only, never committed)`

/** The clock every Phase 1 fixture world is shown at, unless it says otherwise: a Thursday afternoon in Stockholm. */
export const DAY_NOW = '2026-11-26T14:00:00+01:00'

const writeQa = (dir: string, qa: QaJson) => writeFileSync(join(dir, 'qa.json'), `${JSON.stringify(QaJson.parse(qa), null, 2)}\n`)

/** `day-0`: what the fresh start gives (docs/spec/v4/merge-fresh-start.md): the template, Merge's forkling.json, its seed, no visitors. */
export function makeDay0(root = repoRoot()): string {
  const dir = fixtureDir('day-0')
  rmSync(dir, { recursive: true, force: true })
  cpSync(join(root, 'templates', 'forkling-world'), dir, { recursive: true })
  rmSync(join(dir, 'CLAUDE.md'), { force: true })
  copyFileSync(join(root, 'templates', 'merge', 'forkling.json'), join(dir, 'forkling.json'))
  writeQa(dir, { now: DAY_NOW, about: 'The fresh start: the engine template with Merge\'s forkling.json and seed, nothing made yet, no visitors.' })
  return dir
}

/** `day-7` from a fast-forward world copy (the R2 run's, or a new 7-day run with sessions). */
export function importDay7(from: string, about: string): string {
  const dir = fixtureDir('day-7')
  const { bytes } = trimWorld(from, dir)
  const repaired = cutLongExhibitIds(dir)
  writeQa(dir, { now: DAY_NOW, about: repaired.length ? `${about} Exhibit ids cut to the 41 characters the schema allows (the engine wrote longer ones): ${repaired.join(', ')}.` : about })
  console.log(`day-7: ${Math.round(bytes / 1024)} KB from ${from}`)
  return dir
}

/**
 * The engine's install step wrote screen exhibit ids longer than a part id may be (`screen-<work id>` cut at 60, the schema
 * allows 41), so the viewer leaves the whole place out. A fixture keeps the place: the id is cut to fit, and the place is named
 * here and in its qa.json. The bug itself is planted in a test.
 */
export function cutLongExhibitIds(dir: string): string[] {
  const placesDir = join(dir, 'places')
  const out: string[] = []
  for (const f of existsSync(placesDir) ? readdirSync(placesDir).filter((n) => n.endsWith('.json')) : []) {
    const path = join(placesDir, f)
    const place = JSON.parse(readFileSync(path, 'utf8')) as { exhibits?: { id: string }[] }
    let changed = false
    for (const e of place.exhibits ?? []) {
      if (e.id.length <= 41) continue
      out.push(`${f.replace(/\.json$/, '')}/${e.id}`)
      e.id = e.id.slice(0, 41).replace(/-+$/, '')
      changed = true
    }
    if (changed) writeFileSync(path, `${JSON.stringify(place, null, 2)}\n`)
  }
  return out
}

/** `day-30`: day-7 plus 23 grown days (`growDay30`), kept as the files it adds or changes on top of day-7. */
export function makeDay30(): { files: Record<string, string>; qa: QaJson } {
  const base = materialize('day-7', join(mkdtempSync(join(tmpdir(), 'qa-day7-')), 'world'))
  const grown = materialize('day-7', join(mkdtempSync(join(tmpdir(), 'qa-day30-')), 'world'))
  const start = DAY_NOW.slice(0, 10)
  const added = growDay30(grown, { seed: 30, days: 23, start })
  const files: Record<string, string> = {}
  for (const rel of worldFileList(grown)) {
    if (rel === 'qa.json') continue
    const text = readFileSync(join(grown, rel), 'utf8')
    if (!existsSync(join(base, rel)) || readFileSync(join(base, rel), 'utf8') !== text) files[rel] = text
  }
  const end = new Date(Date.parse(`${start}T12:00:00Z`) + 23 * 86_400_000).toISOString().slice(0, 10)
  const qa: QaJson = { base: 'day-7', now: `${end}T14:00:00+01:00`, about: `day-7 plus 23 grown days from ${start} (by code, seeded): ${added.places} places, ${added.rooms} rooms, ${added.works} works and ${added.trails} trails added.` }
  writeDerived('day-30', { files, qa })
  return { files, qa }
}

export function makeDerived(): void {
  const day7 = materialize('day-7', join(mkdtempSync(join(tmpdir(), 'qa-day7-')), 'world'))
  const now = readQaJson('day-7').now
  writeDerived('night', deriveNight(now))
  writeDerived('building', deriveBuilding(day7, now))
}

/** `live`: a fresh shallow clone of Merge's repo, its remote removed so nothing can be pushed from it. */
export function liveClone(out: string, url = 'https://github.com/RomanKuroptev/merge.git'): string {
  const dir = join(out, 'live', 'world')
  rmSync(join(out, 'live'), { recursive: true, force: true })
  mkdirSync(join(out, 'live'), { recursive: true })
  execFileSync('git', ['clone', '--quiet', '--depth', '1', url, dir], { stdio: 'inherit' })
  execFileSync('git', ['-C', dir, 'remote', 'remove', 'origin'])
  writeQa(dir, { now: new Date().toISOString(), about: `A clone of ${url} made ${new Date().toISOString()}.` })
  return dir
}

export function fixturesCommand(args: string[], ctx: { cwd: string }): number {
  const { values } = parseArgs({ args, options: { 'import-day7': { type: 'string' }, about: { type: 'string' } } })
  if (values['import-day7']) importDay7(resolve(ctx.cwd, values['import-day7']), values.about ?? 'A 7-day fast-forward world, trimmed.')
  makeDay0()
  makeDerived()
  makeDay30()
  let bad = 0
  for (const name of FIXTURES) {
    if (!existsSync(join(fixtureDir(name), 'qa.json'))) {
      bad++
      console.log(`${name}: not made yet`)
      continue
    }
    const issues = worldSchemaIssues(materialize(name, join(mkdtempSync(join(tmpdir(), `qa-${name}-`)), 'world')))
    if (issues.length) {
      bad++
      console.log(`${name}:\n  ${issues.join('\n  ')}`)
    }
  }
  console.log(bad ? `${bad} fixtures do not fit the schemas` : 'every fixture fits the schemas')
  return bad ? 1 : 0
}
