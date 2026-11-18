import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { hasPolicy, Project, workFrame } from '@forkling/schema'
import type { FeedItem } from './feed.ts'
import { esc } from './md.ts'

/**
 * Projects on the site (spec-v4 3.4): `/projects/` lists every project with its latest screenshot, status and caption, and
 * `/projects/<id>/` shows the screenshots in order as a timelapse with their captions, the aim, the reason it ended, and, when it
 * is done, the project running in the same sandboxed frame and policy as a work. Plain markup: lane D styles it. Everything shown
 * was written by Merge (or is a plain engine line), so all of it is escaped.
 */

export interface SiteProject {
  project: Project
  /** The screenshots that are on disk, by session index. */
  shots: (string | null)[]
  /** A done project whose `src/index.html` carries the policy: only then is it run on its page. */
  runnable: boolean
  /** `share/timelapse.mp4` is there (sharing S4). */
  video: boolean
}

const STATUS_WORDS: Record<Project['status'], string> = { building: 'building', done: 'done', abandoned: 'dropped' }

export function loadProjects(world: string): SiteProject[] {
  const folder = join(world, 'projects')
  if (!existsSync(folder)) return []
  return readdirSync(folder, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => {
      try {
        const parsed = Project.safeParse(JSON.parse(readFileSync(join(folder, e.name, 'project.json'), 'utf8')))
        if (!parsed.success || parsed.data.id !== e.name) return []
        const dir = join(folder, e.name)
        const shots = parsed.data.sessions.map((s) => (s.shot && existsSync(join(dir, s.shot)) ? s.shot : null))
        const index = join(dir, 'src', 'index.html')
        const runnable = parsed.data.status === 'done' && existsSync(index) && hasPolicy(readFileSync(index, 'utf8'))
        return [{ project: parsed.data, shots, runnable, video: existsSync(join(dir, 'share', 'timelapse.mp4')) }]
      } catch {
        return []
      }
    })
    .sort((a, b) => b.project.started.localeCompare(a.project.started))
}

/** Every file under `dir`, relative to it, with `/`. Links are not followed. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split('\\').join('/'))
}

/** Copies the screenshots of every project, the files of a done one (its frame runs them) and the timelapse video, to `out/projects/<id>/`. */
export function publishProjects(world: string, out: string, projects: readonly SiteProject[]): string[] {
  const written: string[] = []
  const copy = (id: string, rel: string) => {
    mkdirSync(join(out, 'projects', id, rel, '..'), { recursive: true })
    copyFileSync(join(world, 'projects', id, rel), join(out, 'projects', id, rel))
    written.push(`projects/${id}/${rel}`)
  }
  for (const { project, shots, runnable, video } of projects) {
    for (const shot of shots) if (shot) copy(project.id, shot)
    if (runnable) for (const rel of filesUnder(join(world, 'projects', project.id, 'src'))) copy(project.id, `src/${rel}`)
    if (video) copy(project.id, 'share/timelapse.mp4')
  }
  return written
}

export interface ProjectsInput {
  projects: readonly SiteProject[]
  stamp: (iso: string) => string
  /** Merge's time zone, for "day 3". */
  tz?: string
  add: (rel: string, input: { title: string; active: string; body: string }) => void
}

const latest = (p: SiteProject) => {
  const i = [...p.shots.keys()].reverse().find((k) => p.shots[k])
  return i === undefined ? null : { shot: p.shots[i]!, caption: p.project.sessions[i]!.caption }
}

const dayKey = (tz: string, iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

/** "day 3": the day of a session counted from the day the project started, in Merge's time zone. */
export function dayOfProject(tz: string, started: string, at: string): number {
  return Math.round((Date.parse(`${dayKey(tz, at)}T00:00:00Z`) - Date.parse(`${dayKey(tz, started)}T00:00:00Z`)) / 86_400_000) + 1
}

const bgUrl = (path: string) => `style="background-image:url('${esc(encodeURI(path).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29'))}')"`

/**
 * The workshop in the look of the workshop mockup (docs/spec/v4/look/site/workshop.png): the projects as a list with a detail beside it, one
 * project chosen at a time with no script (radio buttons and a little CSS made from the project ids, which are plain slugs). The detail has the
 * goal, the day pictures and the log of what each session did. Points spent and the world link of the mockup are left out: no such data here.
 */
export function renderProjects(o: ProjectsInput): void {
  const tz = o.tz ?? 'UTC'
  const detail = (p: SiteProject) => {
    const { project } = p
    const days = project.sessions.flatMap((s, n) => (p.shots[n] ? [{ s, shot: p.shots[n] as string }] : [])).slice(-3)
    const pics = days.map(({ s, shot }) => `<a class="wshot" href="${esc(project.id)}/" aria-label="${esc(s.caption)}"><span class="pic" ${bgUrl(`${project.id}/${shot}`)}></span><span class="day">day ${dayOfProject(tz, project.started, s.at)}</span></a>`).join('')
    const log = project.sessions.map((s) => `day ${dayOfProject(tz, project.started, s.at)} &gt; ${esc(s.caption)}`).join('\n')
    return `<section class="wd wd-${esc(project.id)}"><h2>${esc(project.name)}</h2><p>${esc(project.aim)}</p>${pics ? `<div class="wshots">${pics}</div>` : ''}${log ? `<pre class="wlog">${log}</pre>` : '<p class="quiet">No session yet.</p>'}<p class="actions"><a class="play" href="${esc(project.id)}/">open the project</a>${p.video ? ` <a class="play" href="${esc(project.id)}/share/timelapse.mp4" download>save the video</a>` : ''}</p></section>`
  }
  const radio = (p: SiteProject, n: number) => `<input type="radio" name="wp" id="wp-${esc(p.project.id)}" class="wp"${n === 0 ? ' checked' : ''}>`
  const label = (p: SiteProject) => {
    const { project } = p
    const day = project.sessions.length > 0 ? `day ${dayOfProject(tz, project.started, project.sessions.at(-1)!.at)} \u00b7 ` : ''
    return `<label class="wp-item st-${project.status}" for="wp-${esc(project.id)}"><span class="sw" aria-hidden="true"></span><strong>${esc(project.name)}</strong><small>${day}${STATUS_WORDS[project.status]}, ${project.sessions.length} ${project.sessions.length === 1 ? 'session' : 'sessions'}</small></label>`
  }
  // The detail that shows is the one whose radio button is checked: one small rule for each project, made from its id.
  const rules = o.projects.map((p) => `#wp-${p.project.id}:checked ~ .wdetail .wd-${p.project.id}{display:block}#wp-${p.project.id}:checked ~ .wlist label[for="wp-${p.project.id}"]{background:var(--purple);color:var(--white)}`).join('')
  const list = `<div class="wshop"><style>${rules}</style>${o.projects.map(radio).join('')}<nav class="wlist" aria-label="Projects">${o.projects.map(label).join('')}</nav><div class="wdetail">${o.projects.map(detail).join('')}</div></div>`
  o.add('projects/index.html', {
    title: 'Projects',
    active: 'projects/',
    body: [
      '<h1>Projects</h1>',
      '<p class="quiet">Things built over more than one sitting: code written, run and looked at, session by session.</p>',
      o.projects.length > 0 ? list : '<p class="quiet">Nothing yet. A project shows here once it is started.</p>',
    ].join('\n'),
  })

  for (const p of o.projects) {
    const { project } = p
    const frames = project.sessions
      .map((s, i) => `<li class="session${s.broken ? ' broken' : ''}">${p.shots[i] ? `<img src="${esc(p.shots[i]!)}" alt="" loading="lazy" width="480" height="360">` : '<p class="quiet">No screenshot.</p>'}<p><time>${esc(o.stamp(s.at))}</time> ${esc(s.caption)}${s.broken ? ' <span class="quiet">(broken)</span>' : ''}</p></li>`)
      .join('')
    o.add(`projects/${project.id}/index.html`, {
      title: project.name,
      active: 'projects/',
      body: [
        '<p class="quiet"><a href="../">Projects</a></p>',
        `<h1>${esc(project.name)}</h1>`,
        `<p>${esc(project.aim)}</p>`,
        `<p class="quiet">${STATUS_WORDS[project.status]}. Started ${esc(o.stamp(project.started))}. ${project.sessions.length} ${project.sessions.length === 1 ? 'session' : 'sessions'}.${project.inspiredBy ? ` Started after a note from ${esc(project.inspiredBy.name || 'a visitor')}.` : ''}</p>`,
        ...(project.reason ? [`<p>${project.status === 'done' ? 'Done' : 'Dropped'}: ${esc(project.reason)}</p>`] : []),
        ...(p.runnable ? [`<div class="work-frame">${workFrame('src/index.html', project.name)}</div>`] : []),
        ...(p.video ? ['<p><a href="share/timelapse.mp4" download>Save the timelapse video</a></p>'] : []),
        '<h2>Timelapse</h2>',
        frames ? `<ol class="timelapse">${frames}</ol>` : '<p class="quiet">No session yet.</p>',
      ].join('\n'),
    })
  }
}

/** The feed (spec 8, spec-v4 3.4): a project started, each session ("worked on"), and the one that finished or dropped it. */
export function projectFeedItems(projects: readonly SiteProject[]): FeedItem[] {
  return projects.flatMap(({ project }) => {
    const path = `projects/${project.id}/`
    const last = project.sessions.length - 1
    return [
      { title: `Started a project: ${project.name}`, path, at: project.started, description: project.aim },
      ...project.sessions.map((s, i) => ({
        title: i === last && project.status !== 'building' ? `${project.status === 'done' ? 'Finished' : 'Dropped'}: ${project.name}` : `Worked on ${project.name}`,
        path,
        at: s.at,
        description: i === last && project.reason ? `${s.caption} ${project.reason}` : s.caption,
      })),
    ]
  })
}

/**
 * What a commit to `projects/` means, for `changes.json`: a new `project.json` is "started a project", a new screenshot is a session
 * ("worked on ..."), and the last session of a project that is done or dropped says so.
 */
export function projectChangeLookup(projects: readonly SiteProject[]): (path: string) => { text: string; href: string } | undefined {
  const byId = new Map(projects.map((p) => [p.project.id, p.project]))
  return (path) => {
    const m = /^projects\/([^/]+)\/(project\.json|shots\/\d+\.png)$/.exec(path)
    const project = m ? byId.get(m[1]!) : undefined
    if (!m || !project) return undefined
    const href = `projects/${project.id}/`
    if (m[2] === 'project.json') return { text: `started a project: ${project.name}`, href }
    const i = project.sessions.findIndex((s) => s.shot === m[2])
    if (i === -1) return { text: `worked on ${project.name}`, href }
    if (i === project.sessions.length - 1 && project.status === 'done') return { text: `finished ${project.name}`, href }
    if (i === project.sessions.length - 1 && project.status === 'abandoned') return { text: `dropped ${project.name}`, href }
    return { text: `worked on ${project.name}: ${project.sessions[i]!.caption}`, href }
  }
}
