import { clampText } from '../decision.ts'

export interface GithubFile {
  /** Path in the repository. */
  path: string
  content: string | Buffer
}

export interface GithubClient {
  /**
   * Puts the files on a new branch `work/<id>` off `main` as one commit and opens a pull request for it. The work is
   * `works/<id>/` and nothing else, so `validate.yml` accepts it.
   */
  openWorkPullRequest(args: { id: string; files: readonly GithubFile[]; title: string; body: string }): Promise<{ number: number; url: string }>
}

/** `OWNER/NAME` from a GitHub address, with or without a token in it, a `.git` or a trailing slash. Null for anything else. */
export function repoFromUrl(url: string): string | null {
  const m = /^https:\/\/(?:[^@/\s]+@)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.trim())
  return m ? `${m[1]}/${m[2]}` : null
}

const ID = /^[a-z0-9][a-z0-9-]{0,60}$/
const API = 'https://api.github.com'
const MAX_TITLE = 120
const MAX_BODY = 4_000

export interface GithubClientOptions {
  token: string
  /** `OWNER/NAME`. */
  repo: string
  fetch?: typeof fetch
  base?: string
}

/**
 * The GitHub REST Git Data API with the fine-grained token (contents and pull requests on the world repo only): blobs, a tree,
 * a commit, a branch and a pull request. It never touches the working tree the loop commits from, so the two cannot get in
 * each other's way, and the token goes only in the `Authorization` header and never in an error.
 */
export function createGithubClient(opts: GithubClientOptions): GithubClient {
  const fetchImpl = opts.fetch ?? fetch
  const base = opts.base ?? 'main'

  const scrub = (text: string) => text.split(opts.token).join('[token]')
  async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetchImpl(`${API}/repos/${opts.repo}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${opts.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'forkling-mind',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch (e) {
      throw new Error(`GitHub could not be reached: ${scrub(e instanceof Error ? e.message : String(e))}`)
    }
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    if (!res.ok) {
      const message = typeof (json as { message?: unknown } | null)?.message === 'string' ? (json as { message: string }).message : text
      throw new Error(`GitHub answered ${res.status}: ${scrub(clampText(message, 200))}`)
    }
    return json as T
  }

  return {
    async openWorkPullRequest({ id, files, title, body }) {
      if (!ID.test(id)) throw new Error(`"${id}" is not a usable work id`)
      for (const f of files) {
        if (!f.path.startsWith(`works/${id}/`) || f.path.includes('..')) throw new Error(`file "${f.path}" is not under works/${id}/`)
      }
      const head = await api<{ object: { sha: string } }>('GET', `/git/ref/heads/${base}`)
      const parent = head.object.sha
      const commitBase = await api<{ tree: { sha: string } }>('GET', `/git/commits/${parent}`)

      const tree: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = []
      for (const f of files) {
        const blob = await api<{ sha: string }>('POST', '/git/blobs', typeof f.content === 'string' ? { content: f.content, encoding: 'utf-8' } : { content: f.content.toString('base64'), encoding: 'base64' })
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha })
      }
      const newTree = await api<{ sha: string }>('POST', '/git/trees', { base_tree: commitBase.tree.sha, tree })
      const commit = await api<{ sha: string }>('POST', '/git/commits', { message: clampText(title, MAX_TITLE), tree: newTree.sha, parents: [parent] })
      await api('POST', '/git/refs', { ref: `refs/heads/work/${id}`, sha: commit.sha })
      const pr = await api<{ number: number; html_url: string }>('POST', '/pulls', { title: clampText(title, MAX_TITLE), head: `work/${id}`, base, body: clampText(body, MAX_BODY) })
      return { number: pr.number, url: pr.html_url }
    },
  }
}
