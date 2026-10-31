import type { WorldRef } from './route.ts'

/** The address a world served next to the viewer (`<origin>/world/`) is loaded under. */
export const LOCAL_REF: WorldRef = { owner: 'local', repo: 'world' }

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })

/**
 * A `fetch` that answers the three kinds of GitHub request `loadWorld` makes from files served at `<origin>/world/`,
 * with `world/manifest.json` listing them. The eye-cam renderer and local previews use it, so nothing is read from the network.
 * Every other address goes to `real`.
 */
export function localFetch(origin: string, real: typeof fetch): typeof fetch {
  const prefix = `https://api.github.com/repos/${LOCAL_REF.owner}/${LOCAL_REF.repo}/`
  const rawPrefix = `https://raw.githubusercontent.com/${LOCAL_REF.owner}/${LOCAL_REF.repo}/local/`
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith(`${prefix}commits/`)) return json({ sha: 'local', commit: { committer: { date: new Date().toISOString() } } })
    if (url.startsWith(`${prefix}git/trees/`)) {
      const manifest = await real(`${origin}world/manifest.json`)
      if (!manifest.ok) return new Response('no manifest', { status: 404 })
      return json({ tree: ((await manifest.json()) as string[]).map((path) => ({ path, type: 'blob' })) })
    }
    if (url.startsWith(rawPrefix)) return real(`${origin}world/${url.slice(rawPrefix.length)}`, init)
    return real(input, init)
  }
}
