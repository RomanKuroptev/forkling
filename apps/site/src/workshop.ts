import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasPolicy, WorkMeta, workFrame, type Goals, type WorkLibrary } from '@forkling/schema'
import { esc } from './md.ts'

/** A work the site may show: its meta fits the schema, it sits in the folder of its own id, and (unless it is a scrap) its page carries the policy. */
export interface SiteWork {
  meta: WorkMeta
  hasThumb: boolean
}

const MAX_STRIP_DAYS = 14

/** Only web addresses become links. */
function anchor(label: string, href: string): string {
  return /^https?:\/\/[^\s"'<>`]+$/i.test(href) ? `<a href="${esc(href)}" rel="noopener noreferrer">${esc(label)}</a>` : esc(label)
}

const dayOf = (tz: string, iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

function localStamp(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} (${timeZone})`
}

const LIBRARY_NAMES: Record<WorkLibrary, string> = { p5: 'p5.js', tone: 'Tone.js', three: 'three.js' }

/**
 * The works in `works/`, newest first. A work whose meta does not fit its schema, whose folder is not its id, or whose page is
 * missing is left out; so is a shelved or retired work whose page does not start with the policy tag (spec 7.4), since the site
 * would show it in a frame the policy does not cover. A scrap is never shown, so its page is not looked at.
 */
export function loadWorks(world: string): SiteWork[] {
  const folder = join(world, 'works')
  if (!existsSync(folder)) return []
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        const parsed = WorkMeta.safeParse(JSON.parse(readFileSync(join(folder, entry.name, 'meta.json'), 'utf8')))
        if (!parsed.success || parsed.data.id !== entry.name) return []
        const page = join(folder, entry.name, 'index.html')
        if (!existsSync(page)) return []
        if (parsed.data.status !== 'scrap' && !hasPolicy(readFileSync(page, 'utf8'))) return []
        return [{ meta: parsed.data, hasThumb: existsSync(join(folder, entry.name, 'thumb.png')) }]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.meta.made.localeCompare(a.meta.made))
}

/** Copies the page and the thumbnail of every work that is shown to `out/works/<id>/`. Nothing else of a work, and nothing of a scrap. */
export function publishWorks(world: string, out: string, works: readonly SiteWork[]): string[] {
  const written: string[] = []
  for (const { meta, hasThumb } of works) {
    if (meta.status === 'scrap') continue
    mkdirSync(join(out, 'works', meta.id), { recursive: true })
    copyFileSync(join(world, 'works', meta.id, 'index.html'), join(out, 'works', meta.id, 'index.html'))
    written.push(`works/${meta.id}/index.html`)
    if (hasThumb) {
      copyFileSync(join(world, 'works', meta.id, 'thumb.png'), join(out, 'works', meta.id, 'thumb.png'))
      written.push(`works/${meta.id}/thumb.png`)
    }
  }
  return written
}

export interface WorkshopInput {
  works: readonly SiteWork[]
  tz: string
  goals: Goals
  /** Adds a page. The path back to the root is worked out from the path of the page. */
  add: (rel: string, input: { title: string; active: string; body: string }) => void
}

const kindLine = (m: WorkMeta) => `${esc(m.kind)}${m.size === 'sketch' ? ', a sketch' : ''}`

/** The workshop of the site (spec 8): the shelf, the daily strip of sketches, the scrap bin, each work in its sandbox, and the retired ones. */
export function renderWorkshop(o: WorkshopInput): void {
  const shown = o.works.filter((w) => w.meta.status !== 'scrap')
  const shelf = shown.filter((w) => w.meta.status === 'shelf')
  const retired = shown.filter((w) => w.meta.status === 'retired')
  const scrap = o.works.filter((w) => w.meta.status === 'scrap')
  const byId = new Map(shown.map((w) => [w.meta.id, w.meta]))

  const card = (w: SiteWork, to: string, thumbs: string) =>
    `<li class="work">${w.hasThumb ? `<a href="${to}${w.meta.id}.html"><img src="${thumbs}works/${w.meta.id}/thumb.png" alt="" loading="lazy" width="240" height="180"></a> ` : ''}<strong><a href="${to}${w.meta.id}.html">${esc(w.meta.title)}</a></strong> <span class="quiet">${kindLine(w.meta)}</span><p>${esc(w.meta.about)}</p></li>`

  // What is on the bench: a tinker step in progress.
  const step = o.goals.now ? o.goals.today?.steps[o.goals.now.index] : undefined
  const bench =
    step?.verb === 'tinker'
      ? `<p><strong>${esc(step.targetId ?? 'something')}</strong>${step.size === 'sketch' ? ' <span class="quiet">(a sketch)</span>' : ''}: <em>${esc(step.reason)}</em></p>`
      : '<p class="quiet">Nothing on the bench.</p>'

  // Sketches, day by day: the last days that have a shelved sketch.
  const days = new Map<string, SiteWork[]>()
  for (const w of shelf.filter((x) => x.meta.size === 'sketch')) days.set(dayOf(o.tz, w.meta.made), [...(days.get(dayOf(o.tz, w.meta.made)) ?? []), w])
  const strip = [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, MAX_STRIP_DAYS)
    .map(([d, list]) => `<li><strong>${esc(d)}</strong><ul class="shelf">${list.map((w) => card(w, '', '../')).join('')}</ul></li>`)
    .join('')

  o.add('workshop/index.html', {
    title: 'Workshop',
    active: 'workshop/',
    body: [
      '<h1>Workshop</h1>',
      '<h2>On the bench now</h2>',
      bench,
      '<h2>The shelf</h2>',
      shelf.length > 0 ? `<ul class="shelf">${shelf.map((w) => card(w, '', '../')).join('')}</ul>` : '<p class="quiet">Nothing on the shelf yet.</p>',
      ...(retired.length > 0 ? [`<p><a href="retired/">Put away (${retired.length})</a></p>`] : []),
      '<h2>Sketches, day by day</h2>',
      strip ? `<ul class="strip">${strip}</ul>` : '<p class="quiet">No sketch yet.</p>',
      '<h2>Scrap bin</h2>',
      scrap.length > 0
        ? `<ul>${scrap.map((w) => `<li><strong>${esc(w.meta.title)}</strong> <span class="quiet">${kindLine(w.meta)}</span><p>${esc(w.meta.scrapReason ?? '')}</p></li>`).join('')}</ul>`
        : '<p class="quiet">Nothing in the bin.</p>',
    ].join('\n'),
  })

  if (retired.length > 0) {
    o.add('workshop/retired/index.html', {
      title: 'Put away',
      active: 'workshop/',
      body: [
        '<h1>Put away</h1>',
        '<p><a href="../../workshop/">Back to the workshop</a></p>',
        `<ul class="shelf">${retired.map((w) => `<li class="work">${w.hasThumb ? `<a href="../${w.meta.id}.html"><img src="../../works/${w.meta.id}/thumb.png" alt="" loading="lazy" width="240" height="180"></a> ` : ''}<strong><a href="../${w.meta.id}.html">${esc(w.meta.title)}</a></strong> <span class="quiet">${kindLine(w.meta)}</span><p>${esc(w.meta.about)}</p><p class="quiet">Put away: ${esc(w.meta.retireReason ?? '')}</p></li>`).join('')}</ul>`,
      ].join('\n'),
    })
  }

  for (const { meta } of shown) {
    const remixedBy = shown.filter((w) => w.meta.remixOf === meta.id)
    const source = meta.remixOf ? byId.get(meta.remixOf) : undefined
    o.add(`workshop/${meta.id}.html`, {
      title: meta.title,
      active: 'workshop/',
      body: [
        '<p class="quiet"><a href="./">Workshop</a></p>',
        `<h1>${esc(meta.title)}</h1>`,
        `<p class="quiet">${kindLine(meta)}. Made ${esc(localStamp(meta.made, o.tz))}.${meta.interest ? ` It grew from ${esc(meta.interest)}.` : ''}${meta.libraries.length > 0 ? ` Uses ${meta.libraries.map((l) => esc(LIBRARY_NAMES[l])).join(', ')}.` : ''}</p>`,
        ...(meta.status === 'retired' ? [`<p class="quiet">Put away: ${esc(meta.retireReason ?? '')}</p>`] : []),
        `<div class="work-frame">${workFrame(`../works/${meta.id}/index.html`, meta.title)}</div>`,
        `<p>${esc(meta.about)}</p>`,
        ...(meta.remixOf ? [source ? `<p>A remix of <a href="${esc(source.id)}.html">${esc(source.title)}</a>.</p>` : `<p>A remix of ${esc(meta.remixOf)} (it is no longer here).</p>`] : []),
        ...(remixedBy.length > 0 ? [`<p>Remixed by ${remixedBy.map((w) => `<a href="${esc(w.meta.id)}.html">${esc(w.meta.title)}</a>`).join(', ')}.</p>`] : []),
        ...(meta.sources.length > 0 ? ['<h2>What it riffs on</h2>', `<ul>${meta.sources.map((s) => `<li>${s.role === 'looked' ? 'Looked at' : 'Read'}: ${anchor(s.url, s.url)}</li>`).join('')}</ul>`] : []),
        ...(meta.constraint
          ? [`<p class="quiet">The constraint it was given: ${esc(meta.constraint.text)}${meta.constraint.refused ? ` Merge refused it: ${esc(meta.constraint.reason ?? '')}` : ''}</p>`]
          : []),
      ].join('\n'),
    })
  }
}
