import type { BudgetLedger, Goals, Health, Interests, Note } from '@forkling/schema'
import { addDays, isAsleepAt, localDate, sleepWindow } from '@forkling/sim'
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

/**
 * When Merge wakes next (Unix ms), from the sleep schedule the mind itself uses. Zero when the state says asleep but the schedule says awake at
 * that moment: the page then claims no wake time.
 */
export function wakeInfo(i: { nowMs: number; seed: number; timezone: string; lateNight?: string | undefined; asleep: boolean }): number {
  const opts = { seed: i.seed, timezone: i.timezone, lateNight: i.lateNight }
  if (i.asleep && !isAsleepAt(i.nowMs, opts)) return 0
  const today = localDate(i.timezone, i.nowMs)
  const wakeOn = (d: string) => sleepWindow(d, i.seed, i.timezone, i.lateNight === d).wakeMs
  return wakeOn(today) > i.nowMs ? wakeOn(today) : wakeOn(addDays(today, 1))
}

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
  /** The framed picture of a card's page to save (a path from the site root), when the build made one. */
  saveFor?: (c: TodayCard) => string | undefined
  /** The next time Merge wakes (Unix ms), from the sleep schedule the mind itself uses. */
  wakeMs: number
  /** The lines of the boot screen, from Merge's own files. */
  boot: string[]
}

function card(c: TodayCard, tz: string, save?: string): string {
  const when = c.day ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }).format(new Date(c.at)) : clock(tz, c.at)
  return `<a class="tcard" href="${esc(c.href)}" data-title="${esc(c.title)}" data-caption="${esc(c.caption)}" data-when="${esc(when)}" data-kind="${esc(c.kind)}" data-image="${esc(encodeURI(c.image))}"${save ? ` data-save="${esc(encodeURI(save))}"` : ''}><span class="pic" role="img" aria-label="${esc(c.title)}" ${bg(c.image)}></span><span class="tmeta"><time datetime="${esc(c.at)}">${esc(when)}</time> · ${esc(c.kind)}</span><span class="tcap">${esc(c.caption)}</span></a>`
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
      i.asleep
        ? `<div class="still asleep" role="img" aria-label="${esc(name)} is asleep: no signal"><span class="badge" id="live-badge">ASLEEP</span><span class="zface" aria-hidden="true"></span><strong class="nosig">NO SIGNAL</strong><span class="nosig-sub">${esc(name)} is asleep. zzz</span></div>`
        : `<div class="still" role="img" aria-label="${esc(name)}'s desktop" style="background-image:url('share.png')"><span class="badge" id="live-badge">LAST SEEN</span></div>`,
      `<p class="right-now" id="live-line">Right now: ${i.asleep ? '<strong>asleep</strong>.' : doing}</p>`,
      '<p class="thought quiet" id="live-thought"></p>',
      `<p class="quiet" id="live-status">${i.asleep ? 'Asleep' : 'Awake'}. Last seen ${esc(i.lastSeen)}.</p>`,
      `<p class="actions">${i.viewerUrl ? `<a class="btn go" href="${esc(i.viewerUrl)}">&#9654; ENTER WORLD</a>` : ''}<a class="btn" href="${esc(i.aboutHref)}">who is ${esc(name)}?</a></p>`,
    ].join('\n'),
    'live',
    ` data-asleep="${i.asleep ? '1' : '0'}" data-wake="${i.wakeMs}" data-tz="${esc(i.timezone)}" data-name="${esc(i.name)}" data-city="${esc((i.timezone.split('/').pop() ?? i.timezone).replaceAll('_', ' '))}" data-seen="${esc(i.lastSeen)}"${i.mindUrl ? ` data-mind="${esc(i.mindUrl)}"` : ''}`,
  )
  const dialog = `<div id="sleep-dialog" class="w95 dialog" role="dialog" aria-label="${esc(name)} is asleep" hidden><div class="title"><h2>${esc(name.toLowerCase())}.exe</h2><span class="btns" aria-hidden="true"><i></i><i></i><i></i></span></div><div class="w95-body"><p class="dlg-text"><span class="dlg-icon" aria-hidden="true"></span><span id="sleep-text">${esc(name)} is asleep.</span></p><p class="quiet">You can still walk around its world and read what it made today.</p><p class="actions"><button id="sleep-ok" type="button">OK</button>${i.viewerUrl ? `<a class="btn go" href="${esc(i.viewerUrl)}">walk around anyway</a>` : ''}<button id="sleep-note" type="button">leave a note for morning</button></p></div></div>`
  const boot = `<div id="boot" class="boot" aria-hidden="true"><div class="boot-in"><div class="boot-logo">MERGE 95</div><p class="boot-sub">an AI lives here</p><div class="boot-lines">${i.boot.map((l) => `<p>${esc(l)}</p>`).join('')}</div><div class="boot-bar"><i></i></div><p class="boot-key">press any key (or don't, it loads anyway)</p></div></div>
<script>${bootScript(i.timezone)}</script>`
  const opened = `<div id="card-open" class="w95 cardopen" role="dialog" aria-label="A card from today" hidden><div class="title"><h2 id="co-title">card</h2><span class="btns"><i aria-hidden="true"></i><i aria-hidden="true"></i><button type="button" id="co-close" class="x" aria-label="Close">x</button></span></div><div class="w95-body co-body"><span id="co-pic" class="co-pic" role="img" aria-label=""></span><div class="co-text"><p class="co-meta" id="co-meta"></p><p class="co-cap" id="co-cap"></p><div class="co-btns"><button type="button" id="co-prev" class="btn">&#9664; prev</button><button type="button" id="co-next" class="btn">next &#9654;</button><button type="button" id="co-share" class="btn go">share</button><a id="co-save" class="btn" href="#" download hidden>save picture</a>${i.viewerUrl ? `<a id="co-world" class="btn" href="${esc(i.viewerUrl)}">see it in the world</a>` : ''}</div><p class="quiet" id="co-count"></p></div></div></div>`
  const cards = win('today', `today.txt - Today ${name}...`, today.cards.length > 0 ? `<div class="cards">${today.cards.map((c) => card(c, i.timezone, i.saveFor?.(c))).join('')}</div><p class="swipe quiet">swipe for more &rarr;</p>` : `<p class="quiet">Nothing made yet. When ${esc(name)} makes something, it shows here.</p>`)

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
    boot,
    `<h1 class="headline">${esc(who)}</h1>`,
    '<div class="desk">',
    `<div class="col-a">${live}</div>`,
    `<div class="col-b">${cards}${project}${notes}</div>`,
    '</div>',
    i.asleep ? dialog : '',
    opened,
    '<p class="foot"><a href="under-the-hood/">Under the hood: the budget, the points and the numbers</a></p>',
    '<script src="front.js" defer></script>',
    '<script src="cards.js" defer></script>',
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
  // Asleep (from the real state: the page's own, and the server's below): a friendly window, once a session, with the wake time from the sleep schedule.
  var dlg = document.getElementById('sleep-dialog')
  function wakeText() {
    var wake = Number(box.getAttribute('data-wake'))
    if (!wake) return 'asleep.'
    var t = new Intl.DateTimeFormat('en-GB', { timeZone: box.getAttribute('data-tz'), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(wake))
    var left = Math.max(0, Math.round((wake - Date.now()) / 60000))
    return 'asleep until ' + t + ' ' + (box.getAttribute('data-city') || '') + ' time (in ' + Math.floor(left / 60) + ' h ' + (left % 60) + ' min).'
  }
  function openSleepDialog() {
    if (!dlg) return
    // A page built before Merge woke: the wake time has passed, so do not claim it is asleep.
    var wakeAt = Number(box.getAttribute('data-wake'))
    if (wakeAt && Date.now() >= wakeAt) return
    try {
      if (window.sessionStorage && sessionStorage.getItem('merge95:sleepdlg')) return
      sessionStorage.setItem('merge95:sleepdlg', '1')
    } catch (e) {}
    document.getElementById('sleep-text').textContent = (box.getAttribute('data-name') || 'Merge') + ' is ' + wakeText()
    dlg.hidden = false
  }
  if (dlg) {
    document.getElementById('sleep-ok').addEventListener('click', function () { dlg.hidden = true })
    document.getElementById('sleep-note').addEventListener('click', function () {
      dlg.hidden = true
      var field = document.getElementById('note-message')
      if (field && field.focus) field.focus()
    })
    if (box.getAttribute('data-asleep') === '1') openSleepDialog()
  }
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
    if (asleep && box.getAttribute('data-asleep') !== '1') {
      box.setAttribute('data-asleep', '1')
      openSleepDialog()
    }
    if (asleep || !now.step) {
      line.textContent = asleep ? 'Right now: asleep.' : 'Right now: resting.'
    } else {
      line.textContent = 'Right now: ' + now.step.verb + (now.step.target ? ' ' + now.step.target : '') + '. ' + now.step.reason
    }
    thought.textContent = now.thought ? '\\u201c' + now.thought + '\\u201d' : ''
    status.textContent = 'Live from the server' + (now.updatedAt ? ', updated ' + String(now.updatedAt).slice(11, 16) + ' UTC' : '') + '.'
  }
  function stale() {
    badge.textContent = box.getAttribute('data-asleep') === '1' ? 'ASLEEP' : 'LAST SEEN'
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

/**
 * `cards.js`: a today card opens big, in a window over the page, with previous and next (buttons, arrow keys, swipe), a share control and a
 * link into the world. Without the script a card is still a link to its page. The words come from the card's own attributes and go in with
 * `textContent` only. Plain ES5.
 */
export const CARDS_SCRIPT = `(function () {
  var dlg = document.getElementById('card-open')
  if (!dlg || !document.querySelectorAll) return
  var cards = Array.prototype.slice.call(document.querySelectorAll('.tcard'))
  if (cards.length === 0) return
  var at = 0
  var opener = null
  function $(id) { return document.getElementById(id) }
  function show(n) {
    at = (n + cards.length) % cards.length
    var c = cards[at]
    var title = c.getAttribute('data-title') || ''
    $('co-title').textContent = title + ' \\u2014 from today.txt'
    $('co-pic').style.backgroundImage = "url('" + (c.getAttribute('data-image') || '').replace(/'/g, '%27').replace(/\\(/g, '%28').replace(/\\)/g, '%29') + "')"
    $('co-pic').setAttribute('aria-label', title)
    $('co-meta').textContent = (c.getAttribute('data-when') || '') + ' \\u00b7 ' + (c.getAttribute('data-kind') || '')
    $('co-cap').textContent = c.getAttribute('data-caption') || ''
    $('co-count').textContent = (at + 1) + ' of ' + cards.length + ' \\u00b7 arrow keys or swipe'
    $('co-share').textContent = 'share'
    var save = c.getAttribute('data-save')
    if ($('co-save')) {
      $('co-save').hidden = !save
      if (save) $('co-save').setAttribute('href', save)
    }
    $('co-prev').hidden = $('co-next').hidden = cards.length < 2
  }
  function open(n, from) {
    opener = from || null
    show(n)
    dlg.hidden = false
    $('co-close').focus()
  }
  function close() {
    dlg.hidden = true
    if (opener && opener.focus) opener.focus()
  }
  cards.forEach(function (c, n) {
    c.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return
      e.preventDefault()
      open(n, c)
    })
  })
  $('co-close').addEventListener('click', close)
  $('co-prev').addEventListener('click', function () { show(at - 1) })
  $('co-next').addEventListener('click', function () { show(at + 1) })
  $('co-share').addEventListener('click', function () {
    var c = cards[at]
    var url = new URL(c.getAttribute('href'), location.href).href
    var data = { title: c.getAttribute('data-title') || '', url: url }
    function copied() { $('co-share').textContent = 'link copied' }
    if (navigator.share) {
      navigator.share(data).catch(function () {})
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(copied, function () {})
    }
  })
  document.addEventListener('keydown', function (e) {
    if (dlg.hidden) return
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowLeft') show(at - 1)
    else if (e.key === 'ArrowRight') show(at + 1)
  })
  var x0 = null
  dlg.addEventListener('touchstart', function (e) { x0 = e.changedTouches[0].clientX })
  dlg.addEventListener('touchend', function (e) {
    if (x0 === null) return
    var dx = e.changedTouches[0].clientX - x0
    x0 = null
    if (Math.abs(dx) > 50) show(at + (dx < 0 ? 1 : -1))
  })
})()
`

/**
 * The boot screen: shown for about 1.5 s on the first visit of the day (counted in Merge's time zone, kept in `localStorage`), skipped when motion is turned
 * down, and never shown when the browser blocks storage (it could not be once a day). Any key or tap ends it. It runs before the page paints.
 */
export const bootScript = (tz: string): string => `(function () {
  var root = document.documentElement
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    var day = new Intl.DateTimeFormat('en-CA', { timeZone: ${JSON.stringify(tz)} }).format(new Date())
    if (localStorage.getItem('merge95:boot') === day) return
    localStorage.setItem('merge95:boot', day)
  } catch (e) {
    return
  }
  root.classList.add('booting')
  function end() {
    root.classList.remove('booting')
    document.removeEventListener('keydown', end)
    document.removeEventListener('pointerdown', end)
  }
  document.addEventListener('keydown', end)
  document.addEventListener('pointerdown', end)
  setTimeout(end, 1500)
})()`

const usd = (n: number) => `$${n.toFixed(2)}`
const calls = (n: number) => `${n} ${n === 1 ? 'call' : 'calls'}`
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

  // The month in progress is the table above; an older file may also list it in the history, which would read as nothing spent.
  const earlier = budget?.history.filter((h) => h.month !== budget.month) ?? []
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
        Object.keys(budget.byKind).length > 0 ? `<h3>By kind of call</h3><table>${Object.entries(budget.byKind).map(([k, t]) => row(k, `${calls(t.calls)}, ${usd(t.usd)}`)).join('')}</table>` : '',
        earlier.length > 0 ? `<h3>Earlier months</h3><table>${earlier.map((h) => row(h.month, `${usd(h.spentUsd)}, ${calls(h.calls)}`)).join('')}</table>` : '',
      ].join('\n')
    : '<h2>Budget</h2><p class="quiet">No budget file yet.</p>'

  const state = health
    ? [
        '<h2>Points and health</h2>',
        `<table>${[
          row('Points in hand', `${Math.round(health.allowance.points)} of ${Math.round(health.allowance.max)}${health.allowance.daily ? `, ${Math.round(health.allowance.daily)} a day` : ''}`),
          row('Engine', health.engine),
          row('Health updated', health.updatedAt),
          row('Last tick', health.lastTick.summary ? `${health.lastTick.at}: ${health.lastTick.summary}` : health.lastTick.at),
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
