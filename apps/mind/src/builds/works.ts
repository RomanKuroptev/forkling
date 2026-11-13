import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Souvenir, WorkMeta, type Interests, type WorkLibrary } from '@forkling/schema'
import type { TinkerSouvenir } from './tinker.ts'

const LIBRARIES: readonly WorkLibrary[] = ['p5', 'tone', 'three']

/** Every work in `works/` whose meta fits its schema, newest first. A folder that is not a work, or a meta that does not parse, is left out. */
export function readWorks(dir: string): WorkMeta[] {
  const folder = join(dir, 'works')
  if (!existsSync(folder)) return []
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        const parsed = WorkMeta.safeParse(JSON.parse(readFileSync(join(folder, entry.name, 'meta.json'), 'utf8')))
        return parsed.success && parsed.data.id === entry.name ? [parsed.data] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => b.made.localeCompare(a.made))
}

/** An earlier work's meta and page, for a remix. Null when there is no such work. */
export function readWorkSource(dir: string, id: string): { id: string; title: string; about: string; html: string } | null {
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(id)) return null
  try {
    const meta = WorkMeta.safeParse(JSON.parse(readFileSync(join(dir, 'works', id, 'meta.json'), 'utf8')))
    if (!meta.success || meta.data.id !== id) return null
    return { id, title: meta.data.title, about: meta.data.about, html: readFileSync(join(dir, 'works', id, 'index.html'), 'utf8') }
  } catch {
    return null
  }
}

/** The names of every folder in `works/`, valid or not, so a new work never takes one. */
export function existingWorkIds(dir: string): string[] {
  const folder = join(dir, 'works')
  return existsSync(folder) ? readdirSync(folder, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []
}

/** The titles of the newest works that were not scrapped, so a new one does not repeat them. */
export const recentWorkTitles = (works: readonly WorkMeta[], n = 5): string[] => works.filter((w) => w.status !== 'scrap').slice(0, n).map((w) => w.title)

/** Libraries no kept work has used (spec 12.4, item 6). A scrap did not get far enough to count as trying one. */
export function untriedLibraries(works: readonly WorkMeta[]): WorkLibrary[] {
  const used = new Set(works.filter((w) => w.status !== 'scrap').flatMap((w) => w.libraries))
  return LIBRARIES.filter((lib) => !used.has(lib))
}

/** The newest souvenirs, with their sources, as the tinker call is offered them. A file that does not fit its schema is left out. */
export function recentSouvenirs(dir: string, n = 5): TinkerSouvenir[] {
  const folder = join(dir, 'souvenirs')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .flatMap((f) => {
      try {
        const s = Souvenir.safeParse(JSON.parse(readFileSync(join(folder, f), 'utf8')))
        return s.success ? [{ id: s.data.id, kind: s.data.kind, content: s.data.content, source: { title: s.data.source.title, url: s.data.source.url } }] : []
      } catch {
        return []
      }
    })
    .slice(0, n)
}

/** The strongest interests as lines for a prompt, with whole-number weights. */
export function topInterestLines(interests: Interests, n = 10): string[] {
  return Object.entries(interests.topics)
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, n)
    .map(([topic, t]) => `${topic} (${Math.round(t.weight)})`)
}

/** Every souvenir in `souvenirs/` that fits its schema, in file order (the date is the start of the name, so oldest first). */
export function readAllSouvenirs(dir: string): Souvenir[] {
  const folder = join(dir, 'souvenirs')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => {
      try {
        const s = Souvenir.safeParse(JSON.parse(readFileSync(join(folder, f), 'utf8')))
        return s.success ? [s.data] : []
      } catch {
        return []
      }
    })
}
