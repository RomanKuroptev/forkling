import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import { Artifact, Beliefs, Forkling, Goals, Interests, TimelineEntry, type Belief, type InterestSource } from '@forkling/schema'
import { sanitizeSvg } from '@forkling/sim'
import { STYLE } from './style.ts'
import { esc, markdown } from './md.ts'

/** Rendered from files only: no network, no model. Everything in them was written by the forkling, so all of it is escaped. */

const TONE = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js'
const MAX_WHY_ENTRIES = 400
const MAX_NOTES_SHOWN = 20
const MAX_PLANS_SHOWN = 7

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

const day = (tz: string, iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const clock = (tz: string, iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

const NAV: [string, string][] = [
  ['Home', 'index.html'],
  ['Journal', 'journal/'],
  ['Notebook', 'notebook/'],
  ['Gallery', 'gallery/'],
  ['Obsessions', 'obsessions/'],
  ['Why?', 'why/'],
]

interface PageInput {
  name: string
  title: string
  /** Path back to the site root from this page, like `../`. */
  root: string
  active: string
  body: string
  scripts?: string
}

function layout(p: PageInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)} · ${esc(p.name)}</title>
<link rel="stylesheet" href="${p.root}style.css">
</head>
<body>
<header>
<a class="name" href="${p.root}index.html">${esc(p.name)}</a>
<nav>${NAV.map(([label, path]) => `<a href="${p.root}${path}"${path === p.active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
</header>
<main>
${p.body}
</main>
${p.scripts ?? ''}</body>
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

function renderArtifact(a: Artifact): string {
  let content: string
  switch (a.kind) {
    case 'writing':
      content = a.content.text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
      break
    case 'drawing': {
      const svg = sanitizeSvg(a.content.svg)
      content = svg ? `<figure class="drawing">${svg}</figure>` : '<p class="quiet">This drawing could not be shown.</p>'
      break
    }
    case 'melody':
      content = `<button type="button" class="play" data-melody="${esc(JSON.stringify({ bpm: a.content.bpm, notes: a.content.notes }))}">▶ Play</button> <span class="quiet">${a.content.notes.length} notes at ${a.content.bpm} bpm</span>`
      break
    case 'recipe':
      content = `<table><tbody>${a.content.ingredients.map((i) => `<tr><td>${esc(i.name)}</td><td>${i.grams} g</td></tr>`).join('')}</tbody></table><ol>${a.content.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`
      break
    case 'broadcast':
      content = `<p class="script">${esc(a.content.script)}</p>`
      break
    case 'labnote':
      content = `<dl><dt>Question</dt><dd>${esc(a.content.question)}</dd><dt>What I did</dt><dd>${esc(a.content.method)}</dd><dt>What happened</dt><dd>${esc(a.content.result)}</dd></dl>`
      break
  }
  const served = [a.goalRef ? `for ${esc(a.goalRef)}` : '', a.obsessionRef ? `while obsessed with ${esc(a.obsessionRef)}` : ''].filter(Boolean).join(', ')
  return `<article class="card" id="${esc(a.id)}"><h3>${esc(a.title)}</h3><p class="quiet">${esc(a.kind)}, skill ${a.skillLevel}, ${esc(a.createdAt.slice(0, 10))}${served ? `, ${served}` : ''}</p>${content}</article>`
}

/** Renders the forkling's website from the files of its world repo. A file that doesn't fit its schema is left out. */
export function renderSite(world: string, out: string): { pages: string[] } {
  const forkling = readJson(world, 'forkling.json', Forkling)
  if (!forkling) throw new Error('forkling.json is missing or invalid: there is nobody to show')
  const { name } = forkling
  const tz = forkling.timezone
  const goals = readJson(world, 'mind/goals.json', Goals) ?? {}
  const interests = readJson(world, 'brain/interests.json', Interests) ?? Interests.parse({})
  const beliefs = readJson(world, 'memory/beliefs.json', Beliefs) ?? []
  const art = files(world, 'art', '.json')
    .flatMap((f) => {
      const a = readJson(world, `art/${f}`, Artifact)
      return a ? [a] : []
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const journal = files(world, 'journal', '.md')
    .map((f) => ({ date: f.slice(0, -3), text: readText(world, `journal/${f}`) ?? '' }))
    .filter((j) => /^\d{4}-\d{2}-\d{2}$/.test(j.date))
    .sort((a, b) => b.date.localeCompare(a.date))
  const notes = files(world, 'notebook/reading', '.md').sort().reverse().slice(0, MAX_NOTES_SHOWN).map((f) => readText(world, `notebook/reading/${f}`) ?? '')
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
  const add = (rel: string, input: Omit<PageInput, 'name' | 'root'>) => pages.set(rel, layout({ name, root: '../'.repeat(rel.split('/').length - 1), ...input }))

  // Home: who it is, what it wants, what it is doing and why.
  const step = goals.now ? goals.today?.steps[goals.now.index] : undefined
  const i = forkling.intention
  const latest = art[0]
  add('index.html', {
    title: 'Home',
    active: 'index.html',
    body: [
      `<h1>${esc(name)}</h1>`,
      `<p class="quiet">${esc(forkling.species)}, feeling ${esc(forkling.mood)}${forkling.asleep ? ', asleep' : ''}. Last seen ${esc(forkling.lastTickAt.slice(0, 16).replace('T', ' '))} UTC.</p>`,
      '<h2>Right now</h2>',
      `<p><strong>${esc(i.type.replaceAll('_', ' '))}</strong>${i.targetId ? ` at ${esc(i.targetId)}` : ''}: <em>${esc(i.reason)}</em></p>`,
      ...(step?.topic ? [`<p class="quiet">About ${esc(step.topic)}.</p>`] : []),
      goals.long ? `<h2>What it wants</h2><p>${esc(goals.long.text)}</p><p class="quiet">${esc(goals.long.reason)}</p>` : '',
      goals.today
        ? `<h2>Today</h2><p>${esc(goals.today.reason)}</p><ol>${goals.today.steps.map((s, n) => `<li${goals.now?.index === n ? ' class="now"' : ''}>${esc(s.verb)}${s.targetId ? ` (${esc(s.targetId)})` : ''}: ${esc(s.reason)}</li>`).join('')}</ol>`
        : '',
      interests.current
        ? `<h2>Obsessed with</h2><p><strong>${esc(interests.current.topic)}</strong>, since ${esc(interests.current.startedAt.slice(0, 10))}. It started with ${sourceLink(interests.current.origin)}.</p>`
        : '',
      journal[0] ? `<h2>Latest diary entry</h2><p><a href="journal/${esc(journal[0].date)}.html">${esc(journal[0].date)}</a></p>` : '',
      latest ? `<h2>Latest work</h2><p><a href="gallery/#${esc(latest.id)}">${esc(latest.title)}</a> <span class="quiet">(${esc(latest.kind)})</span></p>` : '',
    ].join('\n'),
  })

  // Journal.
  const titleOf = (md: string) => /^# (.+)$/m.exec(md)?.[1] ?? ''
  add('journal/index.html', {
    title: 'Journal',
    active: 'journal/',
    body: `<h1>Journal</h1>\n${journal.length > 0 ? `<ul>${journal.map((j) => `<li><a href="${esc(j.date)}.html">${esc(j.date)}</a> ${esc(titleOf(j.text))}</li>`).join('')}</ul>` : empty('It writes a diary entry at bedtime.')}`,
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
      '<h2>What it read</h2>',
      notes.length > 0 ? notes.map((n) => `<article class="card">${markdown(n)}</article>`).join('\n') : empty('It skims the world every morning.'),
      '<h2>Plans</h2>',
      plans.length > 0 ? plans.map((p) => `<article class="card">${markdown(p)}</article>`).join('\n') : empty('It plans each morning.'),
    ].join('\n'),
  })

  // Gallery.
  const hasMelody = art.some((a) => a.kind === 'melody')
  const kinds = new Set(art.map((a) => a.kind))
  add('gallery/index.html', {
    title: 'Gallery',
    active: 'gallery/',
    body: `<h1>Gallery</h1>\n${art.length > 0 ? `<p class="quiet">${art.length} ${art.length === 1 ? 'piece' : 'pieces'}, ${kinds.size} ${kinds.size === 1 ? 'kind' : 'kinds'}.</p>\n${art.map(renderArtifact).join('\n')}` : empty('Everything it makes is kept here.')}`,
    ...(hasMelody
      ? {
          scripts: `<script src="${TONE}"></script>
<script>
document.querySelectorAll('[data-melody]').forEach(function (button) {
  button.addEventListener('click', async function () {
    var m = JSON.parse(button.getAttribute('data-melody'));
    await Tone.start();
    var synth = new Tone.Synth().toDestination();
    var beat = 60 / m.bpm;
    var t = Tone.now();
    m.notes.forEach(function (n) {
      if (n.pitch !== 'R') synth.triggerAttackRelease(n.pitch, n.beats * beat * 0.9, t);
      t += n.beats * beat;
    });
  });
});
</script>
`,
        }
      : {}),
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
        ? `<ul>${topics.map(([topic, t]) => `<li>${esc(topic)} <span class="quiet">${t.weight}${t.sources[0] ? `, first from ${sourceLink(t.sources[0])}` : ''}</span></li>`).join('')}</ul>`
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

  const written: string[] = []
  const write = (rel: string, text: string) => {
    mkdirSync(dirname(join(out, rel)), { recursive: true })
    writeFileSync(join(out, rel), text)
    written.push(rel)
  }
  for (const [rel, html] of pages) write(rel, html)
  write('style.css', STYLE)
  return { pages: written }
}
