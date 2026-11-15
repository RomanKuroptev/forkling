import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DiaryLike, TextLike } from '@forkling/sim'

const readText = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** The writings in `notebook/writing/` (`<date>-<hhmm>-<slug>.md`), for the repeated-writing nudge and the week's text numbers (spec 12.3, 12.6). Read-only. */
export function readWritings(dir: string): TextLike[] {
  const folder = join(dir, 'notebook/writing')
  if (!existsSync(folder)) return []
  return readdirSync(folder).flatMap((name) => {
    const m = /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})-.+\.md$/.exec(name)
    const text = m ? readText(join(folder, name)) : null
    return m && text !== null ? [{ id: name, at: `${m[1]}T${m[2]}:${m[3]}:00Z`, text }] : []
  })
}

/** The diary entries in `journal/<date>.md`. */
export function readDiaries(dir: string): DiaryLike[] {
  const folder = join(dir, 'journal')
  if (!existsSync(folder)) return []
  return readdirSync(folder).flatMap((name) => {
    const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(name)
    const text = m ? readText(join(folder, name)) : null
    return m && text !== null ? [{ date: m[1]!, text }] : []
  })
}
