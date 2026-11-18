import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { buildSite } from './build.ts'
import { validCounterCode } from './counter.ts'
import { buildViewer, viewerBuildEnv } from './viewer.ts'

const USAGE = `usage: pnpm --filter @forkling/site build [--world <dir>] [--out <dir>]

  --world  the world repo to show (default: the current directory)
  --out    where to write the site (default: _site)
  --base-url  the address of the site, for the links in the feed and the path of the 3D world
  --counter-code  the GoatCounter site code (or GOATCOUNTER_CODE): cookie-free visit counter on the site and the 3D world; off without it
  --no-viewer  do not build the 3D world into <out>/world/

The 3D world is built into <out>/world/ when --base-url says where the site lives (so the site and its world are one address); the world is the
one the address belongs to (https://<owner>.github.io/<repo>/), or GITHUB_REPOSITORY.

The notes form opens when the server's address and the Turnstile site key are known: from the environment (MIND_URL and TURNSTILE_SITE_KEY, which the pages
workflow takes from the repository variables) or from --mind-url and --turnstile-site-key. Without both, /notes/ says the mailbox is closed.`

const { values } = parseArgs({ options: { world: { type: 'string' }, out: { type: 'string' }, 'base-url': { type: 'string' }, 'mind-url': { type: 'string' }, 'turnstile-site-key': { type: 'string' }, 'counter-code': { type: 'string' }, 'no-viewer': { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h', default: false } } })
if (values.help) {
  console.log(USAGE)
} else {
  // `pnpm --filter` runs from apps/site; relative paths mean relative to where the user typed the command.
  const base = process.env.INIT_CWD ?? process.cwd()
  const out = resolve(base, values.out ?? '_site')
  const mindUrl = values['mind-url'] || process.env.MIND_URL || undefined
  const turnstileSiteKey = values['turnstile-site-key'] || process.env.TURNSTILE_SITE_KEY || undefined
  const counterCode = validCounterCode(values['counter-code'] || process.env.GOATCOUNTER_CODE)
  const viewerEnv = values['no-viewer'] ? null : viewerBuildEnv({ baseUrl: values['base-url'], repository: process.env.GITHUB_REPOSITORY, mindUrl, siteKey: turnstileSiteKey, counterCode })
  const { pages } = buildSite(resolve(base, values.world ?? '.'), out, { baseUrl: values['base-url'], mindUrl, turnstileSiteKey, counterCode, viewer: viewerEnv !== null })
  console.log(`wrote ${pages.length} files`)
  if (viewerEnv) {
    const { seconds, bytes } = buildViewer(out, viewerEnv)
    console.log(`built the 3D world into world/ for ${viewerEnv.VITE_WORLD} in ${seconds.toFixed(1)} s, ${(bytes / 1_000_000).toFixed(1)} MB`)
  } else if (!values['no-viewer']) {
    console.log('no 3D world built: --base-url does not say which world this site belongs to')
  }
}
