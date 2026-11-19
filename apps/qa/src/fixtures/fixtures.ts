import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { repoRoot } from '../paths.ts'

/**
 * The committed fixture worlds of Phase 1 (audit spec 4, steps Q1.3). A full fixture is a world repo folder; a derived one
 * (`night`, `building`) holds only the files it changes and a `qa.json` naming its `base`. `live` is never committed: it is a
 * clone made at run time (`pnpm qa live-clone`).
 */
export const FIXTURES = ['day-0', 'day-7', 'day-30', 'night', 'building'] as const
export type FixtureName = (typeof FIXTURES)[number]

/** `qa.json` beside `forkling.json`: the fixture's clock, and for a derived fixture the one it is made from. */
export const QaJson = z
  .object({
    now: z.string().refine((s) => Number.isFinite(Date.parse(s)), 'an ISO time'),
    base: z.enum(FIXTURES).optional(),
    /** Where the fixture came from, in plain words. */
    about: z.string().max(500).optional(),
  })
  .strict()
export type QaJson = z.infer<typeof QaJson>

export const fixturesRoot = (): string => join(repoRoot(), 'test', 'fixtures', 'worlds')
export const fixtureDir = (name: string): string => join(fixturesRoot(), name)

export const readQaJson = (name: string, dir = fixtureDir(name)): QaJson => QaJson.parse(JSON.parse(readFileSync(join(dir, 'qa.json'), 'utf8')))

/** Every file of a world folder, as forward-slash paths from its top (the manifest the viewer reads with `?world=local`). */
export function worldFileList(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? worldFileList(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]))
    .sort()
}

function copyTree(from: string, to: string): void {
  for (const rel of worldFileList(from)) {
    mkdirSync(dirname(join(to, rel)), { recursive: true })
    copyFileSync(join(from, rel), join(to, rel))
  }
}

/** The whole world of a fixture in `out` (emptied first): its base's files with its own on top. Returns `out`. */
export function materialize(name: string, out: string): string {
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const qa = readQaJson(name)
  if (qa.base) materializeInto(qa.base, out)
  copyTree(fixtureDir(name), out)
  return out
}

function materializeInto(name: string, out: string): void {
  const qa = readQaJson(name)
  if (qa.base) materializeInto(qa.base, out)
  copyTree(fixtureDir(name), out)
}

/** Writes a derived fixture: its changed files and its `qa.json`, replacing what was there. */
export function writeDerived(name: FixtureName, derived: { files: Record<string, string>; qa: QaJson }): void {
  const dir = fixtureDir(name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const [rel, text] of Object.entries(derived.files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  writeFileSync(join(dir, 'qa.json'), `${JSON.stringify(QaJson.parse(derived.qa), null, 2)}\n`)
}
