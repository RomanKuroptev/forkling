/** A world repo on GitHub, and optionally a branch to view instead of the default one. */
export interface WorldRef {
  owner: string
  repo: string
  ref?: string
}

export type Route = { kind: 'world'; ref: WorldRef } | { kind: 'home' } | { kind: 'invalid'; reason: string }

const OWNER = /^[A-Za-z0-9-]{1,39}$/
const REPO = /^[A-Za-z0-9._-]{1,100}$/
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/

/** Turns `<base><owner>/<repo>` (plus `?ref=<branch>`) into a world to load. */
export function parseRoute(pathname: string, base: string, search: string): Route {
  const trimmedBase = base.replace(/\/$/, '')
  if (!pathname.startsWith(trimmedBase)) return { kind: 'invalid', reason: 'That address is outside the viewer.' }
  const segments = pathname.slice(trimmedBase.length).split('/').filter(Boolean)
  if (segments.length === 0) return { kind: 'home' }
  if (segments.length !== 2) return { kind: 'invalid', reason: 'A world address looks like /<owner>/<repo>.' }

  const [owner, repo] = segments as [string, string]
  if (!OWNER.test(owner) || !REPO.test(repo)) {
    return { kind: 'invalid', reason: `"${owner}/${repo}" isn't a valid GitHub repository name.` }
  }
  const branch = new URLSearchParams(search).get('ref')
  if (branch === null) return { kind: 'world', ref: { owner, repo } }
  if (!BRANCH.test(branch) || branch.split('/').includes('..')) {
    return { kind: 'invalid', reason: `"${branch}" isn't a branch name.` }
  }
  return { kind: 'world', ref: { owner, repo, ref: branch } }
}

/** The viewer inside a forkling's own site (`<site>/world/`) shows one world, the one it was built for (`VITE_WORLD`, like `owner/repo`), whatever the path. */
export function fixedRoute(spec: string, search: string): Route {
  const [owner, repo, ...rest] = spec.split('/')
  if (!owner || !repo || rest.length > 0 || !OWNER.test(owner) || !REPO.test(repo)) return { kind: 'invalid', reason: `"${spec}" is not a world address.` }
  return parseRoute(`/${owner}/${repo}`, '/', search)
}

const MERGE_WORLD = 'romankuroptev/merge'

/**
 * On the engine's own address the viewer stays for other worlds and the fixture, but a visit for Merge's world (the bare address, the
 * address of Merge's repo, or `?world=RomanKuroptev/merge`) goes to Merge's own site at `<site>world/`, with the query kept. `site` is
 * `VITE_WORLD_SITE`; without it nothing redirects. The local files and the made-up world are never sent anywhere.
 */
export function worldSiteRedirect(route: Route, search: string, site: string | undefined): string | null {
  if (!site) return null
  const query = new URLSearchParams(search)
  const asked = query.get('world')
  if (asked === 'local') return null
  // The query is kept (`?time=`, `?at=`, `?mind=`...), except `world`, which the new address does not need.
  const rest = asked === null ? search : (query.delete('world'), query.size > 0 ? `?${query.toString()}` : '')
  const target = `${site.endsWith('/') ? site : `${site}/`}world/${rest}`
  if (asked !== null) return asked.toLowerCase() === MERGE_WORLD ? target : null
  if (route.kind === 'home') return target
  if (route.kind === 'world' && `${route.ref.owner}/${route.ref.repo}`.toLowerCase() === MERGE_WORLD) return target
  return null
}
