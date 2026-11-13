import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BudgetLedger, Interests, TinkerJob, type BudgetCall } from '@forkling/schema'
import { canSpend, costUsd, estimateCallUsd, estimateTokens, MAX_PROMPT_TOKENS, monthOf, recordCall, rollLedger } from '../budget.ts'
import { clampText } from '../decision.ts'
import { effortFor, thinkingFor, type LlmClient } from '../llm.ts'
import { buildSystem } from '../prompts.ts'
import { DEFAULT_SEED } from '../seed.ts'
import type { BuildHandler } from '../build-worker.ts'
import { createFetcher, type FetcherOptions } from '../web/fetch.ts'
import { manualPagesFor } from '../web/sources/manuals.ts'
import type { WorkChecker } from './browser-check.ts'
import type { GithubClient, GithubFile } from './github.ts'
import { drawForBuild } from './draw.ts'
import { memeSeeds } from './memes.ts'
import { runTinker, type Complete, type TinkerInput } from './tinker.ts'
import { existingWorkIds, readWorks, readWorkSource, recentSouvenirs, recentWorkTitles, topInterestLines, untriedLibraries } from './works.ts'

export interface TinkerHandlerOptions {
  /** The world, read only: this handler never writes in it. */
  dir: string
  /** Null when there is no key: the job waits. */
  llm: LlmClient | null
  checker: WorkChecker
  github: GithubClient
  now: () => number
  /** How the web is reached, for the manuals. Without it no manual is offered. */
  web?: Omit<FetcherOptions, 'paused' | 'verb'>
}

const readJson = (dir: string, rel: string): unknown => {
  try {
    return existsSync(join(dir, rel)) ? JSON.parse(readFileSync(join(dir, rel), 'utf8')) : null
  } catch {
    return null
  }
}
/** Text in a pull request is Merge's own, but no `@` in it may tag anyone. */
const plain = (text: string) => text.replaceAll('@', '(at)')

/**
 * The build worker's first job (spec 10.2): a full work. It makes the work with the tinker call, checks it, and puts it up as a
 * pull request that `validate.yml` checks again and merges (a scrap goes up the same way, with its reason). It reads the world
 * and writes nothing in it, and never the ledger: what its calls cost goes back in the result for the mind to book (spec 2.2),
 * so two processes never write `brain/budget.json`. With no key or no browser it waits and spends nothing.
 */
export function createTinkerHandler(o: TinkerHandlerOptions): BuildHandler {
  return async (raw) => {
    const parsed = TinkerJob.safeParse(raw)
    if (!parsed.success) return { status: 'failed', reason: 'the request is not a tinker request' }
    const job = parsed.data
    if (!o.llm || !(await o.checker.available())) return { status: 'later' }

    const nowMs = o.now()
    const nowIso = new Date(nowMs).toISOString()
    const llm = o.llm
    const seed = existsSync(join(o.dir, 'self/seed.md')) ? readFileSync(join(o.dir, 'self/seed.md'), 'utf8') : DEFAULT_SEED
    const system = buildSystem({ seed })

    const timezone = (readJson(o.dir, 'forkling.json') as { timezone?: string } | null)?.timezone ?? 'Europe/Stockholm'
    const stored = BudgetLedger.safeParse(readJson(o.dir, 'brain/budget.json'))
    let ledger = rollLedger(stored.success ? stored.data : BudgetLedger.parse({ month: monthOf(timezone, nowMs) }), monthOf(timezone, nowMs))
    const calls: BudgetCall[] = []

    /** One call, with the guards the tick's `ask` has: prompt size and the month's budget. Nothing is booked here. */
    const complete: Complete = async (kind, model, user, schema, maxTokens) => {
      const tokens = estimateTokens(system) + estimateTokens(user)
      if (tokens > MAX_PROMPT_TOKENS || !canSpend(ledger, estimateCallUsd(model, tokens, maxTokens))) return null
      const effort = effortFor(kind)
      const thinking = thinkingFor(model, effort)
      const result = await llm.complete({ kind, model, system, user, maxTokens, effort, ...(thinking ? { thinking } : {}), schema })
      const call: BudgetCall = { at: nowIso, kind, model, ...result.usage, usd: costUsd(model, result.usage) }
      calls.push(call)
      ledger = recordCall(ledger, call)
      return result
    }

    const works = readWorks(o.dir)
    const untried = untriedLibraries(works)
    const manuals = o.web && untried.length > 0 ? await manualPagesFor(createFetcher({ ...o.web, verb: 'tinker' }), untried) : []
    const interests = Interests.safeParse(readJson(o.dir, 'brain/interests.json'))
    const seedNumber = (readJson(o.dir, 'forkling.json') as { seed?: number } | null)?.seed ?? 0
    const draw = drawForBuild(o.dir, { seed: seedNumber, key: `tinker:${job.id}`, interests: interests.success ? interests.data : Interests.parse({}) })
    const input: TinkerInput = {
      idea: job.idea,
      reason: job.reason,
      size: 'full',
      interests: topInterestLines(interests.success ? interests.data : Interests.parse({})),
      souvenirs: recentSouvenirs(o.dir),
      remix: job.remixOf ? readWorkSource(o.dir, job.remixOf) : null,
      untried,
      recentTitles: recentWorkTitles(works),
      manuals,
      memeSeeds: memeSeeds(o.dir),
      constraint: draw.constraint,
      collision: draw.collision ?? undefined,
    }
    const outcome = await runTinker({ complete, checker: o.checker, nowIso, existingIds: new Set(existingWorkIds(o.dir)) }, input)

    if (outcome.status === 'failed') return { status: 'failed', reason: outcome.reason, extra: { calls } }
    if (outcome.status === 'unavailable') return { status: 'failed', reason: 'the browser went away while the work was being checked', extra: { calls } }

    const { meta } = outcome
    const base = `works/${meta.id}`
    const files: GithubFile[] = [
      { path: `${base}/index.html`, content: outcome.html },
      { path: `${base}/meta.json`, content: `${JSON.stringify(meta, null, 2)}\n` },
      ...(outcome.status === 'shelf' ? [{ path: `${base}/thumb.png`, content: outcome.thumb }] : []),
    ]
    const shelved = outcome.status === 'shelf'
    const body = [
      'Made by Merge with the tinker step.',
      `Idea: ${plain(clampText(job.idea, 120))}`,
      `About: ${plain(meta.about)}`,
      shelved ? 'It passed the work check in the build job; validate.yml checks it again and merges it.' : `It did not pass its check (${plain(clampText(meta.scrapReason ?? '', 200))}); it goes to the scrap bin.`,
    ].join('\n\n')
    try {
      const pr = await o.github.openWorkPullRequest({ id: meta.id, files, title: `${shelved ? 'Work' : 'Scrap'}: ${meta.title}`, body })
      return {
        status: 'done',
        ...(shelved ? {} : { reason: meta.scrapReason }),
        extra: { workId: meta.id, title: meta.title, workStatus: shelved ? 'shelf' : 'scrap', prUrl: pr.url, calls },
      }
    } catch (e) {
      return { status: 'failed', reason: clampText(`could not open the pull request: ${e instanceof Error ? e.message : String(e)}`, 300), extra: { calls } }
    }
  }
}
