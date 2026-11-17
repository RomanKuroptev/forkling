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
  add: (rel: string, input: { title: string; active: string; body: string }) => void
}

const latest = (p: SiteProject) => {
  const i = [...p.shots.keys()].reverse().find((k) => p.shots[k])
  return i === undefined ? null : { shot: p.shots[i]!, caption: p.project.sessions[i]!.caption }
}

export function renderProjects(o: ProjectsInput): void {
  const card = (p: SiteProject) => {
    const last = latest(p)
    const caption = p.project.sessions.at(-1)?.caption
    return `<li class="project" data-status="${p.project.status}">${last ? `<a href="${esc(p.project.id)}/"><img src="${esc(p.project.id)}/${esc(last.shot)}" alt="" loading="lazy" width="240" height="180"></a> ` : ''}<strong><a href="${esc(p.project.id)}/">${esc(p.project.name)}</a></strong> <span class="quiet">${STATUS_WORDS[p.project.status]}, ${p.project.sessions.length} ${p.project.sessions.length === 1 ? 'session' : 'sessions'}</span><p>${esc(p.project.aim)}</p>${caption ? `<p class="quiet">Last: ${esc(caption)}</p>` : ''}</li>`
  }
  o.add('projects/index.html', {
    title: 'Projects',
    active: 'projects/',
    body: [
      '<h1>Projects</h1>',
      '<p class="quiet">Things built over more than one sitting: code written, run and looked at, session by session.</p>',
      o.projects.length > 0 ? `<ul class="projects">${o.projects.map(card).join('')}</ul>` : '<p class="quiet">Nothing yet. A project shows here once it is started.</p>',
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
