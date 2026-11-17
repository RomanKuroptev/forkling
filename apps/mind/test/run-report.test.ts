import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildRunReport, formatRunReport } from '../src/run-report.ts'

const roots: string[] = []
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

function world(): string {
  const dir = mkdtempSync(join(tmpdir(), 'run-report-'))
  roots.push(dir)
  put(dir, 'forkling.json', { name: 'Merge', species: 'cat', timezone: 'Europe/Stockholm' })
  return dir
}

function put(dir: string, rel: string, value: unknown): void {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

const lines = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n'

function git(dir: string, args: string[], at?: string): void {
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    stdio: 'ignore',
    env: { ...process.env, ...(at ? { GIT_COMMITTER_DATE: at, GIT_AUTHOR_DATE: at } : {}) },
  })
}

const work = (id: string, kind: string, made: string, over: Record<string, unknown> = {}) => ({
  id,
  title: id.replace(/-/g, ' '),
  kind,
  about: 'A thing.',
  interest: null,
  made,
  status: 'shelf',
  size: 'sketch',
  installedIn: null,
  ...over,
})

const place = (id: string, name: string, history: unknown[], over: Record<string, unknown> = {}) => ({ id, name, purpose: 'x', tags: [], founded: '2026-11-11', chunk: [0, 0], exterior: {}, rooms: [{ id: 'main' }], exhibits: [], history, ...over })

const tick = (at: string, over: Record<string, unknown> = {}) => ({ at, engine: 'dev', asleep: false, triggers: [], think: null, calls: [], notes: [], stepBefore: null, stepAfter: null, planId: null, mood: 'calm', wrote: [], summary: '', ...over })

/** Every file under a folder with its size and time, to show the report writes nothing. */
function snapshot(dir: string): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    for (const f of readdirSync(join(dir, rel))) {
      const r = rel ? `${rel}/${f}` : f
      const s = statSync(join(dir, r))
      if (s.isDirectory()) walk(r)
      else out.push(`${r} ${s.size} ${s.mtimeMs}`)
    }
  }
  walk('')
  return out.sort()
}

describe('run report on a world from today (no projects, threads or tool requests)', () => {
  const dir = world()
  put(dir, 'works/sand-sketch/meta.json', work('sand-sketch', 'art', '2026-11-20T09:00:00Z', { installedIn: 'workshop/bench-room/5/0' }))
  put(dir, 'works/stand-still/meta.json', work('stand-still', 'game', '2026-11-20T15:30:00Z'))
  put(dir, 'works/second-sand/meta.json', work('second-sand', 'art', '2026-11-21T10:00:00Z'))
  put(dir, 'works/broken/meta.json', work('broken', 'tool', '2026-11-21T11:00:00Z', { status: 'scrap', scrapReason: 'did not run' }))
  put(dir, 'works/old/meta.json', work('old', 'zine', '2026-11-10T11:00:00Z'))
  put(dir, 'works/garbage/meta.json', '{ not json')
  put(dir, 'places/workshop.json', place('workshop', 'Workshop', [
    { at: '2026-11-11T08:00:00Z', verb: 'found', summary: 'Founded.' },
    { at: '2026-11-20T12:00:00Z', verb: 'expand', summary: 'Added a bench room.' },
    { at: '2026-11-21T13:00:00Z', verb: 'tend', summary: 'Moved a lamp.' },
  ], { rooms: [{ id: 'main' }, { id: 'bench-room' }], exhibits: [{ id: 'a' }] }))
  put(dir, 'places/broken.json', '[')
  put(dir, 'notes/n-1.json', { id: 'n-1', name: 'Roman', message: 'Hi', placeId: 'home', at: '2026-11-20T09:28:00Z', status: 'replied', foundAt: '2026-11-20T14:48:00Z', reply: 'Yes.' })
  put(dir, 'notes/n-2.json', { id: 'n-2', name: '', message: 'Hey', placeId: 'home', at: '2026-11-21T22:30:00Z', status: 'declined', foundAt: '2026-11-22T07:00:00Z', declineReason: 'no' })
  put(dir, 'notes/n-3.json', { id: 'n-3', name: 'Ana', message: 'Yo', placeId: 'home', at: '2026-11-21T10:00:00Z', status: 'new', foundAt: null })
  put(dir, 'brain/budget.json', { month: '2026-11', capUsd: 15, serverUsd: 8, spentUsd: 4.2, calls: [], byKind: {}, history: [] })
  put(dir, 'mind/ticks/2026-11-20.jsonl', lines([
    tick('2026-11-20T06:00:00Z', { calls: [{ kind: 'decide', model: 'claude-haiku-5-5', usd: 0.01, ok: true }] }),
    tick('2026-11-20T06:01:00Z', { notes: ['plan rejected: a plan has 3 to 8 steps'] }),
    tick('2026-11-20T06:02:00Z', { calls: [{ kind: 'tinker', model: 'claude-sonnet-5-5', usd: 0.2, ok: true }, { kind: 'decide', model: 'claude-haiku-5-5', usd: 0, ok: false, error: 'monthly budget reached' }] }),
    // 20 minutes down while awake
    tick('2026-11-20T06:22:00Z', { calls: [{ kind: 'thought', model: 'claude-haiku-5-5', usd: 0.001, ok: false, error: 'refused', stop: 'refusal' }], web: { requests: 2, refused: 1 } }),
    tick('2026-11-20T06:23:00Z', { asleep: true }),
    tick('2026-11-20T06:24:00Z', { asleep: true }),
  ]))
  put(dir, 'mind/ticks/2026-11-21.jsonl', lines([tick('2026-11-21T08:00:00Z', { calls: [{ kind: 'decide', model: 'claude-haiku-5-5', usd: 0.05, ok: true }] }), 'not json']))
  writeFileSync(join(dir, 'mind/ticks/2026-11-21.jsonl'), readFileSync(join(dir, 'mind/ticks/2026-11-21.jsonl'), 'utf8') + 'not json\n')

  const before = snapshot(dir)
  const report = buildRunReport(dir, { from: '2026-11-20', to: '2026-11-22', git: false })
  const text = formatRunReport(report)

  it('counts things made in the run by kind, with each kind\'s share, and leaves out scraps and older work', () => {
    expect(report.made.items.map((m) => m.id)).toEqual(['sand-sketch', 'stand-still', 'second-sand'])
    expect(report.made.byKind).toEqual([
      { kind: 'art', count: 2, share: 2 / 3 },
      { kind: 'game', count: 1, share: 1 / 3 },
    ])
    expect(report.made.scrapped).toBe(1)
    expect(text).toContain('art: 2 (67%)')
  })

  it('lists changes to the world\'s shape and what each place holds', () => {
    expect(report.shape).toHaveLength(1)
    expect(report.shape[0]).toMatchObject({ placeId: 'workshop', verb: 'expand', summary: 'Added a bench room.', holds: '2 rooms, 1 exhibit, 1 work on its screens' })
  })

  it('gives the local times something new and visual appeared, day by day', () => {
    expect(report.visual.map((d) => d.times.map((t) => t.time))).toEqual([['10:00', '13:00', '16:30'], ['11:00', '14:00'], []])
    expect(text).toContain('2026-11-22: nothing')
  })

  it('gives each visitor note the time to its answer, and says whether it came the same day', () => {
    expect(report.notes.map((n) => [n.id, n.answerMinutes, n.sameDay])).toEqual([
      ['n-1', 320, true],
      ['n-3', null, false],
      ['n-2', 510, false],
    ])
    expect(text).toContain('Roman: replied after 5.3 h, same day')
    expect(text).toContain('Ana: no answer yet')
  })

  it('adds up spend per day from the tick log, and the month from the ledger', () => {
    expect(report.spend.byDay).toEqual([
      { date: '2026-11-20', usd: 0.211, source: 'ticks' },
      { date: '2026-11-21', usd: 0.05, source: 'ticks' },
      { date: '2026-11-22', usd: 0, source: 'ledger' },
    ])
    expect(text).toContain('month 2026-11: $4.20 of $15.00')
  })

  it('counts waking hours up from the tick log, with a long gap counted as down', () => {
    const day = report.up.byDay[0]!
    expect(day.wakingHours).toBe(0.4)
    expect(day.wakingUpHours).toBe(0.1)
    expect(report.up.byDay[2]!.share).toBeNull()
  })

  it('counts the guard stops, failed calls, refusals, plan rejections and web refusals', () => {
    expect(report.ticks[0]).toMatchObject({ ticks: 6, guardStops: 1, failedCalls: 1, refusals: 1, planRejections: 1, webRefused: 1 })
    expect(text).toContain('the guard stopped a call: 1')
  })

  it('reads the parts of later steps as none yet', () => {
    expect(report.projects).toBeNull()
    expect(report.threads).toBeNull()
    expect(report.toolRequests).toBeNull()
    expect(report.tools).toBeNull()
    expect(report.made.inspiredByVisitor).toBeNull()
    expect(text).toMatch(/Projects\n {2}none yet/)
    expect(text).toContain('threads: none yet')
    expect(text).toMatch(/Tool requests\n {2}none yet/)
    expect(text).toContain('made because of a visitor: none yet')
  })

  it('writes nothing to the world', () => {
    expect(snapshot(dir)).toEqual(before)
  })
})

describe('run report on a later world (projects, threads, tool requests)', () => {
  const dir = world()
  put(dir, 'projects/marble-run/project.json', {
    id: 'marble-run',
    name: 'Marble run',
    aim: 'A marble that rolls.',
    started: '2026-11-20',
    status: 'done',
    reason: 'It rolls all the way down now.',
    sessions: [
      { at: '2026-11-20T10:00:00Z', caption: 'a ramp', usd: 0.4, turns: 10, shot: 'shots/1.png', broken: false },
      { at: '2026-11-21T10:00:00Z', caption: 'a loop', usd: 0.5, turns: 12, shot: 'shots/2.png', broken: false },
    ],
    inspiredBy: { noteId: 'n-1', name: 'Roman' },
    installedIn: null,
  })
  put(dir, 'projects/sky/project.json', { id: 'sky', name: 'Sky', status: 'abandoned', reason: 'Too slow for a browser.', sessions: [{ at: '2026-11-21T12:00:00Z', shot: 'shots/1.png' }], inspiredBy: null })
  put(dir, 'projects/new/project.json', { id: 'new', name: 'New', status: 'building', sessions: [] })
  put(dir, 'works/a/meta.json', work('a', 'meme', '2026-11-20T09:00:00Z', { inspiredBy: null }))
  put(dir, 'notes/n-1.json', { id: 'n-1', name: 'Roman', message: 'Hi', placeId: 'home', at: '2026-11-20T09:00:00Z', status: 'replied', foundAt: '2026-11-20T10:00:00Z', reply: 'Hi', thread: 'n-1' })
  put(dir, 'notes/n-2.json', { id: 'n-2', name: 'Roman', message: 'And?', placeId: 'home', at: '2026-11-20T11:00:00Z', status: 'replied', foundAt: '2026-11-20T12:00:00Z', reply: 'So.', thread: 'n-1', replyTo: 'n-1' })
  put(dir, 'memory/visitors.json', { visitors: [{ name: 'Roman' }] })
  put(dir, 'self/requests/2026-11-21.md', '---\nkind: tool\ntitle: "A way to hear sound"\nstatus: later\nanswer: Maybe.\n---\nI would like to hear.\n')
  put(dir, 'self/requests/2026-11-14.md', '---\nstatus: open\n---\nAn old request with no kind.\n')
  put(dir, 'mind/tools.json', { tools: [{ id: 'read', name: 'read a few web sites', since: '2026-11-01', class: 'read', gift: false }] })
  put(dir, 'memory/stream/2026-11-21.jsonl', lines([
    { id: '2026-11-21#1', at: '2026-11-21T18:00:00Z', kind: 'event', text: 'I gave up my long goal "lidar page": it kept slipping.' },
    { id: '2026-11-21#2', at: '2026-11-21T18:00:00Z', kind: 'event', text: 'I looked at my long goal and kept it: still good.' },
  ]))

  const report = buildRunReport(dir, { from: '2026-11-20', to: '2026-11-21', git: false })
  const text = formatRunReport(report)

  it('lists projects by status with their session counts', () => {
    expect(report.projects?.map((p) => [p.id, p.status, p.sessions])).toEqual([
      ['marble-run', 'done', 2],
      ['new', 'building', 0],
      ['sky', 'abandoned', 1],
    ])
    expect(text).toContain('done: 1 project, 2 sessions')
  })

  it('counts a project worked on in the run as a thing made, and credits a visitor', () => {
    expect(report.made.byKind).toEqual([
      { kind: 'project', count: 2, share: 2 / 3 },
      { kind: 'meme', count: 1, share: 1 / 3 },
    ])
    expect(report.made.inspiredByVisitor).toBe(1)
  })

  it('shows each session screenshot as something visual', () => {
    expect(report.visual[1]!.times.map((t) => t.what)).toEqual(['project "Marble run" session', 'project "Sky" session'])
  })

  it('gives goal and project changes with Merge\'s reasons, and leaves out a goal kept', () => {
    expect(report.goals.map((g) => g.text)).toEqual(['I gave up my long goal "lidar page": it kept slipping.'])
    expect(report.projectChanges.map((p) => p.text)).toEqual(['Marble run: done, It rolls all the way down now.', 'Sky: abandoned, Too slow for a browser.'])
  })

  it('counts threads, visitors, tool requests and tools', () => {
    expect(report.threads).toEqual({ threads: 1, longest: 2 })
    expect(report.visitors).toBe(1)
    expect(report.toolRequests).toEqual([{ date: '2026-11-21', kind: 'tool', title: 'A way to hear sound', status: 'later' }])
    expect(text).toContain('tools: read a few web sites')
  })
})

describe('run report with git history', () => {
  const dir = world()
  git(dir, ['init', '-q'])
  const goals = (text: string, setAt: string) => ({ long: { text, reason: `because ${text}`, setAt, reviewedAt: setAt } })
  put(dir, 'mind/goals.json', goals('first goal', '2026-11-19T08:00:00Z'))
  put(dir, 'brain/budget.json', { month: '2026-11', capUsd: 15, spentUsd: 1, calls: [] })
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-qm', 'one'], '2026-11-19T20:00:00Z')
  put(dir, 'mind/goals.json', goals('second goal', '2026-11-20T08:00:00Z'))
  put(dir, 'brain/budget.json', { month: '2026-11', capUsd: 15, spentUsd: 1.75, calls: [] })
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-qm', 'two'], '2026-11-20T20:00:00Z')
  put(dir, 'mind/goals.json', goals('third goal', '2026-11-21T08:00:00Z'))
  // A full ledger that reaches back only to the 21st.
  put(dir, 'brain/budget.json', { month: '2026-11', capUsd: 15, spentUsd: 3, calls: Array.from({ length: 500 }, () => ({ at: '2026-11-21T09:00:00Z', kind: 'thought', model: 'claude-haiku-5-5', input: 1, cacheRead: 0, cacheWrite: 0, output: 1, usd: 0.001 })) })
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-qm', 'three'], '2026-11-21T20:00:00Z')

  const report = buildRunReport(dir, { from: '2026-11-20', to: '2026-11-21' })

  it('finds every long goal set in the run from the history, with its reason', () => {
    expect(report.goals.map((g) => g.text)).toEqual(['My long goal is now "second goal": because second goal', 'My long goal is now "third goal": because third goal'])
  })

  it('takes a day\'s spend from the git history when the ledger no longer reaches back to it', () => {
    expect(report.spend.byDay[0]).toEqual({ date: '2026-11-20', usd: 0.75, source: 'git' })
    expect(report.spend.byDay[1]).toMatchObject({ date: '2026-11-21', source: 'git' })
  })
})

describe('run report arguments', () => {
  it('refuses dates that are not dates, or the wrong way round', () => {
    const dir = world()
    expect(() => buildRunReport(dir, { from: '20 Nov', to: '2026-11-21' })).toThrow(/dates/)
    expect(() => buildRunReport(dir, { from: '2026-11-22', to: '2026-11-21' })).toThrow(/after/)
  })

  it('reads an empty world without failing', () => {
    const text = formatRunReport(buildRunReport(world(), { from: '2026-11-20', to: '2026-11-20' }))
    expect(text).toContain('Things made: 0')
    expect(text).toContain('2026-11-20: unknown')
  })
})
