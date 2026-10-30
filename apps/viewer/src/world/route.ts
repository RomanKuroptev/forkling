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
