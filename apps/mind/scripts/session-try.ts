import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import Anthropic from '@anthropic-ai/sdk'
import { BudgetLedger, type BudgetCall } from '@forkling/schema'
import { recordCall } from '../src/budget.ts'
import { createProject, readProject } from '../src/builds/projects.ts'
import { createSandbox } from '../src/builds/sandbox-run.ts'
import { anthropicSessionModel, runSession } from '../src/builds/session.ts'
import { DEFAULT_SEED } from '../src/seed.ts'

/**
 * Step 4's local dry run with the real model (spec v4 step 4, "done when" 2): on a throwaway copy of a world, one new project and
 * some sessions on it, each capped, with the real Sonnet calls and this machine's browser (unsandboxed, which a local try may be).
 * It prints each session's caption, cost and screenshot path, and the folder the copy is in. Nothing is committed or pushed, and
 * the world given is never written to.
 *
 *   pnpm --filter @forkling/mind session-try --world <a world, e.g. ../../templates/forkling-world> [--name "Tide clock"]
 *     [--reason "..."] [--sessions 2] [--max-usd 0.9]
 *
 * Needs ANTHROPIC_API_KEY. With the defaults it spends at most $1.80.
 */

const USAGE = 'usage: pnpm --filter @forkling/mind session-try --world <dir> [--name <project name>] [--reason <why>] [--sessions 2] [--max-usd 0.9]'

async function main() {
  const { values } = parseArgs({
    options: {
      world: { type: 'string' },
      name: { type: 'string', default: 'First project' },
      reason: { type: 'string', default: 'I want to make something that moves, and see it run.' },
      sessions: { type: 'string', default: '2' },
      'max-usd': { type: 'string', default: '0.9' },
    },
  })
  if (!values.world) throw new Error(USAGE)
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')
  const sessions = Number(values.sessions)
  const maxUsd = Number(values['max-usd'])
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > 4) throw new Error('--sessions is 1 to 4')
  if (!(maxUsd > 0 && maxUsd <= 1.5)) throw new Error('--max-usd is over 0 and at most 1.5')

  const source = resolve(process.env.INIT_CWD ?? process.cwd(), values.world)
  if (!existsSync(join(source, 'forkling.json'))) throw new Error(`${source} is not a world (no forkling.json)`)
  const world = join(mkdtempSync(join(tmpdir(), 'session-try-')), basename(source))
  cpSync(source, world, { recursive: true, filter: (from) => !from.split(/[\\/]/).includes('.git') })
  console.log(`a copy of the world: ${world}`)

  const read = (rel: string) => (existsSync(join(world, rel)) ? readFileSync(join(world, rel), 'utf8') : '')
  const seed = read('self/seed.md') || DEFAULT_SEED
  const page = read('self/page.md')

  const created = createProject(world, { name: values.name, aim: values.reason, now: new Date() })
  if (!created.ok) throw new Error(created.reason)
  let project = created.project
  let ledger = BudgetLedger.parse({ month: new Date().toISOString().slice(0, 7), capUsd: Math.ceil(sessions * maxUsd + 1) })
  const sandbox = createSandbox()
  const model = anthropicSessionModel(new Anthropic())
  let total = 0

  for (let n = 1; n <= sessions; n++) {
    const r = await runSession({
      world,
      project,
      reason: n === 1 ? values.reason : `Going on with ${project.name}.`,
      seed,
      page,
      model,
      sandbox,
      requireSandbox: false,
      ledger: () => ledger,
      book: (call: BudgetCall) => {
        ledger = recordCall(ledger, call)
      },
      pointsInHand: 1_500,
      now: Date.now,
      limits: { usd: maxUsd },
    })
    if (r.refused) throw new Error(`session ${n} did not start: ${r.refused}`)
    total += r.usd
    project = readProject(world, project.id) ?? r.project
    console.log(`session ${n}: ${r.stop}, ${r.turns} turns, $${r.usd.toFixed(3)} (${r.points} points), status ${project.status}`)
    console.log(`  caption: ${r.session?.caption}${r.session?.engine ? ' (written by the engine)' : ''}${r.session?.broken ? ' [broken]' : ''}`)
    console.log(`  screenshot: ${r.session?.shot ? join(world, 'projects', project.id, r.session.shot) : 'none'}`)
    if (r.told) console.log(`  told: ${r.told}`)
    if (project.status !== 'building') break
  }
  await sandbox.close()
  console.log(`total: $${total.toFixed(3)}; the project is in ${join(world, 'projects', project.id)}`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
