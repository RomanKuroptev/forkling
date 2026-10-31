import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { renderSite } from './render.ts'

const USAGE = `usage: pnpm --filter @forkling/site build [--world <dir>] [--out <dir>]

  --world  the world repo to show (default: the current directory)
  --out    where to write the site (default: _site)`

const { values } = parseArgs({ options: { world: { type: 'string' }, out: { type: 'string' }, help: { type: 'boolean', short: 'h', default: false } } })
if (values.help) {
  console.log(USAGE)
} else {
  // `pnpm --filter` runs from apps/site; relative paths mean relative to where the user typed the command.
  const base = process.env.INIT_CWD ?? process.cwd()
  const { pages } = renderSite(resolve(base, values.world ?? '.'), resolve(base, values.out ?? '_site'))
  console.log(`wrote ${pages.length} files`)
}
