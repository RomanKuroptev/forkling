import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JobRequest, JobResult } from '@forkling/schema'
import { clampText } from './decision.ts'
import { writeJson } from './world.ts'

/** A request that has no result this long after it was made is closed as failed (spec 11.3). */
export const BUILD_CLOSE_HOURS = 48
const HOUR = 3_600_000
const BUILDS = 'mind/builds'
const MAX_REASON = 300

export interface BuildHandlerOutcome {
  /** `later` means it could not start (no key, no browser): no result is written and the job is tried again. */
  status: 'done' | 'failed' | 'later'
  reason?: string
  /**
   * For a work: which one, whether it is on the shelf or in the scrap bin, its pull request, and what the calls cost. For an expand:
   * the place, the checked patch, the wishes, the constraint and collision, and what the calls cost. For the fallback build of a place request:
   * the request and the whole new place, and what the calls cost.
   */
  extra?: Partial<Pick<JobResult, 'workId' | 'title' | 'workStatus' | 'prUrl' | 'calls' | 'placeId' | 'patch' | 'wishes' | 'constraint' | 'collision' | 'requestId' | 'place'>>
}
/** What runs one kind of job. W4 adds `tinker`, W6 adds `expand` (and the fallback `found`); W3 has none. */
export type BuildHandler = (job: JobRequest, ctx: { dir: string; nowMs: number }) => Promise<BuildHandlerOutcome>
export type BuildHandlers = Record<string, BuildHandler>

/** The requests in `mind/builds/` with no result yet, oldest first. A file that is not a request is left out. */
export function pendingJobs(dir: string): JobRequest[] {
  const folder = join(dir, BUILDS)
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.result.json'))
    .flatMap((f) => {
      try {
        const parsed = JobRequest.safeParse(JSON.parse(readFileSync(join(folder, f), 'utf8')))
        if (!parsed.success || `${parsed.data.id}.json` !== f) return []
        return existsSync(join(folder, `${parsed.data.id}.result.json`)) ? [] : [parsed.data]
      } catch {
        return []
      }
    })
    .sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt))
}

/** Every result in `mind/builds/` that fits its schema, oldest first. */
export function readResults(dir: string): JobResult[] {
  const folder = join(dir, BUILDS)
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.result.json'))
    .flatMap((f) => {
      try {
        const parsed = JobResult.safeParse(JSON.parse(readFileSync(join(folder, f), 'utf8')))
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

export interface BuildWorkerOptions {
  dir: string
  now: () => number
  handlers: BuildHandlers
}

export interface BuildTickResult {
  /** The job it ran this tick, if any. */
  ran: string | null
  /** The requests it closed as failed this tick. */
  closed: string[]
  /** Set when another tick was still running. */
  busy?: true
}

/**
 * The build worker (spec 10.2): looks in `mind/builds/` for requests with no result, closes the ones nobody answered in 48
 * hours, and runs the oldest one that has a handler, one at a time. It writes only `mind/builds/<id>.result.json`, so it
 * never touches a file the mind is writing. With no handlers, as in W3, it is idle.
 */
export function createBuildWorker(opts: BuildWorkerOptions) {
  let running = false

  const finish = (job: JobRequest, nowMs: number, outcome: BuildHandlerOutcome & { status: 'done' | 'failed' }): void => {
    const result = JobResult.parse({ id: job.id, kind: job.kind, status: outcome.status, ...(outcome.reason ? { reason: clampText(outcome.reason, MAX_REASON) } : {}), ...outcome.extra, at: new Date(nowMs).toISOString() })
    writeJson(opts.dir, `${BUILDS}/${job.id}.result.json`, result)
  }

  return {
    async tick(): Promise<BuildTickResult> {
      if (running) return { ran: null, closed: [], busy: true }
      running = true
      try {
        const nowMs = opts.now()
        const closed: string[] = []
        const open: JobRequest[] = []
        for (const job of pendingJobs(opts.dir)) {
          if (nowMs - Date.parse(job.requestedAt) >= BUILD_CLOSE_HOURS * HOUR) {
            finish(job, nowMs, { status: 'failed', reason: `closed after ${BUILD_CLOSE_HOURS} hours with no result` })
            closed.push(job.id)
          } else open.push(job)
        }
        const next = open.find((job) => opts.handlers[job.kind])
        if (!next) return { ran: null, closed }
        let outcome: BuildHandlerOutcome
        try {
          outcome = await opts.handlers[next.kind]!(next, { dir: opts.dir, nowMs })
        } catch (e) {
          outcome = { status: 'failed', reason: e instanceof Error ? e.message : String(e) }
        }
        if (outcome.status === 'later') return { ran: null, closed }
        finish(next, opts.now(), { ...outcome, status: outcome.status })
        return { ran: next.id, closed }
      } finally {
        running = false
      }
    },
  }
}
