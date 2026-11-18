import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Project, withPolicy } from '@forkling/schema'
import { parseChanges } from '../src/changes.ts'
import { loadProjects, projectChangeLookup } from '../src/projects.ts'
import { dayOfProject } from '../src/projects.ts'
import { renderSite } from '../src/render.ts'

/** Step 4, slice D: `/projects/` and `/projects/<id>/` (spec-v4 3.4), from the template world with one project in each status. */

const templateWorld = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const HTML = withPolicy('<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body><canvas></canvas><script src="main.js"></script></body></html>')

let world: string
let out: string
const put = (rel: string, content: string | Buffer) => {
  mkdirSync(dirname(join(world, rel)), { recursive: true })
  writeFileSync(join(world, rel), content)
}
const page = (rel: string) => readFileSync(join(out, rel), 'utf8')
const session = (n: number, caption: string, over: Record<string, unknown> = {}) => ({ at: `2026-11-1${n}T10:00:00.000Z`, caption, usd: 0.2, turns: 8, shot: `shots/${n}.png`, broken: false, engine: false, ...over })
const putProject = (id: string, over: Record<string, unknown>) => {
  const p = Project.parse({ id, name: id.replace('-', ' '), aim: `the aim of ${id}`, started: '2026-11-10T09:00:00.000Z', status: 'building', reason: null, sessions: [], inspiredBy: null, installedIn: null, ...over })
  put(`projects/${id}/project.json`, JSON.stringify(p))
  for (const s of p.sessions) if (s.shot) put(`projects/${id}/${s.shot}`, PNG)
  put(`projects/${id}/src/index.html`, HTML)
  put(`projects/${id}/src/main.js`, 'const c = 1')
  return p
}

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'projects-world-'))
  out = mkdtempSync(join(tmpdir(), 'projects-out-'))
  cpSync(templateWorld, world, { recursive: true })
  putProject('tide-clock', { sessions: [session(1, 'a blue square'), session(2, 'Stopped at the session limit.', { broken: true, engine: true })] })
  putProject('sand-clock', { status: 'done', reason: 'it tells the time now', sessions: [session(1, 'sand falls'), session(3, 'the glass turns')] })
  putProject('cloud-loom', { status: 'abandoned', reason: 'clouds would not hold still', sessions: [session(2, 'grey threads')], inspiredBy: { noteId: 'n-2026-11-12-aaaaaa', name: 'Ada <i>' } })
  putProject('new-thing', {})
})

describe('the projects pages', () => {
  it('list every project beside a detail with its day pictures, status and the log of its sessions, one chosen with no script', () => {
    renderSite(world, out, { gitLog: () => '' })
    const list = page('projects/index.html')
    for (const id of ['tide-clock', 'sand-clock', 'cloud-loom', 'new-thing']) {
      expect(list).toContain(`href="${id}/"`)
      expect(list).toContain(`id="wp-${id}"`)
      expect(list).toContain(`#wp-${id}:checked ~ .wdetail .wd-${id}{display:block}`)
    }
    expect(list.match(/<input type="radio"[^>]* checked>/g)?.length).toBe(1)
    expect(list).toContain("background-image:url('tide-clock/shots/2.png')")
    expect(list).toMatch(/<strong>sand clock<\/strong><small>day \d+ · done, 2 sessions/)
    expect(list).toMatch(/<strong>cloud loom<\/strong><small>day \d+ · dropped/)
    expect(list).toMatch(/day [0-9]+ &gt; /)
    expect(list).toContain('the glass turns')
    expect(page('index.html')).toContain('href="projects/"')
  })

  it('counts days from the day a project started, in the time zone of the forkling', () => {
    expect(dayOfProject('Europe/Stockholm', '2026-11-16T22:30:00Z', '2026-11-16T22:30:00Z')).toBe(1)
    expect(dayOfProject('Europe/Stockholm', '2026-11-16T22:30:00Z', '2026-11-17T08:00:00Z')).toBe(2)
    expect(dayOfProject('Europe/Stockholm', '2026-11-16T08:00:00Z', '2026-11-18T08:00:00Z')).toBe(3)
  })

  it('show the timelapse in order, with the captions and which sessions were broken', () => {
    renderSite(world, out, { gitLog: () => '' })
    const p = page('projects/tide-clock/index.html')
    expect(p.indexOf('shots/1.png')).toBeLessThan(p.indexOf('shots/2.png'))
    expect(p).toContain('a blue square')
    expect(p).toMatch(/Stopped at the session limit\. <span class="quiet">\(broken\)/)
    expect(existsSync(join(out, 'projects/tide-clock/shots/1.png'))).toBe(true)
  })

  it('run a done project in the same sandboxed frame as a work, with its files, and only a done one', () => {
    renderSite(world, out, { gitLog: () => '' })
    const done = page('projects/sand-clock/index.html')
    expect(done).toMatch(/<iframe[^>]*sandbox="allow-scripts"/)
    expect(done).toContain('src="src/index.html"')
    expect(done).toContain('Done: it tells the time now')
    expect(existsSync(join(out, 'projects/sand-clock/src/main.js'))).toBe(true)
    expect(page('projects/tide-clock/index.html')).not.toContain('<iframe')
    expect(existsSync(join(out, 'projects/tide-clock/src/index.html'))).toBe(false)
  })

  it('do not run a done project whose page lost its policy', () => {
    put('projects/sand-clock/src/index.html', '<html><body>no policy</body></html>')
    renderSite(world, out, { gitLog: () => '' })
    expect(page('projects/sand-clock/index.html')).not.toContain('<iframe')
  })

  it('keep a dropped project with its reason, and the note it came from', () => {
    renderSite(world, out, { gitLog: () => '' })
    const p = page('projects/cloud-loom/index.html')
    expect(p).toContain('Dropped: clouds would not hold still')
    expect(p).toContain('a note from Ada &lt;i&gt;')
  })

  it('show a project with no session yet', () => {
    renderSite(world, out, { gitLog: () => '' })
    expect(page('projects/new-thing/index.html')).toContain('No session yet.')
  })

  it('say there are none in a world with no projects, with no nav link', () => {
    const empty = mkdtempSync(join(tmpdir(), 'projects-empty-'))
    cpSync(templateWorld, empty, { recursive: true })
    renderSite(empty, out, { gitLog: () => '' })
    expect(page('projects/index.html')).toContain('Nothing yet.')
    expect(page('index.html')).not.toContain('href="projects/"')
  })

  it('link the timelapse video when there is one', () => {
    put('projects/sand-clock/share/timelapse.mp4', Buffer.from('mp4'))
    renderSite(world, out, { gitLog: () => '' })
    expect(page('projects/sand-clock/index.html')).toContain('href="share/timelapse.mp4"')
    expect(existsSync(join(out, 'projects/sand-clock/share/timelapse.mp4'))).toBe(true)
  })
})

describe('the feed and changes.json', () => {
  it('the feed has a project started, worked on, finished and dropped', () => {
    renderSite(world, out, { gitLog: () => '' })
    const feed = page('feed.xml')
    expect(feed).toContain('Started a project: tide clock')
    expect(feed).toContain('Worked on tide clock')
    expect(feed).toContain('Finished: sand clock')
    expect(feed).toContain('Dropped: cloud loom')
  })

  it('changes.json says started, worked on, finished and dropped, from what each commit added', () => {
    const lookup = projectChangeLookup(loadProjects(world))
    const log = [
      '@@2026-11-13T10:00:00+00:00', 'A\tprojects/sand-clock/shots/3.png', 'M\tprojects/sand-clock/project.json',
      '@@2026-11-12T10:00:00+00:00', 'A\tprojects/cloud-loom/project.json', 'A\tprojects/cloud-loom/shots/2.png',
      '@@2026-11-11T10:00:00+00:00', 'A\tprojects/tide-clock/shots/1.png',
    ].join('\n')
    const texts = parseChanges(log, { titleOf: () => undefined, projectAt: lookup }).map((c) => `${c.text} -> ${c.href}`)
    expect(texts).toEqual([
      'finished sand clock -> projects/sand-clock/',
      'started a project: cloud loom -> projects/cloud-loom/',
      'dropped cloud loom -> projects/cloud-loom/',
      'worked on tide clock: a blue square -> projects/tide-clock/',
    ])
  })
})
