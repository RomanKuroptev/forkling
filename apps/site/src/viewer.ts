import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * One address (step 7): the site build also builds the 3D viewer into `<out>/world/`, pointed at the world the site belongs to, so a
 * forkling's site and its world are one address. The viewer is a workspace dependency of this package, so the Pages workflow's filtered
 * install (`--filter "@forkling/site..."`) brings it in.
 */

const OWNER = /^[A-Za-z0-9-]{1,39}$/
const REPO = /^[A-Za-z0-9._-]{1,100}$/

export interface ViewerBuildInput {
  /** The address of the site, like `https://owner.github.io/merge/`. */
  baseUrl?: string | undefined
  /** `owner/repo` of the world, when the address does not say (a custom domain): `GITHUB_REPOSITORY` in the workflow. */
  repository?: string | undefined
  mindUrl?: string | undefined
  siteKey?: string | undefined
  /** The GoatCounter code (sharing S7), when the counter is on. */
  counterCode?: string | null | undefined
}

/** The environment of the viewer's build: its path, its one world, and the server and check key it shares with the notes form. Null when the path or the world is not known. */
export function viewerBuildEnv(i: ViewerBuildInput): Record<string, string> | null {
  if (!i.baseUrl) return null
  let url: URL
  try {
    url = new URL(i.baseUrl)
  } catch {
    return null
  }
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  const fromRepository = (() => {
    const [owner, repo, ...rest] = (i.repository ?? '').split('/')
    return owner && repo && rest.length === 0 && OWNER.test(owner) && REPO.test(repo) ? `${owner}/${repo}` : null
  })()
  const host = /^([^.]+)\.github\.io$/.exec(url.hostname)
  const repoFromPath = url.pathname.split('/').filter(Boolean)[0]
  const fromAddress = host && repoFromPath && OWNER.test(host[1]!) && REPO.test(repoFromPath) ? `${host[1]}/${repoFromPath}` : null
  const world = fromRepository ?? fromAddress
  if (!world) return null
  return { VITE_BASE: `${path}world/`, VITE_WORLD: world, VITE_MIND_URL: i.mindUrl ?? '', VITE_TURNSTILE_SITE_KEY: i.siteKey ?? '', VITE_GOATCOUNTER_CODE: i.counterCode ?? '' }
}

const sizeOf = (dir: string): number => readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? sizeOf(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0)

/** Builds the viewer into `<out>/world/`. Returns how long it took and how big it is, for the log. Throws if the build fails: a site with a dead way in must not be published. */
export function buildViewer(out: string, env: Record<string, string>): { seconds: number; bytes: number } {
  const viewerDir = fileURLToPath(new URL('../../viewer', import.meta.url))
  const vite = join(dirname(createRequire(join(viewerDir, 'package.json')).resolve('vite/package.json')), 'bin', 'vite.js')
  const target = join(out, 'world')
  const started = Date.now()
  execFileSync(process.execPath, [vite, 'build', '--outDir', target, '--emptyOutDir'], { cwd: viewerDir, env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'inherit'] })
  return { seconds: (Date.now() - started) / 1000, bytes: sizeOf(target) }
}
