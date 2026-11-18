import type { BudgetLedger, Goals, Health, Interests, Note } from '@forkling/schema'
import { esc } from './md.ts'
import { noteFormCompact } from './notes.ts'
import type { SiteProject } from './projects.ts'
import type { Today, TodayCard } from './today.ts'

/**
 * The front page `/` (spec v4 9, step 7 slice B) and `/under-the-hood/`. The front page is a desktop of its own in the Merge 95 look: who Merge
 * is, Merge live (what it is doing, from the world repo, and from the server when it answers), what Merge made today as picture cards, the
 * project it is building, and the note box. It loads no 3D: "ENTER WORLD" is a link, so the page is just HTML and a little script.
 * Pictures are backgrounds on spans, never `<img>` tags.
 */

/** A picture as a background, for a path from the site root. Anything that could break out of the `url()` is escaped. */
const bg = (path: string) => `style="background-image:url('${esc(encodeURI(path).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29'))}')"`

const win = (id: string, title: string, body: string, cls = '', attrs = '') =>
  `<section class="w95 ${cls}" id="${id}"${attrs}><div class="title"><h2>${esc(title)}</h2><span class="btns" aria-hidden="true"><i></i><i></i><i></i></span></div><div class="w95-body">${body}</div></section>`

const clock = (tz: string, iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
const dayOf = (tz: string, iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

export interface FrontInput {
  name: string
  asleep: boolean
  /** Merge's last tick as words, in its time zone. */
  lastSeen: string
  timezone: string
  intention: { type: string; targetId?: string | undefined; reason: string }
  today: Today
  project: SiteProject | null
  notes: readonly Note[]
  mailbox: { endpoint: string; siteKey: string } | null
  viewerUrl: string | null
  /** The server's address (no trailing slash) when Merge live can ask it. */
  mindUrl: string | null
  aboutHref: string
}

function card(c: TodayCard, tz: string): string {
  const when = c.day ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }).format(new Date(c.at)) : clock(tz, c.at)
  return `<a class="tcard" href="${esc(c.href)}"><span class="pic" role="img" aria-label="${esc(c.title)}" ${bg(c.image)}></span><span class="tmeta"><time datetime="${esc(c.at)}">${esc(when)}</time> · ${esc(c.kind)}</span><span class="tcap">${esc(c.caption)}</span></a>`
}

/** The newest note that Merge answered, as the two chat rows of the notes page. */
function chat(notes: readonly Note[], merge: string): string {
  const n = notes.find((x) => x.status === 'replied' && x.reply)
  if (!n) return ''
  return `<div class="msg visitor"><strong class="who">${esc(n.name || 'A visitor')}:</strong> ${esc(cut(n.message, 110))}</div><div class="msg merge"><strong class="who">${esc(merge)}:</strong> ${esc(cut(n.reply ?? "", 120))}</div>`
}

export function frontBody(i: FrontInput): string {
  const { name, today } = i
  const who = today.who || `${name} is an AI. It lives here and makes things.`
  const doing = `<strong>${esc(i.intention.type.replaceAll('_', ' '))}${i.intention.targetId ? ` ${esc(i.intention.targetId)}` : ''}</strong>. <em>${esc(i.intention.reason)}</em>`
  const live = win(
    'live',
    `${name.toLowerCase()}.exe`,
    [
      `<div class="still" role="img" aria-label="${esc(name)}'s desktop" style="background-image:url('share.png')"><span class="badge" id="live-badge">${i.asleep ? 'ASLEEP' : 'LAST SEEN'}</span></div>`,
      `<p class="right-now" id="live-line">Right now: ${doing}</p>`,
      '<p class="thought quiet" id="live-thought"></p>',
      `<p class="quiet" id="live-status">${i.asleep ? 'Asleep' : 'Awake'}. Last seen ${esc(i.lastSeen)}.</p>`,
      `<p class="actions">${i.viewerUrl ? `<a class="btn go" href="${esc(i.viewerUrl)}">&#9654; ENTER WORLD</a>` : ''}<a class="btn" href="${esc(i.aboutHref)}">who is ${esc(name)}?</a></p>`,
    ].join('\n'),
    'live',
    i.mindUrl ? ` data-mind="${esc(i.mindUrl)}" data-seen="${esc(i.lastSeen)}"` : '',
  )
  const cards = win('today', `today.txt - Today ${name}...`, today.cards.length > 0 ? `<div class="cards">${today.cards.map((c) => card(c, i.timezone)).join('')}</div><p class="swipe quiet">swipe for more &rarr;</p>` : `<p class="quiet">Nothing made yet. When ${esc(name)} makes something, it shows here.</p>`)

  let project = ''
  if (i.project) {
    const { project: p, shots } = i.project
    const startDay = Date.parse(`${dayOf(i.timezone, p.started)}T00:00:00Z`)
    const thumbs = p.sessions
      .flatMap((s, n) => (shots[n] ? [{ s, shot: shots[n] as string }] : []))
      .slice(-4)
      .map(({ s, shot }) => `<a class="thumb" href="projects/${esc(p.id)}/" aria-label="${esc(s.caption)}"><span class="pic" ${bg(`projects/${p.id}/${shot}`)}></span><span class="day">day ${Math.round((Date.parse(`${dayOf(i.timezone, s.at)}T00:00:00Z`) - startDay) / 86_400_000) + 1}</span></a>`)
      .join('')
    const last = p.sessions.at(-1)
    project = win('project', `PROJECT: ${p.name}`, `${thumbs ? `<div class="thumbs">${thumbs}</div>` : ''}<p><strong>Goal:</strong> ${esc(p.aim)}</p>${last ? `<p class="quiet">Latest: ${esc(cut(last.caption, 160))}</p>` : ''}<p class="quiet"><a href="projects/${esc(p.id)}/">Open the project</a></p>`)
  }

  const noteBody = [
    chat(i.notes, name),
    i.mailbox ? noteFormCompact(i.mailbox, '') : '<p><strong>The mailbox is closed for now.</strong> Notes cannot be left at the moment.</p>',
    '<p class="quiet"><a href="notes/">All the notes</a></p>',
  ].join('\n')
  const notes = win('notebox', `notes.exe - say hi to ${name}`, noteBody)

  return [
    `<h1 class="headline">${esc(who)}</h1>`,
    '<div class="desk">',
    `<div class="col-a">${live}</div>`,
    `<div class="col-b">${cards}${project}${notes}</div>`,
    '</div>',
    '<p class="foot"><a href="under-the-hood/">Under the hood: the budget, the points and the numbers</a></p>',
    '<script src="front.js" defer></script>',
  ].join('\n')
}

/**
 * `front.js`: Merge live. Reads `now.json` from the server every 30 seconds and shows the step in progress, the last thought and awake or
 * asleep; the wallpaper follows. If the server does not answer it shows the last committed state, which the page already says, and when it was.
 * Words go in with `textContent` only. Plain ES5.
 */
export const FRONT_SCRIPT = `(function () {
  var box = document.getElementById('live')
  if (!box) return
  var mind = box.getAttribute('data-mind')
  if (!mind) return
  var badge = document.getElementById('live-badge')
  var line = document.getElementById('live-line')
  var thought = document.getElementById('live-thought')
  var status = document.getElementById('live-status')
  var seen = box.getAttribute('data-seen') || ''
  function show(now) {
    var asleep = !!now.asleep
    badge.textContent = asleep ? 'ASLEEP' : 'LIVE'
    if (document.body && document.body.classList) document.body.classList.toggle('night', asleep)
    if (asleep || !now.step) {
      line.textContent = asleep ? 'Right now: asleep.' : 'Right now: resting.'
    } else {
      line.textContent = 'Right now: ' + now.step.verb + (now.step.target ? ' ' + now.step.target : '') + '. ' + now.step.reason
    }
    thought.textContent = now.thought ? '\\u201c' + now.thought + '\\u201d' : ''
    status.textContent = 'Live from the server' + (now.updatedAt ? ', updated ' + String(now.updatedAt).slice(11, 16) + ' UTC' : '') + '.'
  }
  function stale() {
    badge.textContent = 'LAST SEEN'
    status.textContent = 'The server did not answer. This is the last state saved in the repo, from ' + seen + '.'
  }
  function poll() {
    fetch(mind + '/now.json', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('not ready')
        return r.json()
      })
      .then(show)
      .catch(stale)
  }
  poll()
  setInterval(poll, 30000)
})()
`

const usd = (n: number) => `$${n.toFixed(2)}`
const row = (a: string, b: string) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`

export interface HoodInput {
  goals: Goals
  interests: Interests
  budget: BudgetLedger | null
  health: Health | null
  /** The date of the newest diary entry, for its link. */
  latestDiary?: string | undefined
  sourceLink: (s: NonNullable<Interests['current']>['origin']) => string
}

/** Everything that left the front page: Merge's plan with its reasons, the budget, the points, the health warnings and the tick numbers. Nothing here is left out, only moved. */
export function hoodBody(i: HoodInput): string {
  const { goals, interests, budget, health } = i
  const plan = [
    '<h2>What it wants and plans</h2>',
    goals.long ? `<p>${esc(goals.long.text)}</p><p class="quiet">${esc(goals.long.reason)}</p>` : '<p class="quiet">No long wish yet.</p>',
    goals.today ? `<h3>Today</h3><p>${esc(goals.today.reason)}</p><ol>${goals.today.steps.map((s, n) => `<li${goals.now?.index === n ? ' class="now"' : ''}>${esc(s.verb)}${s.targetId ? ` (${esc(s.targetId)})` : ''}: ${esc(s.reason)}</li>`).join('')}</ol>` : '<p class="quiet">No plan for today yet.</p>',
    interests.current ? `<h3>Obsessed with</h3><p><strong>${esc(interests.current.topic)}</strong>, since ${esc(interests.current.startedAt.slice(0, 10))}. It started with ${i.sourceLink(interests.current.origin)}.</p>` : '',
    i.latestDiary ? `<h3>Latest diary entry</h3><p><a href="../journal/${esc(i.latestDiary)}.html">${esc(i.latestDiary)}</a></p>` : '',
    '<p><a href="../why/">The timeline of steps and reasons</a></p>',
  ].join('\n')

  const money = budget
    ? [
        '<h2>Budget</h2>',
        `<table>${[
          row('Month', budget.month),
          row('Spent on models', usd(budget.spentUsd)),
          row('Model cap', usd(budget.capUsd)),
          row('Server', usd(budget.serverUsd)),
          row('Calls this month', String(budget.calls.length)),
        ].join('')}</table>`,
        Object.keys(budget.byKind).length > 0 ? `<h3>By kind of call</h3><table>${Object.entries(budget.byKind).map(([k, t]) => row(k, `${t.calls} calls, ${usd(t.usd)}`)).join('')}</table>` : '',
        budget.history.length > 0 ? `<h3>Earlier months</h3><table>${budget.history.map((h) => row(h.month, `${usd(h.spentUsd)}, ${h.calls} calls`)).join('')}</table>` : '',
      ].join('\n')
    : '<h2>Budget</h2><p class="quiet">No budget file yet.</p>'

  const state = health
    ? [
        '<h2>Points and health</h2>',
        `<table>${[
          row('Points in hand', `${Math.round(health.allowance.points)} of ${Math.round(health.allowance.max)}${health.allowance.daily ? `, ${Math.round(health.allowance.daily)} a day` : ''}`),
          row('Engine', health.engine),
          row('Health updated', health.updatedAt),
          row('Last tick', `${health.lastTick.at}: ${health.lastTick.summary}`),
          row('Ticks today', String(health.today.ticks)),
          row('Decide calls today', String(health.today.decideCalls)),
          row('Failures, rejections today', `${health.today.failures}, ${health.today.rejections}`),
          row('Longest gap between ticks', `${health.today.longestGapMinutes} minutes`),
          row('Plan steps left', String(health.plan.stepsLeft)),
          row('Spend this month (health)', `${usd(health.spend.monthUsd)} of ${usd(health.spend.capUsd)}, pace ${usd(health.spend.paceUsd)}`),
        ].join('')}</table>`,
        health.warnings.length > 0 ? `<h3>Warnings</h3><ul>${health.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="quiet">No warnings.</p>',
      ].join('\n')
    : '<h2>Points and health</h2><p class="quiet">No health file yet.</p>'

  return ['<h1>Under the hood</h1>', '<p class="quiet">What used to sit on the front page: the numbers behind what Merge does.</p>', plan, money, state].join('\n')
}
