import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WorkMeta } from '@forkling/schema'
import { esc, markdown } from './md.ts'

/**
 * Merge's first life, kept in `archive/v1/` by the fresh start (docs/spec/v4/merge-fresh-start.md). The site shows it as one window
 * on the desktop, an old save file: the diary days as pages, the last page of notes to itself, the last summary of its memory, and the
 * titles of what it made. Read-only; nothing here is added to.
 */
export const V1 = 'archive/v1'

export interface V1Save {
  journal: { date: string; text: string }[]
  page: string
  summary: string
  works: { title: string; made: string }[]
}

const read = (file: string): string => {
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}

export function loadV1(world: string): V1Save {
  const root = join(world, V1)
  const journalDir = join(root, 'journal')
  const journal = existsSync(journalDir)
    ? readdirSync(journalDir)
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
        .map((f) => ({ date: f.slice(0, -3), text: read(join(journalDir, f)) }))
        .sort((a, b) => b.date.localeCompare(a.date))
    : []
  const worksDir = join(root, 'works')
  const works = existsSync(worksDir)
    ? readdirSync(worksDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .flatMap((e) => {
          try {
            const meta = WorkMeta.safeParse(JSON.parse(readFileSync(join(worksDir, e.name, 'meta.json'), 'utf8')))
            return meta.success && meta.data.status !== 'scrap' ? [{ title: meta.data.title, made: meta.data.made }] : []
          } catch {
            return []
          }
        })
        .sort((a, b) => b.made.localeCompare(a.made))
    : []
  return { journal, page: read(join(root, 'self/page.md')), summary: read(join(root, 'memory/summary.md')), works }
}

export const hasV1 = (save: V1Save): boolean => save.journal.length > 0 || save.page !== '' || save.summary !== '' || save.works.length > 0

const titleOf = (md: string) => /^# (.+)$/m.exec(md)?.[1] ?? ''
/** Its own headings sit one level under the window's (`## Terrain first` under "What it remembered last"). */
const deeper = (md: string) => md.replace(/^(#{1,2}) /gm, '#$1 ')

/** The window's page, `v1/index.html`. */
export function v1Body(name: string, save: V1Save): string {
  const first = save.journal.at(-1)?.date
  const last = save.journal[0]?.date
  const span = first && last ? (first === last ? ` It ran on ${esc(first)}.` : ` It ran from ${esc(first)} to ${esc(last)}.`) : ''
  return [
    `<h1>${esc(name)} v1</h1>`,
    `<p class="quiet">An old save file: ${esc(name)}'s first life, before it started again.${span} It is kept as it was. The ${esc(name)} you meet now does not remember any of it.</p>`,
    ...(save.journal.length > 0 ? ['<h2>Diary</h2>', `<ul>${save.journal.map((j) => `<li><a href="journal/${esc(j.date)}.html">${esc(j.date)}</a> ${esc(titleOf(j.text))}</li>`).join('')}</ul>`] : []),
    ...(save.page ? ['<h2>Its last notes to itself</h2>', markdown(deeper(save.page))] : []),
    ...(save.summary ? ['<h2>What it remembered last</h2>', markdown(deeper(save.summary))] : []),
    ...(save.works.length > 0 ? ['<h2>What it made</h2>', `<ul>${save.works.map((w) => `<li>${esc(w.title)}</li>`).join('')}</ul>`] : []),
  ].join('\n')
}
