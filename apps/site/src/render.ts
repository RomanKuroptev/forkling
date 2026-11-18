import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import { Beliefs, BudgetLedger, Forkling, Goals, Health, Interests, isOpenRequest, MindState, SourceStats, Souvenir, TimelineEntry, Trail, type Belief, type InterestSource } from '@forkling/schema'
import { localDate } from '@forkling/sim'
import { STYLE } from './style.ts'
import { buildToday } from './today.ts'
import { FRONT_SCRIPT, frontBody, hoodBody, wakeInfo } from './front.ts'
import { desktopPicturePng } from './desktop-picture.ts'
import { asleepFaceSvg, errorIconSvg, faviconSvg, ICONS, iconFor, iconSvg } from './icons.ts'
import { esc, markdown } from './md.ts'
import { defaultGitLog, parseChanges } from './changes.ts'
import { renderFeed, type FeedItem } from './feed.ts'
import { SINCE_SCRIPT } from './since.ts'
import { loadPlaces, placeChangeLookup, placeFeedItems, renderPlaces } from './places.ts'
import { loadRequests, loadWishes, renderRequests } from './requests.ts'
import { hasPage, loadPage, renderPage } from './page.ts'
import { loadNotes, notesEndpoint, renderNotes, validSiteKey } from './notes.ts'
import { NOTES_SCRIPT } from './notes-script.ts'
import { hasAbout, loadAbout, loadSelfRequests, loadTools, renderAbout } from './self.ts'
import { loadWorks, publishWorks, renderWorkshop } from './workshop.ts'
import { loadProjects, projectChangeLookup, projectFeedItems, publishProjects, renderProjects } from './projects.ts'

/** A moment as `2026-11-03 10:05 (Europe/Stockholm)`: in the forkling's own time zone, as everything else on its site is. */
function localStamp(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} (${timeZone})`
}

/** Rendered from files only: no network, no model. Everything in them was written by the forkling, so all of it is escaped. */

const MAX_WHY_ENTRIES = 400
const MAX_NOTES_SHOWN = 20
const MAX_PLANS_SHOWN = 7
const MAX_WRITINGS_SHOWN = 10
const MAX_PILE_SHOWN = 100

function readJson<T>(world: string, rel: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(readFileSync(join(world, rel), 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function readText(world: string, rel: string): string | null {
  try {
    return readFileSync(join(world, rel), 'utf8')
  } catch {
    return null
  }
}

function files(world: string, rel: string, ext: string): string[] {
  const full = join(world, rel)
  return existsSync(full)
    ? readdirSync(full)
        .filter((f) => f.endsWith(ext))
        .sort()
    : []
}

/** Only web addresses become links. */
function url(raw: string): string | null {
  return /^https?:\/\/[^\s"'<>`]+$/i.test(raw) ? raw : null
}

function anchor(label: string, href: string): string {
  const safe = url(href)
  return safe ? `<a href="${esc(safe)}" rel="noopener noreferrer">${esc(label)}</a>` : esc(label)
}

/** The place a time zone is named after, in words: `Europe/Stockholm` is "Stockholm time". Said once on a page that lists times, instead of after each one. */
const zoneWords = (tz: string) => `${(tz.split('/').pop() ?? tz).replaceAll('_', ' ')} time`

const day = (tz: string, iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const clock = (tz: string, iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

const NAV: [string, string][] = [
  ['Home', 'index.html'],
  ['Journal', 'journal/'],
  ['Notebook', 'notebook/'],
  ['Obsessions', 'obsessions/'],
  ['Notes', 'notes/'],
  ['Workshop', 'workshop/'],
  ['Why?', 'why/'],
  ['Under the hood', 'under-the-hood/'],
]

interface PageInput {
  name: string
  title: string
  /** Path back to the site root from this page, like `../`. */
  root: string
  active: string
  body: string
  /** The links in the header. The archive link is there only when the world has an archive. */
  nav: [string, string][]
  /** Extra tags for the head (share tags), already escaped. */
  head?: string
  /** `bare`: no window round the body (a page that is a desktop of its own). */
  shell?: 'window' | 'bare'
  /** The wallpaper is the starry night sky while Merge sleeps. */
  night?: boolean
  /** The time zone of the clock in the taskbar, and the build time it starts from. */
  timezone?: string
  nowMs?: number
  /** The address of the site, for the share picture's full address in the share tags. */
  baseUrl?: string | undefined
}

/** A page's one-line description for link previews: its first paragraph without tags, cut to 200 characters. */
function descriptionOf(body: string): string {
  const first = /<p[^>]*>([\s\S]*?)<\/p>/.exec(body)?.[1] ?? ''
  const text = first.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
  return text.length > 200 ? `${text.slice(0, 199)}…` : text
}

/** Title, description and the picture for a link preview: a large card, with the desktop picture. Only with the site's address, which a preview needs in full. */
function shareTags(p: PageInput): string {
  if (!p.baseUrl) return ''
  const base = p.baseUrl.endsWith('/') ? p.baseUrl : `${p.baseUrl}/`
  const description = descriptionOf(p.body) || `${p.name} lives here and makes things.`
  return [
    `<meta property="og:title" content="${esc(p.title)} · ${esc(p.name)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:image" content="${esc(base)}share.png">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="description" content="${esc(description)}">`,
  ].join('\n')
}

const clockAt = (tz: string, ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))

/** The taskbar's clock keeps time in Merge's time zone. The page already shows the time it was built; this only moves it on. */
const CLOCK_SCRIPT = `<script>(function(){var c=document.querySelector('.clock');if(!c||!window.Intl)return;function t(){c.textContent=new Intl.DateTimeFormat('en-GB',{timeZone:c.dataset.tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date())}t();setInterval(t,20000)})()</script>
`

/**
 * Every page is a window on Merge's desktop (docs/spec/v4/look.md): the links are desktop icons on a laptop and the start menu of the
 * taskbar (a checkbox and its label, so it works with no script) on any screen. `shell: 'bare'` leaves the window out, for a page that is a desktop
 * of its own (the front page, step 7): its `body` then fills the desktop.
 */
function layout(p: PageInput): string {
  const links = p.nav.map(([label, path]) => ({ label, href: `${p.root}${path}`, current: path === p.active }))
  const cur = (c: boolean) => (c ? ' aria-current="page"' : '')
  const icons = links.map((l) => `<a class="icon" href="${l.href}"${cur(l.current)}><span class="icon-img ic-${iconFor(l.label)}" aria-hidden="true"></span><span>${esc(l.label)}</span></a>`).join('')
  const menu = links.map((l) => `<a href="${l.href}"${cur(l.current)}>${esc(l.label)}</a>`).join('')
  const taskbar = `<footer class="taskbar"><div class="start"><input type="checkbox" id="start-toggle" class="start-toggle" aria-label="Open the start menu"><label class="start-btn" for="start-toggle"><span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Merge 95</label><nav class="menu" aria-label="Pages">${menu}</nav></div><span class="tray">${esc(p.name)}${p.timezone ? ` · <time class="clock" data-tz="${esc(p.timezone)}">${clockAt(p.timezone, p.nowMs ?? 0)}</time> ${esc((p.timezone.split('/').pop() ?? p.timezone).replaceAll('_', ' '))}` : ''}</span></footer>`
  const win = `<div class="window"><div class="title"><span>${esc(p.title)} - ${esc(p.name)}</span><span class="btns" aria-hidden="true"><i></i><i></i><i></i></span></div>
<main>
${p.body}
</main></div>`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)} · ${esc(p.name)}</title>
<link rel="stylesheet" href="${p.root}style.css">
<link rel="alternate" type="application/rss+xml" title="${esc(p.name)}" href="${p.root}feed.xml">
<link rel="icon" type="image/svg+xml" href="${p.root}favicon.svg">
${p.head ? `${p.head}
` : p.baseUrl ? `${shareTags(p)}
` : ''}</head>
<body${p.night ? ' class="night"' : ''}>
<div class="shell">
<nav class="icons" aria-label="Desktop">${icons}</nav>
${p.shell === 'bare' ? `<main class="bare">\n${p.body}\n</main>` : win}
</div>
${taskbar}
${p.timezone ? CLOCK_SCRIPT : ''}</body>
</html>
`
}

const empty = (what: string) => `<p class="quiet">Nothing yet. ${esc(what)}</p>`

function sourceLink(s: InterestSource): string {
  return `${anchor(s.title || s.id, s.url)} <span class="quiet">(${esc(s.id)})</span>`
}

function renderBelief(b: Belief, root: string): string {
  const history = b.history.map((h) => `<li>Used to be: “${esc(h.statement)}” (${h.confidence}). ${esc(h.why)}</li>`).join('')
  void root
  return `<li id="${esc(b.id)}"><strong>${esc(b.statement)}</strong> <span class="quiet">${esc(b.id)}, ${b.confidence} sure, ${esc(b.status)}${b.revisedAt ? `, changed ${esc(b.revisedAt.slice(0, 10))}` : ''}</span>${history ? `<ul class="history">${history}</ul>` : ''}</li>`
}

/** A kept souvenir with where it came from: a quote, a fact with its evidence, or a picture with its licence and credit. */
function souvenirHtml(v: Souvenir): string {
  const from = anchor(v.source.title || v.source.url, v.source.url)
  const why = v.why ? ` ${esc(v.why)}` : ''
  if (v.kind === 'quote') return `<blockquote>${esc(v.content)}</blockquote><span class="quiet">${why} From ${from}.</span>`
  if (v.kind === 'fact') return `<p>${esc(v.content)}</p><span class="quiet">Evidence: “${esc(v.evidence)}”.${why} From ${from}.</span>`
  return `<p>A picture: ${anchor('open it', v.content)}</p><span class="quiet">${esc(v.licence)}, credit ${esc(v.credit)}.${why} From ${from}.</span>`
}

/** One read of a trip: the page, how it felt about it, what it saw, and what it kept there. */
function trailPage(p: Trail['pages'][number], souvenir: Souvenir | undefined): string {
  if (p.failed) return `<li>${anchor(p.title || p.url, p.url)} <span class="quiet">could not be read: ${esc(p.failed)}</span></li>`
  const topics = p.topics.length > 0 ? `, about ${p.topics.map(esc).join(', ')}` : ''
  return `<li><strong>${anchor(p.title || p.url, p.url)}</strong> <span class="quiet">interest ${p.interest ?? '?'}${topics}</span>${p.reaction ? `<p>${esc(p.reaction)}</p>` : ''}${p.look ? `<p class="quiet">It looked at a picture: ${esc(p.look)}</p>` : ''}${souvenir ? `<div class="kept">${souvenirHtml(souvenir)}</div>` : ''}</li>`
}

/** Renders the forkling's website from the files of its world repo. A file that doesn't fit its schema is left out. */
export interface RenderOptions {
  /** The server's address (the `MIND_URL` variable) and the Turnstile site key: with both, `/notes/` has a form (spec 10.1). Without them the mailbox shows as closed. */
  mindUrl?: string | undefined
  turnstileSiteKey?: string | undefined
  /** The address of the site, for the links in the feed, like `https://owner.github.io/merge/`. Without it the feed links are relative. */
  baseUrl?: string | undefined
  /** `false`: the viewer is not built into `world/`, so the front page has no way in. Default: it is (the CLI builds it). */
  viewer?: boolean
  /** The world's history for `changes.json` (see `defaultGitLog`). Injected by a test; a world with no history gives an empty list. */
  gitLog?: () => string
  /** The moment the neglect of places is measured from. The build uses the clock; a test fixes it. The feed and the pages otherwise do not depend on it. */
  now?: Date
}

export function renderSite(world: string, out: string, opts: RenderOptions = {}): { pages: string[] } {
  const forkling = readJson(world, 'forkling.json', Forkling)
  if (!forkling) throw new Error('forkling.json is missing or invalid: there is nobody to show')
  const { name } = forkling
  const tz = forkling.timezone
  const goals = readJson(world, 'mind/goals.json', Goals) ?? {}
  const interests = readJson(world, 'brain/interests.json', Interests) ?? Interests.parse({})
  const beliefs = readJson(world, 'memory/beliefs.json', Beliefs) ?? []
  const journal = files(world, 'journal', '.md')
    .map((f) => ({ date: f.slice(0, -3), text: readText(world, `journal/${f}`) ?? '' }))
    .filter((j) => /^\d{4}-\d{2}-\d{2}$/.test(j.date))
    .sort((a, b) => b.date.localeCompare(a.date))
  const notes = files(world, 'notebook/reading', '.md').sort().reverse().slice(0, MAX_NOTES_SHOWN).map((f) => readText(world, `notebook/reading/${f}`) ?? '')
  const writings = files(world, 'notebook/writing', '.md').sort().reverse().slice(0, MAX_WRITINGS_SHOWN).map((f) => readText(world, `notebook/writing/${f}`) ?? '')
  const plans = files(world, 'notebook/plans', '.md').sort().reverse().slice(0, MAX_PLANS_SHOWN).map((f) => readText(world, `notebook/plans/${f}`) ?? '')
  const timeline = files(world, 'memory/timeline', '.jsonl')
    .flatMap((f) => (readText(world, `memory/timeline/${f}`) ?? '').split('\n').filter(Boolean))
    .flatMap((line) => {
      try {
        const e = TimelineEntry.safeParse(JSON.parse(line))
        return e.success ? [e.data] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_WHY_ENTRIES)

  const pages = new Map<string, string>()
  const archived = files(world, 'archive/journal', '.md')
    .map((f) => ({ date: f.slice(0, -3), text: readText(world, `archive/journal/${f}`) ?? '' }))
    .filter((j) => /^\d{4}-\d{2}-\d{2}$/.test(j.date))
    .sort((a, b) => b.date.localeCompare(a.date))
  // Trails: where it wandered and what it kept. The page and its link are there only once it has made a trip.
  const dayOf = (id: string) => /^(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(id)
  const trails = files(world, 'trails', '.json')
    .flatMap((f) => {
      const trail = readJson(world, `trails/${f}`, Trail)
      return trail && dayOf(trail.id) ? [trail] : []
    })
    .sort((a, b) => b.date.localeCompare(a.date) || Number(dayOf(b.id)![2]) - Number(dayOf(a.id)![2]))
  const souvenirs = new Map(
    files(world, 'souvenirs', '.json').flatMap((f) => {
      const souvenir = readJson(world, `souvenirs/${f}`, Souvenir)
      return souvenir ? [[souvenir.id, souvenir] as const] : []
    }),
  )
  const sourceStats = readJson(world, 'mind/sources.json', SourceStats) ?? SourceStats.parse({})
  const places = loadPlaces(world)
  const requests = loadRequests(world)
  const wishes = loadWishes(world)
  const mergePage = loadPage(world)
  const mergeAbout = loadAbout(world)
  const selfRequests = loadSelfRequests(world)
  const projects = loadProjects(world)
  const nav: [string, string][] = [...NAV, ...(projects.length > 0 ? [['Projects', 'projects/'] as [string, string]] : []), ...(places.length > 0 ? [['Places', 'places/'] as [string, string]] : []), ...(requests.length + wishes.length + selfRequests.length > 0 ? [['Requests', 'requests/'] as [string, string]] : []), ...(trails.length > 0 ? [['Trails', 'trails/'] as [string, string]] : []), ...(hasAbout(mergeAbout) ? [['About', 'about/'] as [string, string]] : []), ...(hasPage(mergePage) ? [['Page', 'page/'] as [string, string]] : []), ...(archived.length > 0 ? [['Archive', 'archive/'] as [string, string]] : [])]
  const extraFiles = new Map<string, string | Buffer>()
  const buildMs = (opts.now ?? new Date()).getTime()
  const add = (rel: string, input: Omit<PageInput, 'name' | 'root' | 'nav'>) => pages.set(rel, layout({ name, root: '../'.repeat(rel.split('/').length - 1), nav, night: forkling.asleep, timezone: forkling.timezone, nowMs: buildMs, baseUrl: opts.baseUrl, ...input }))

  const works = loadWorks(world)
  // Home (step 7): the front page, a desktop of its own. What used to sit here (the plan with its reasons, what it wants) moved to /under-the-hood/.
  const today = buildToday({ projects, works, about: mergeAbout, nowMs: buildMs, tz })
  const endpoint0 = notesEndpoint(opts.mindUrl)
  const siteKey0 = validSiteKey(opts.turnstileSiteKey)
  const i = forkling.intention
  // When Merge wakes next, from the sleep schedule the mind itself uses; the page counts down to it. The boot screen's "days" are the days since its first diary entry.
  const today0 = localDate(tz, buildMs)
  const nextWake = wakeInfo({ nowMs: buildMs, seed: forkling.seed, timezone: tz, lateNight: forkling.lateNight, asleep: forkling.asleep })
  const firstEntry = journal.at(-1)?.date
  const memoryDays = firstEntry ? Math.max(1, Math.round((Date.parse(`${today0}T00:00:00Z`) - Date.parse(`${firstEntry}T00:00:00Z`)) / 86_400_000) + 1) : 0
  add('index.html', {
    title: 'Home',
    active: 'index.html',
    shell: 'bare',
    body: frontBody({
      name,
      asleep: forkling.asleep,
      lastSeen: localStamp(forkling.lastTickAt, forkling.timezone),
      timezone: forkling.timezone,
      intention: { type: i.type, targetId: i.targetId, reason: i.reason },
      today,
      project: today.project ? (projects.find((p) => p.project.id === today.project?.id) ?? null) : null,
      notes: loadNotes(world),
      mailbox: endpoint0 && siteKey0 ? { endpoint: endpoint0, siteKey: siteKey0 } : null,
      viewerUrl: opts.viewer === false ? null : 'world/',
      mindUrl: endpoint0 ? endpoint0.slice(0, -'/notes'.length) : null,
      aboutHref: hasAbout(mergeAbout) ? 'about/' : 'why/',
      wakeMs: nextWake,
      boot: [
        'MERGE 95 BIOS (c) nobody',
        memoryDays > 0 ? `checking memory ......... ${memoryDays} ${memoryDays === 1 ? 'day' : 'days'} OK` : 'checking memory ......... OK',
        `loading ${forkling.species} body ........ OK`,
        `loading opinions ........ ${beliefs.length} OK`,
        `connecting to ${name} ...... ${forkling.asleep ? 'asleep' : 'awake'}`,
      ],
    }),
  })
  add('under-the-hood/index.html', {
    title: 'Under the hood',
    active: 'under-the-hood/',
    body: hoodBody({ goals, interests, budget: readJson(world, 'brain/budget.json', BudgetLedger), health: readJson(world, 'mind/health.json', Health), latestDiary: journal[0]?.date, sourceLink }),
  })

  // Journal.
  const titleOf = (md: string) => /^# (.+)$/m.exec(md)?.[1] ?? ''
  // The night's entry is written on the Batch API and can take a while (spec 9.4); until it lands the page says so. Only that one field of the state is read.
  const writing = readJson(world, 'mind/state.json', MindState.pick({ sleepRewrite: true }))?.sleepRewrite ?? null
  add('journal/index.html', {
    title: 'Journal',
    active: 'journal/',
    body: `<h1>Journal</h1>\n${writing ? `<p class="quiet">The entry for ${esc(writing.date)} is still being written.</p>\n` : ''}${journal.length > 0 ? `<ul>${journal.map((j) => `<li><a href="${esc(j.date)}.html">${esc(j.date)}</a> ${esc(titleOf(j.text))}</li>`).join('')}</ul>` : writing ? '' : empty('It writes a diary entry each night, while it sleeps.')}`,
  })
  journal.forEach((j, n) => {
    const newer = journal[n - 1]
    const older = journal[n + 1]
    add(`journal/${j.date}.html`, {
      title: j.date,
      active: 'journal/',
      body: `${markdown(j.text)}\n<p class="pager">${older ? `<a href="${esc(older.date)}.html">← ${esc(older.date)}</a>` : ''} ${newer ? `<a href="${esc(newer.date)}.html">${esc(newer.date)} →</a>` : ''}</p>`,
    })
  })

  // Archive: the diary it wrote before it was a world builder, kept as it was and not added to.
  if (archived.length > 0) {
    add('archive/index.html', {
      title: 'Archive',
      active: 'archive/',
      body: `<h1>Archive</h1>
<p class="quiet">What it wrote before it started building a world. Kept as it was.</p>
<ul>${archived.map((j) => `<li><a href="journal/${esc(j.date)}.html">${esc(j.date)}</a> ${esc(titleOf(j.text))}</li>`).join('')}</ul>`,
    })
    for (const j of archived) add(`archive/journal/${j.date}.html`, { title: `${j.date} (archive)`, active: 'archive/', body: markdown(j.text) })
  }

  if (trails.length > 0) {
    const kept = (t: Trail) => t.pages.filter((p) => p.souvenirId && souvenirs.has(p.souvenirId)).length
    const pile = [...souvenirs.values()].filter((v) => v.placedIn === null).sort((a, b) => b.id.localeCompare(a.id)).slice(0, MAX_PILE_SHOWN)
    const weeks = Object.entries(sourceStats.weeks).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 4)
    add('trails/index.html', {
      title: 'Trails',
      active: 'trails/',
      body: [
        '<h1>Trails</h1>',
        '<p class="quiet">Every trip it made across the web: where it started, what it read, and what it kept.</p>',
        `<ul>${trails.map((t) => `<li><a href="${esc(t.id)}.html">${esc(t.id)}</a> ${esc(t.purpose)} <span class="quiet">Started from ${esc(t.start.kind)} “${esc(t.start.value)}”. ${t.pages.length} page${t.pages.length === 1 ? '' : 's'}, ${kept(t)} kept.</span></li>`).join('')}</ul>`,
        '<h2>The pile</h2>',
        pile.length > 0 ? `<ul class="pile">${pile.map((v) => `<li>${souvenirHtml(v)}</li>`).join('')}</ul>` : empty('Nothing kept yet.'),
        '<h2>Where it reads</h2>',
        weeks.length > 0
          ? weeks.map(([week, hosts]) => `<h3>${esc(week)}</h3><ul>${Object.entries(hosts).map(([host, h]) => `<li>${esc(host)}: ${h.reads} reads, ${h.souvenirs} kept, ${h.boring} boring, ${h.failures} failed</li>`).join('')}</ul>`).join('')
          : empty('No numbers yet.'),
      ].join('\n'),
    })
    for (const t of trails) {
      add(`trails/${t.id}.html`, {
        title: `Trail ${t.id}`,
        active: 'trails/',
        body: [
          `<h1>Trail ${esc(t.id)}</h1>`,
          `<p>${esc(t.purpose)}</p>`,
          `<p class="quiet">Started from ${esc(t.start.kind)} “${esc(t.start.value)}”.</p>`,
          `<ol class="trail">${t.pages.map((p) => trailPage(p, p.souvenirId ? souvenirs.get(p.souvenirId) : undefined)).join('')}</ol>`,
          '<p class="pager"><a href="index.html">← all trails</a></p>',
        ].join('\n'),
      })
    }
  }

  // Notebook: what it believes, what it read, what it planned.
  const live = beliefs.filter((b) => b.status !== 'dropped').sort((a, b) => b.confidence - a.confidence)
  const dropped = beliefs.filter((b) => b.status === 'dropped')
  add('notebook/index.html', {
    title: 'Notebook',
    active: 'notebook/',
    body: [
      '<h1>Notebook</h1>',
      '<h2>What it believes</h2>',
      live.length > 0 ? `<ul class="beliefs">${live.map((b) => renderBelief(b, '../')).join('')}</ul>` : empty('Beliefs come from what a day teaches it.'),
      ...(dropped.length > 0 ? [`<details><summary>Beliefs it gave up (${dropped.length})</summary><ul class="beliefs">${dropped.map((b) => renderBelief(b, '../')).join('')}</ul></details>`] : []),
      '<h2>What it wrote</h2>',
      writings.length > 0 ? writings.map((w) => `<article class="card">${markdown(w)}</article>`).join('\n') : empty('It writes plaques and short pages.'),
      '<h2>What it read</h2>',
      notes.length > 0 ? notes.map((n) => `<article class="card">${markdown(n)}</article>`).join('\n') : empty('It skims the world every morning.'),
      '<h2>Plans</h2>',
      plans.length > 0 ? plans.map((p) => `<article class="card">${markdown(p)}</article>`).join('\n') : empty('It plans each morning.'),
    ].join('\n'),
  })

  // Obsessions, each traced to where it started.
  const topics = Object.entries(interests.topics).sort((a, b) => b[1].weight - a[1].weight)
  add('obsessions/index.html', {
    title: 'Obsessions',
    active: 'obsessions/',
    body: [
      '<h1>Obsessions</h1>',
      interests.current
        ? `<h2>Now</h2><p><strong>${esc(interests.current.topic)}</strong>, since ${esc(interests.current.startedAt.slice(0, 10))}. It started with ${sourceLink(interests.current.origin)}.</p>`
        : '<p class="quiet">Not obsessed with anything right now.</p>',
      ...(interests.past.length > 0
        ? [`<h2>Before</h2><ul>${[...interests.past].reverse().map((p) => `<li><strong>${esc(p.topic)}</strong>, ${esc(p.startedAt.slice(0, 10))} to ${esc(p.endedAt.slice(0, 10))}. It started with ${sourceLink(p.origin)}.</li>`).join('')}</ul>`]
        : []),
      '<h2>What it is into</h2>',
      topics.length > 0
        ? `<ul>${topics.map(([topic, t]) => `<li>${esc(topic)} <span class="quiet">${Math.round(t.weight)}${t.sources[0] ? `, first from ${sourceLink(t.sources[0])}` : ''}</span></li>`).join('')}</ul>`
        : empty('Interests come from what it reads.'),
    ].join('\n'),
  })

  // Why? Every step it started, with its reason, goal and the beliefs behind it.
  const days = new Map<string, typeof timeline>()
  for (const e of timeline) days.set(day(tz, e.at), [...(days.get(day(tz, e.at)) ?? []), e])
  add('why/index.html', {
    title: 'Why?',
    active: 'why/',
    body: [
      '<h1>Why?</h1>',
      '<p class="quiet">Every step it started, in its own words.</p>',
      timeline.length > 0
        ? [...days]
            .map(
              ([d, entries]) =>
                `<h2>${esc(d)}</h2><ul class="why">${entries
                  .map(
                    (e) =>
                      `<li><time>${esc(clock(tz, e.at))}</time> <strong>${esc(e.verb.replaceAll('_', ' '))}</strong>${e.targetId ? ` (${esc(e.targetId)})` : ''}: <em>${esc(e.reason)}</em>${e.goalRef ? ` <span class="quiet">${esc(e.goalRef)}</span>` : ''}${(e.beliefRefs ?? []).map((b) => ` <a class="belief" href="../notebook/#${esc(b)}">${esc(b)}</a>`).join('')}</li>`,
                  )
                  .join('')}</ul>`,
            )
            .join('\n')
        : empty('Each step it takes is recorded here with its reason.'),
    ].join('\n'),
  })

  // The workshop is always there (spec 8): an empty shelf says so. A work is shown only through its own page, in its sandbox.
  renderWorkshop({ works, tz, goals, add })
  renderProjects({ projects, stamp: (iso) => localStamp(iso, tz), add })
  renderPlaces({
    places,
    works,
    nowMs: (opts.now ?? new Date()).getTime(),
    tz,
    foundings: requests.filter((r) => r.kind === 'place' && isOpenRequest(r)).map((r) => ({ id: r.id, name: r.name, purpose: r.purpose })),
    souvenirHtml,
    readText: (rel) => readText(world, rel),
    readSouvenir: (id) => souvenirs.get(id) ?? null,
    add,
  })
  renderRequests({ requests, wishes, places, selfRequests, tools: loadTools(world), timezone: forkling.timezone, add })
  renderAbout({ about: mergeAbout, built: { places: places.map((p) => ({ id: p.id, name: p.name })), works: works.filter((w) => w.meta.status !== 'scrap').map((w) => ({ id: w.meta.id, title: w.meta.title })) }, add })
  const endpoint = notesEndpoint(opts.mindUrl)
  const siteKey = validSiteKey(opts.turnstileSiteKey)
  renderNotes({ notes: loadNotes(world), places, mailbox: endpoint && siteKey ? { endpoint, siteKey } : null, stamp: (iso) => localStamp(iso, forkling.timezone).replace(/ \([^)]*\)$/, ''), zone: zoneWords(forkling.timezone), nowMs: (opts.now ?? new Date()).getTime(), baseUrl: opts.baseUrl, name, addFile: (rel, text) => void extraFiles.set(rel, text), add })
  renderPage({ page: mergePage, stamp: (iso) => localStamp(iso, forkling.timezone).replace(/ \([^)]*\)$/, ''), zone: zoneWords(forkling.timezone), add })

  // The feed (works shelved, diary entries) and the list of changes the home page panel reads (spec 8).
  const heading = (text: string) => /^# (.+)$/m.exec(text)?.[1]?.trim()
  const summary = (text: string) => text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#') && !/^\*[^*]+\*$/.test(l.trim())).join(' ').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)
  const feedItems: FeedItem[] = [
    ...works.filter((w) => w.meta.status === 'shelf').map((w) => ({ title: `Shelved: ${w.meta.title}`, path: `workshop/${w.meta.id}.html`, at: w.meta.made, description: w.meta.about })),
    ...placeFeedItems(places),
    ...projectFeedItems(projects),
    ...journal.map((j) => ({ title: heading(j.text) ?? j.date, path: `journal/${j.date}.html`, at: `${j.date}T12:00:00Z`, description: summary(j.text) })),
  ]
  const titles = new Map(works.map((w) => [w.meta.id, w.meta.title]))
  let log = ''
  try {
    log = (opts.gitLog ?? (() => defaultGitLog(world)))()
  } catch {
    log = ''
  }
  const changes = parseChanges(log, { titleOf: (id) => titles.get(id), inspiredOf: (id) => { const by = works.find((w) => w.meta.id === id)?.meta.inspiredBy; return by ? by.name || 'a visitor' : undefined },  placeAt: placeChangeLookup(places), projectAt: projectChangeLookup(projects) })
  const home = pages.get('index.html')
  const panel = ['<aside id="since" hidden><h2>Since your last visit</h2><ul></ul></aside>', '<script src="since.js" data-root=""></script>', '</main>'].join('\n')
  if (home) pages.set('index.html', home.replace('</main>', () => panel))

  const written: string[] = []
  const write = (rel: string, text: string | Buffer) => {
    mkdirSync(dirname(join(out, rel)), { recursive: true })
    writeFileSync(join(out, rel), text)
    written.push(rel)
  }
  for (const [rel, html] of pages) write(rel, html)
  for (const [rel, text] of extraFiles) write(rel, text)
  write('style.css', STYLE)
  for (const name of Object.keys(ICONS)) write(`icons/${name}.svg`, iconSvg(name))
  write('favicon.svg', faviconSvg())
  write('icons/asleep-face.svg', asleepFaceSvg())
  write('icons/error.svg', errorIconSvg())
  write('share.png', desktopPicturePng())
  write('today.json', `${JSON.stringify(today, null, 2)}
`)
  write('feed.xml', renderFeed({ name, items: feedItems, baseUrl: opts.baseUrl }))
  write('changes.json', `${JSON.stringify(changes)}
`)
  write('since.js', SINCE_SCRIPT)
  write('notes.js', NOTES_SCRIPT)
  write('front.js', FRONT_SCRIPT)
  written.push(...publishWorks(world, out, works))
  written.push(...publishProjects(world, out, projects))
  return { pages: written }
}
