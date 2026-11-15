import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSelfRequest, type SelfRequest } from '@forkling/schema'
import { esc, markdown } from './md.ts'

export interface AboutCopy {
  date: string
  text: string
}

export interface MergeAbout {
  /** `self/about.md` as it stands, or null if there is none. */
  current: string | null
  /** The weekly copies in `self/history/`, newest first, each with the reasons its week changed it. */
  history: AboutCopy[]
}

/** Merge's own words about itself (spec 9.2) and the copy kept each week it changed. A history file whose name is not a date is left out. */
export function loadAbout(world: string): MergeAbout {
  const file = join(world, 'self/about.md')
  const current = existsSync(file) ? readFileSync(file, 'utf8').trim() : null
  const folder = join(world, 'self/history')
  const history = existsSync(folder)
    ? readdirSync(folder)
        .flatMap((f) => {
          const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(f)
          return m ? [{ date: m[1]!, text: readFileSync(join(folder, f), 'utf8').trim() }] : []
        })
        .sort((a, b) => b.date.localeCompare(a.date))
    : []
  return { current, history }
}

export const hasAbout = (about: MergeAbout): boolean => (about.current !== null && about.current !== '') || about.history.length > 0

/** What Merge asked Roman in its weekly reviews (spec 9.5), newest first, with his answer where he gave one. A file that is not a request is left out. */
export function loadSelfRequests(world: string): SelfRequest[] {
  const folder = join(world, 'self/requests')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .flatMap((f) => {
      try {
        const parsed = parseSelfRequest(f.slice(0, -3), readFileSync(join(folder, f), 'utf8'))
        return parsed ? [parsed] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

export interface AboutInput {
  about: MergeAbout
  add: (rel: string, input: { title: string; active: string; body: string }) => void
}

/** A weekly copy is a heading the code wrote, the text as it became, and `## Why it changed` with a line for each change. */
function splitCopy(text: string): { body: string; reasons: string } {
  const withoutHeading = text.replace(/^# .*\n+/, '')
  const at = withoutHeading.search(/\n## Why it changed\s*\n/)
  if (at < 0) return { body: withoutHeading.trim(), reasons: '' }
  return { body: withoutHeading.slice(0, at).trim(), reasons: withoutHeading.slice(at).replace(/^\n## Why it changed\s*\n/, '').trim() }
}

/** `/about/` (spec 9.2): who Merge says it is now, and each weekly copy with why it changed. Written only once there is something to show. */
export function renderAbout(i: AboutInput): void {
  if (!hasAbout(i.about)) return
  const { current } = i.about
  // The newest copy is about.md as it stands: it is not listed again as an earlier version, and its reasons go under the current text.
  const newest = i.about.history[0]
  const latest = current && newest && splitCopy(newest.text).body === current ? newest : null
  const history = latest ? i.about.history.slice(1) : i.about.history
  const why = latest ? splitCopy(latest.text).reasons : ''
  i.add('about/index.html', {
    title: 'About',
    active: 'about/',
    body: [
      '<h1>About</h1>',
      '<p class="quiet">Who Merge says it is now, in its own words. Only Merge writes it: on Sunday evening it may rewrite it, up to 30% of the lines in a week, and every version is kept below with the reasons it changed.</p>',
      current ? markdown(current) : '<p class="quiet">Nothing current: there is only the history.</p>',
      ...(latest && why ? [`<h2>Why it last changed</h2>`, `<p class="quiet">Changed on ${esc(latest.date)}.</p>`, markdown(why)] : []),
      ...(history.length > 0
        ? ['<h2>Earlier versions</h2>', history.map((c) => `<details class="version"><summary>${esc(c.date)}</summary>${markdown(splitCopy(c.text).body + (splitCopy(c.text).reasons ? `\n\n## Why it changed\n\n${splitCopy(c.text).reasons}` : ''))}</details>`).join('\n')]
        : []),
    ].join('\n'),
  })
}
