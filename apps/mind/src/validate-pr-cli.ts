import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createBrowserChecker } from './builds/browser-check.ts'
import { gitRunner } from './tick/git.ts'
import { listChanges, validatePullRequest } from './validate-pr.ts'

const USAGE = `usage: pnpm --filter @forkling/mind validate-pr --world <dir> --base <sha> --head <sha> [--branch <name>] [--no-browser]

  --world       the world repository with the pull request's head checked out (full history)
  --base        the commit the pull request branched from (or the base branch's tip)
  --head        the pull request's head commit
  --branch      the pull request's branch; one named work/<id> may hold that one work only
  --no-browser  skip the browser check (the static checks still run)`

/** What validate.yml runs on every pull request. A problem is an error annotation and a failing exit, which stops the merge. */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      world: { type: 'string' },
      base: { type: 'string' },
      head: { type: 'string' },
      branch: { type: 'string' },
      'no-browser': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) return void console.log(USAGE)
  if (!values.world || !values.base || !values.head) throw new Error(`--world, --base and --head are required\n\n${USAGE}`)

  const world = resolve(process.env.INIT_CWD ?? process.cwd(), values.world)
  const changes = await listChanges(gitRunner(world), values.base, values.head)
  console.log(`${changes.length} changed ${changes.length === 1 ? 'file' : 'files'}`)

  const checker = values['no-browser'] ? undefined : createBrowserChecker()
  if (checker && !(await checker.available())) {
    console.log('::error::no browser could be started, so the work cannot be checked')
    process.exit(1)
  }
  const result = await validatePullRequest({ world, changes, checker, ...(values.branch ? { branch: values.branch } : {}) })
  await checker?.close()
  for (const problem of result.problems) console.log(`::error::${problem.replace(/[\r\n]+/g, ' ')}`)
  console.log(result.ok ? 'ok: the pull request passes' : `${result.problems.length} ${result.problems.length === 1 ? 'problem' : 'problems'}`)
  process.exit(result.ok ? 0 : 1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
