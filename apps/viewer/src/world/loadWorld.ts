import { Forkling, forklingPackIssues, objectIdFromPath, WorldObject, type SpeciesPack } from '@forkling/schema'
import type { WorldRef } from './route.ts'

export interface LoadedWorld {
  ref: WorldRef
  /** The commit everything was read from. */
  sha: string
  /** When that commit was made: the moment the repo state describes. */
  committedAt: string | null
  forkling: Forkling
  pack: SpeciesPack
  objects: WorldObject[]
}

/** A file that didn't fit, and what is wrong with it, one line per problem. */
export interface Problem {
  file: string
  lines: string[]
}

export interface WorldError {
  kind: 'not-found' | 'rate-limited' | 'not-a-world' | 'invalid' | 'network'
  title: string
  message: string
  problems: Problem[]
}

export type LoadResult = { ok: true; world: LoadedWorld } | { ok: false; error: WorldError }

export interface LoadDeps {
  fetch: typeof fetch
  /** Species packs the viewer ships, by id. */
  species: Record<string, SpeciesPack>
  /** Model assets the viewer ships, like `nature/rock_largeA`. */
  assets: ReadonlySet<string>
}

const MAX_OBJECTS = 300

class LoadFailure extends Error {
  constructor(readonly error: WorldError) {
    super(error.title)
  }
}

const zodLines = (error: { issues: { path: PropertyKey[]; message: string }[] }) => error.issues.map((i) => `${i.path.map(String).join('.') || 'file'}: ${i.message}`)

async function api<T>(deps: LoadDeps, ref: WorldRef, path: string): Promise<T> {
  let res: Response
  try {
    res = await deps.fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}/${path}`, {
      headers: { Accept: 'application/vnd.github+json' },
      // GitHub says max-age=60; revalidate so a push shows on the next refresh. A 304 doesn't count against the rate limit.
      cache: 'no-cache',
    })
  } catch {
    throw new LoadFailure({ kind: 'network', title: "Couldn't reach GitHub", message: 'Check your connection and refresh.', problems: [] })
  }
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset'))
    const when = reset ? ` Try again after ${new Date(reset * 1000).toLocaleTimeString()}.` : ' Try again in a little while.'
    throw new LoadFailure({
      kind: 'rate-limited',
      title: 'GitHub needs a breather',
      message: `This browser has used up GitHub's hourly allowance for reading worlds.${when}`,
      problems: [],
    })
  }
  if (res.status === 404 || res.status === 422) {
    const what = ref.ref ? `branch "${ref.ref}" of ${ref.owner}/${ref.repo}` : `${ref.owner}/${ref.repo}`
    throw new LoadFailure({
      kind: 'not-found',
      title: 'No world here',
      message: `There's no public repository at ${what}.`,
      problems: [],
    })
  }
  if (!res.ok) {
    throw new LoadFailure({ kind: 'network', title: 'GitHub had a problem', message: `It answered ${res.status}. Refresh to try again.`, problems: [] })
  }
  return (await res.json()) as T
}

async function raw(deps: LoadDeps, ref: WorldRef, sha: string, path: string): Promise<unknown> {
  const res = await deps.fetch(`https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${sha}/${path}`)
  if (!res.ok) throw new Error(`could not be downloaded (${res.status})`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`isn't valid JSON: ${(e as Error).message}`)
  }
}

/**
 * Reads a world from its public GitHub repo: the commit, the file list, then each file by commit SHA (which is
 * always fresh and isn't rate limited). Everything is validated, and every broken file is reported, not just the first.
 */
export async function loadWorld(ref: WorldRef, deps: LoadDeps): Promise<LoadResult> {
  try {
    const commit = await api<{ sha: string; commit?: { committer?: { date?: string } } }>(deps, ref, `commits/${encodeURIComponent(ref.ref ?? 'HEAD')}`)
    const tree = await api<{ tree: { path: string; type: string }[] }>(deps, ref, `git/trees/${commit.sha}?recursive=1`)
    const paths = tree.tree.filter((e) => e.type === 'blob').map((e) => e.path)

    if (!paths.includes('forkling.json')) {
      return fail({
        kind: 'not-a-world',
        title: 'Not a forkling world',
        message: `${ref.owner}/${ref.repo} has no forkling.json. Worlds are made from the forkling-world template.`,
        problems: [],
      })
    }

    const problems: Problem[] = []
    const forkling = await readFile(deps, ref, commit.sha, 'forkling.json', problems, (data) => {
      const parsed = Forkling.safeParse(data)
      if (!parsed.success) return { lines: zodLines(parsed.error) }
      const pack = deps.species[parsed.data.species]
      if (!pack) {
        return { lines: [`species: there is no "${parsed.data.species}" species pack (available: ${Object.keys(deps.species).join(', ')})`] }
      }
      const issues = forklingPackIssues(parsed.data, pack)
      return issues.length ? { lines: issues } : { value: { forkling: parsed.data, pack } }
    })

    const objectPaths = paths.filter((p) => objectIdFromPath(p) !== null).slice(0, MAX_OBJECTS)
    const objects = await Promise.all(
      objectPaths.map((path) =>
        readFile(deps, ref, commit.sha, path, problems, (data) => {
          const parsed = WorldObject.safeParse(data)
          if (!parsed.success) return { lines: zodLines(parsed.error) }
          const lines: string[] = []
          if (parsed.data.id !== objectIdFromPath(path)) lines.push(`id: "${parsed.data.id}" should match the file name`)
          if (!deps.assets.has(parsed.data.model.asset)) {
            lines.push(`model.asset: "${parsed.data.model.asset}" isn't a model the viewer ships (available: ${[...deps.assets].join(', ')})`)
          }
          return lines.length ? { lines } : { value: parsed.data }
        }),
      ),
    )

    if (problems.length > 0 || !forkling) {
      problems.sort((a, b) => (a.file === 'forkling.json' ? -1 : b.file === 'forkling.json' ? 1 : a.file.localeCompare(b.file)))
      return fail({
        kind: 'invalid',
        title: `${forkling?.forkling.name ?? 'This forkling'}'s world couldn't be loaded`,
        message: `Some files in ${ref.owner}/${ref.repo} don't fit the world format.`,
        problems,
      })
    }

    return {
      ok: true,
      world: {
        ref,
        sha: commit.sha,
        committedAt: commit.commit?.committer?.date ?? null,
        forkling: forkling.forkling,
        pack: forkling.pack,
        objects: objects.filter((o): o is WorldObject => o !== null),
      },
    }
  } catch (e) {
    if (e instanceof LoadFailure) return fail(e.error)
    throw e
  }
}

const fail = (error: WorldError): LoadResult => ({ ok: false, error })

async function readFile<T>(
  deps: LoadDeps,
  ref: WorldRef,
  sha: string,
  path: string,
  problems: Problem[],
  check: (data: unknown) => { value: T } | { lines: string[] },
): Promise<T | null> {
  let data: unknown
  try {
    data = await raw(deps, ref, sha, path)
  } catch (e) {
    problems.push({ file: path, lines: [(e as Error).message] })
    return null
  }
  const result = check(data)
  if ('lines' in result) {
    problems.push({ file: path, lines: result.lines })
    return null
  }
  return result.value
}
