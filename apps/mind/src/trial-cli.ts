/**
 * The source trial (spec 6.5): `pnpm --filter @forkling/mind source-trial <host> [--items 20] [--seeds 5]`.
 *
 * Makes real fetches and real read calls (about $0.02 a host), writes nothing to any world repo, and prints a report. With
 * `--out <dir>` it also saves the report as `<dir>/<host>.md`, which is what Roman reads. A host joins the allowlist only after
 * this passes and he has read it.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { Interests } from '@forkling/schema'
import { hasCredentials } from './credentials.ts'
import { anthropicClient } from './llm.ts'
import { DEFAULT_SEED } from './seed.ts'
import { hostRule } from './web/allowlist.ts'
import { createFetcher } from './web/fetch.ts'
import { performRead } from './web/readcall.ts'
import { checkRobots, mayReadHost } from './web/robots.ts'
import { readUrl } from './web/sources/index.ts'
import { HOST_PLANS, planFor } from './web/starts.ts'
import { evaluateTrial, formatTrial, runTrial } from './web/trial.ts'

const USAGE = `usage: pnpm --filter @forkling/mind source-trial <host> [--items 20] [--seeds 5] [--offset 0] [--cap 0.1] [--out <dir>] [--offline] [--ignore-robots]

Hosts: ${HOST_PLANS.map((p) => p.host).join(', ')}
--offline fetches and measures without any model call. --cap is the most the read calls may cost, in dollars.
A host whose robots.txt disallows the paths the engine uses (or cannot be read) is not read at all: the trial stops after
robots.txt. Only Roman may override that with --ignore-robots, for an API a site documents for bots.`

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      items: { type: 'string', default: '20' },
      seeds: { type: 'string', default: '5' },
      offset: { type: 'string', default: '0' },
      cap: { type: 'string', default: '0.1' },
      out: { type: 'string' },
      offline: { type: 'boolean', default: false },
      'ignore-robots': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  const host = positionals[0]
  const plan = host ? planFor(host) : undefined
  if (values.help || !host || !plan) {
    console.log(host && !plan ? `no trial for "${host}"\n\n${USAGE}` : USAGE)
    process.exitCode = host && !plan ? 1 : 0
    return
  }
  const rule = hostRule(plan.host)!
  const items = Number(values.items)
  const seeds = Number(values.seeds)
  const offset = Number(values.offset)
  const cap = Number(values.cap)
  if (![items, seeds, offset, cap].every(Number.isFinite) || items < 1 || seeds < 1) throw new Error('--items and --seeds must be positive numbers')
  if (!values.offline && !hasCredentials(process.env)) {
    console.error('No API key found. Set ANTHROPIC_API_KEY (or put it in .env), or run with --offline.')
    process.exitCode = 1
    return
  }

  const fetcher = createFetcher()
  const llm = values.offline ? null : anthropicClient()
  let spent = 0
  const interests = Interests.parse({})
  console.log(`Trial of ${plan.host}: ${items} items from ${seeds} seeds${values.offline ? ' (offline)' : ''}`)

  const robots = await checkRobots(fetcher, plan.host, plan.paths)
  console.log(robots.detail)
  if (!mayReadHost(robots, values['ignore-robots'])) {
    const note = `# Source trial: ${plan.host}\n\n**Stopped after robots.txt: ${robots.detail}.** Nothing else was fetched from this host. It is left out unless Roman decides the site's own rules allow it, and then the trial is rerun with --ignore-robots.\n`
    console.log(`\n${note}`)
    if (values.out) {
      const dir = resolve(process.env.INIT_CWD ?? process.cwd(), values.out)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${plan.host}.md`), note)
    }
    process.exitCode = 2
    return
  }

  const reads = await runTrial({
    host: plan.itemHost,
    items,
    seeds,
    start: (seed) => plan.start(fetcher, seed, offset),
    open: (url) => readUrl(fetcher, url),
    read: async (item) => {
      const out = await performRead(
        { llm, fetcher, seed: DEFAULT_SEED, purpose: 'see what is out there today; nothing in particular', interests, mayCall: (usd) => spent + usd <= cap },
        item,
      )
      spent += out.usd
      const s = out.souvenir
      console.log(`  ${item.title.slice(0, 60)}: ${out.skipped ? `skipped (${out.skipped})` : out.answer ? `interest ${out.answer.interest}, souvenir ${s.kept ? 'kept' : (s.dropped ?? 'none')}` : (out.note ?? 'not read')}`)
      return {
        answer: out.answer,
        souvenir: s.kept ? 'kept' : s.dropped ? `dropped: ${s.dropped}` : 'none',
        ...(s.kept && s.kept.kind !== undefined ? { kept: { kind: s.kept.kind, content: s.kept.content, why: s.kept.why } } : {}),
        ...(out.skipped ? { skipped: out.skipped } : {}),
      }
    },
  })

  // Commons is listed as an image host but its file pages are read as records, so the marks follow what was actually read.
  const kind = reads.find((r) => r.item)?.item?.kind ?? rule.kind
  const report = evaluateTrial({ host: plan.host, kind, tier: rule.tier, seeds, reads, robots })
  const offlineNote = values.offline ? '**Offline run: no model was called, so "Gives something" and "Not boring" are not measured.**\n\n' : ''
  const text = offlineNote + formatTrial(report, reads, Date.now() % 1_000_000)
  console.log(`\n${text}\nSpent about $${spent.toFixed(4)} on read calls. ${fetcher.log.length} requests, ${fetcher.log.filter((l) => l.outcome === 'not-allowed').length} refused.`)

  if (values.out) {
    const dir = resolve(process.env.INIT_CWD ?? process.cwd(), values.out)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${plan.host}.md`), `${text}\nSpent about $${spent.toFixed(4)}.\n`)
    console.log(`Saved ${join(dir, `${plan.host}.md`)}`)
  }
  process.exitCode = report.verdict === 'pass' ? 0 : 2
}

await main()
