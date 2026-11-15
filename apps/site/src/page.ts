import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { esc } from './md.ts'

export interface PageVersion {
  /** When it was written, as an ISO time (the file name is UTC). */
  at: string
  text: string
}

export interface MergePage {
  /** The page as it stands, or null if there is no `self/page.md`. */
  current: string | null
  /** Every version kept in `self/page-history/`, newest first. */
  history: PageVersion[]
}

const NAME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.md$/

/** Merge's own page and its history (spec 9.7). A history file whose name is not a moment is left out. */
export function loadPage(world: string): MergePage {
  const file = join(world, 'self/page.md')
  const current = existsSync(file) ? readFileSync(file, 'utf8').trim() : null
  const folder = join(world, 'self/page-history')
  const history = existsSync(folder)
    ? readdirSync(folder)
        .flatMap((f) => {
          const m = NAME.exec(f)
          return m ? [{ at: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`, text: readFileSync(join(folder, f), 'utf8').trim() }] : []
        })
        .sort((a, b) => b.at.localeCompare(a.at))
    : []
  return { current, history }
}

const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replaceAll('\n', '<br>')}</p>`)
    .join('')

export interface PageInput {
  page: MergePage
  /** How a moment is written on the site, in Merge's time zone. */
  stamp: (iso: string) => string
  add: (rel: string, input: { title: string; active: string; body: string }) => void
}

/** True when there is anything to show: the site has `/page/` and its link only once Merge has written one. */
export const hasPage = (page: MergePage): boolean => page.current !== null || page.history.length > 0

/** `/page/` (spec 9.7): the notes Merge keeps for itself, as they stand and every earlier version. Everything is shown as plain text. */
export function renderPage(i: PageInput): void {
  if (!hasPage(i.page)) return
  const { current } = i.page
  // The newest copy is the page as it stands, so it is not listed again as an earlier version.
  const history = current && i.page.history[0]?.text === current ? i.page.history.slice(1) : i.page.history
  i.add('page/index.html', {
    title: 'Page',
    active: 'page/',
    body: [
      '<h1>Page</h1>',
      '<p class="quiet">Notes Merge keeps for itself, in its own words. They are part of what it is shown every time it thinks. Only Merge writes them, it can change them once a day, and they can never lift a rule: rules are code.</p>',
      current ? paragraphs(current) : '<p class="quiet">The page is empty.</p>',
      ...(history.length > 0
        ? [
            '<h2>Earlier versions</h2>',
            history.map((v) => `<details class="version"><summary>${esc(i.stamp(v.at))}</summary>${v.text ? paragraphs(v.text) : '<p class="quiet">Empty.</p>'}</details>`).join('\n'),
          ]
        : []),
    ].join('\n'),
  })
}
