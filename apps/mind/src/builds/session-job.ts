import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { BudgetLedger, SessionJob, type BudgetCall } from '@forkling/schema'
import type { BuildHandler } from '../build-worker.ts'
import { monthOf, recordCall, rollLedger } from '../budget.ts'
import { clampText } from '../decision.ts'
import { DEFAULT_SEED } from '../seed.ts'
import type { GitRunner } from '../tick/git.ts'
import { createProject, findProject, PROJECTS_DIR, readProject, readProjects } from './projects.ts'
import { makeTimelapse, type TimelapseOptions } from './timelapse.ts'
import type { Sandbox } from './sandbox-run.ts'
import { commitSession, runSession, type SessionModel } from './session.ts'

/**
 * The build worker's side of a `build` step (spec-v4 3.2, 3.3). The session works on a copy of the project in a scratch folder, so
 * the loop's own commits never catch it half done; when it ends, the project is put back into the world and committed in one
 * commit of `projects/<id>/` and nothing else. A new project is started here, with the step's reason as its first aim.
 */

export interface SessionHandlerOptions {
  /** Null without a key: the job waits (`later`). */
  model: SessionModel | null
  sandbox: Sandbox
  /** On the server: a session runs only in the sandbox unit (spec-v4 step 3). */
  requireSandbox: boolean
  git: GitRunner | null
  now: () => number
  timezone: string
  /** The vertical timelapse (sharing S4), made after each session where ffmpeg is installed; null makes none. */
  timelapse?: { address: (projectId: string) => string } & Omit<TimelapseOptions, 'address'> | null
}

const readText = (dir: string, rel: string) => {
  try {
    return readFileSync(join(dir, rel), 'utf8')
  } catch {
    return ''
  }
}

/** The month's ledger from disk, as the loop keeps it. */
function ledgerOnDisk(dir: string, month: string): BudgetLedger {
  let stored: unknown = null
  try {
    stored = JSON.parse(readFileSync(join(dir, 'brain/budget.json'), 'utf8'))
  } catch {
    // no ledger yet: an empty month
  }
  const parsed = BudgetLedger.safeParse(stored)
  return rollLedger(parsed.success ? parsed.data : BudgetLedger.parse({ month }), month)
}

/** Every file under `dir`, relative to it, with `/`. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split('\\').join('/'))
}

/** Puts the project back: every file of the copy, and the files the session deleted are deleted from the world too. One by one. */
function putBack(from: string, to: string): void {
  const kept = new Set(filesUnder(from))
  for (const rel of filesUnder(to)) if (!kept.has(rel)) rmSync(join(to, rel))
  mkdirSync(to, { recursive: true })
  cpSync(from, to, { recursive: true, force: true })
}

export function createSessionHandler(o: SessionHandlerOptions): BuildHandler {
  return async (job, ctx) => {
    const parsed = SessionJob.safeParse(job)
    if (!parsed.success) return { status: 'failed', reason: 'the session request does not fit its schema' }
    if (!o.model) return { status: 'later', reason: 'no model key' }
    const req = parsed.data
    const world = ctx.dir

    // The project: one that is building, or a new one, made in the scratch copy beside the others' project.json.
    const { projects } = readProjects(world)
    const found = findProject(projects, req.target)
    if (found && found.status !== 'building') return { status: 'failed', reason: `${found.name} is ${found.status}`, extra: { projectId: found.id, title: found.name } }
    const scratch = mkdtempSync(join(tmpdir(), 'session-'))
    try {
      for (const p of projects) {
        const from = join(world, PROJECTS_DIR, p.id)
        if (p.id === found?.id) cpSync(from, join(scratch, PROJECTS_DIR, p.id), { recursive: true })
        else cpSync(join(from, 'project.json'), join(scratch, PROJECTS_DIR, p.id, 'project.json'))
      }
      let project = found
      if (!project) {
        const made = createProject(scratch, { name: req.target, aim: req.reason, now: new Date(ctx.nowMs) })
        if (!made.ok) return { status: 'failed', reason: made.reason }
        project = made.project
      }

      const calls: BudgetCall[] = []
      const month = monthOf(o.timezone, o.now())
      const r = await runSession({
        world: scratch,
        project,
        reason: req.reason,
        seed: readText(world, 'self/seed.md') || DEFAULT_SEED,
        page: readText(world, 'self/page.md'),
        model: o.model,
        sandbox: o.sandbox,
        requireSandbox: o.requireSandbox,
        ledger: () => calls.reduce(recordCall, ledgerOnDisk(world, month)),
        book: (call) => calls.push(call),
        pointsInHand: req.pointsInHand,
        now: o.now,
      })
      if (r.refused) return { status: 'failed', reason: clampText(r.refused, 300), extra: { projectId: project.id, title: project.name } }

      const target = join(world, PROJECTS_DIR, project.id)
      putBack(join(scratch, PROJECTS_DIR, project.id), target)
      const caption = r.session?.caption ?? 'a session'
      // The timelapse goes in the same commit. A video that cannot be made is skipped quietly: the page then has no link.
      const saved = readProject(world, project.id)
      if (o.timelapse && saved) {
        const { address, ...rest } = o.timelapse
        const video = await makeTimelapse(target, saved, { ...rest, address: address(project.id) })
        if (!video.ok) console.log(`timelapse of ${project.id}: ${video.reason}`)
      }
      if (o.git) await commitSession(o.git, project.id, caption)
      return {
        status: 'done',
        extra: { projectId: project.id, title: project.name, caption, ...(r.told ? { told: clampText(r.told, 300) } : {}), calls },
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }
}
