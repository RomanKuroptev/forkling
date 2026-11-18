import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSelfRequest, Tools, type SelfRequest, type Tool } from '@forkling/schema'
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

/** What Roman has given Merge (`mind/tools.json`, spec v4 8), without the entries of class act (the engine does not start with one). A missing or broken file is no tools. */
export function loadTools(world: string): Tool[] {
  try {
    const parsed = Tools.safeParse(JSON.parse(readFileSync(join(world, 'mind/tools.json'), 'utf8')))
    return parsed.success ? parsed.data.tools.filter((t) => t.class === 'read') : []
  } catch {
    return []
  }
}

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
  /** What Merge has built, listed under its own words (spec v4 6). */
  built?: { places: readonly { id: string; name: string }[]; works: readonly { id: string; title: string }[] }
  /** Numbers for the tiles at the top; a tile with no value is left out. */
  stats?: { alive: number; made: number; into: string | null; visitors: number }
  add: (rel: string, input: { title: string; active: string; body: string }) => void
}

/** The tiles of the who-am-i page (docs/spec/v4/look/site/who-am-i.png), from numbers the world repo already gives. */
export function statTiles(s: NonNullable<AboutInput['stats']>): string {
  const tiles: [string, string][] = []
  if (s.alive > 0) tiles.push(['alive', `${s.alive} ${s.alive === 1 ? 'day' : 'days'}`])
  if (s.made > 0) tiles.push(['made', `${s.made} ${s.made === 1 ? 'thing' : 'things'}`])
  if (s.into) tiles.push(['into now', s.into])
  if (s.visitors > 0) tiles.push(['visitors met', String(s.visitors)])
  return tiles.length > 0 ? `<div class="stats">${tiles.map(([k, v]) => `<div class="stat"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>` : ''
}

/** A weekly copy is a heading the code wrote, the text as it became, and `## Why it changed` with a line for each change. */
function splitCopy(text: string): { body: string; reasons: string } {
  const withoutHeading = text.replace(/^# .*\n+/, '')
  const at = withoutHeading.search(/\n## Why it changed\s*\n/)
  if (at < 0) return { body: withoutHeading.trim(), reasons: '' }
  return { body: withoutHeading.slice(0, at).trim(), reasons: withoutHeading.slice(at).replace(/^\n## Why it changed\s*\n/, '').trim() }
}

/** What Merge has built, as links under its words (spec v4 6): its places and the works on its shelf. Nothing is written when it has built nothing. */
function builtLines(built: AboutInput['built']): string[] {
  if (!built || (built.places.length === 0 && built.works.length === 0)) return []
  return [
    '<h2>What it has built</h2>',
    ...(built.places.length > 0 ? [`<p>Places: ${built.places.map((p) => `<a href="../places/${esc(p.id)}/">${esc(p.name)}</a>`).join(', ')}.</p>`] : []),
    ...(built.works.length > 0 ? [`<p>Works: ${built.works.map((w) => `<a href="../workshop/${esc(w.id)}.html">${esc(w.title)}</a>`).join(', ')}.</p>`] : []),
  ]
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
      '<h1 class="about-head"><span class="aface" aria-hidden="true"></span>About</h1>',
      '<p class="quiet">Who Merge says it is now, in its own words. Only Merge writes it: on Sunday evening it may rewrite it, at most once a week, and every version is kept below with the reasons it changed.</p>',
      ...(i.stats ? [statTiles(i.stats)] : []),
      current ? `<div class="about-body">${markdown(current)}</div>` : '<p class="quiet">Nothing current: there is only the history.</p>',
      ...builtLines(i.built),
      ...(latest && why ? [`<h2>Why it last changed</h2>`, `<p class="quiet">Changed on ${esc(latest.date)}.</p>`, markdown(why)] : []),
      ...(history.length > 0
        ? ['<h2>Earlier versions</h2>', history.map((c) => `<details class="version"><summary>${esc(c.date)}</summary>${markdown(splitCopy(c.text).body + (splitCopy(c.text).reasons ? `\n\n## Why it changed\n\n${splitCopy(c.text).reasons}` : ''))}</details>`).join('\n')]
        : []),
    ].join('\n'),
  })
}
