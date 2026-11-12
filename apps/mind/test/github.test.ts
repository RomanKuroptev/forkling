import { describe, expect, it } from 'vitest'
import { createGithubClient, repoFromUrl } from '../src/builds/github.ts'

interface Seen {
  method: string
  path: string
  body: Record<string, unknown> | null
  headers: Headers
}

/** A GitHub that answers the Git Data API from a script, and remembers every call. */
function fakeGithub(overrides: Record<string, { status: number; json: unknown }> = {}) {
  const seen: Seen[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url))
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null
    seen.push({ method, path: u.pathname, body, headers: new Headers(init?.headers) })
    const key = `${method} ${u.pathname}`
    const hit = Object.entries(overrides).find(([k]) => key.startsWith(k))
    if (hit) return new Response(JSON.stringify(hit[1].json), { status: hit[1].status })
    const answers: [RegExp, unknown][] = [
      [/^GET \/repos\/o\/r\/git\/ref\/heads\/main$/, { object: { sha: 'base-commit' } }],
      [/^GET \/repos\/o\/r\/git\/commits\/base-commit$/, { tree: { sha: 'base-tree' } }],
      [/^POST \/repos\/o\/r\/git\/blobs$/, { sha: `blob-${seen.length}` }],
      [/^POST \/repos\/o\/r\/git\/trees$/, { sha: 'new-tree' }],
      [/^POST \/repos\/o\/r\/git\/commits$/, { sha: 'new-commit' }],
      [/^POST \/repos\/o\/r\/git\/refs$/, { ref: 'refs/heads/work/a-lamp' }],
      [/^POST \/repos\/o\/r\/pulls$/, { number: 7, html_url: 'https://github.com/o/r/pull/7' }],
    ]
    const found = answers.find(([re]) => re.test(key))
    return found ? new Response(JSON.stringify(found[1]), { status: 201 }) : new Response('{}', { status: 404 })
  }) as typeof fetch
  return { seen, fetchImpl }
}

const files = [
  { path: 'works/a-lamp/index.html', content: '<p>é</p>' },
  { path: 'works/a-lamp/meta.json', content: '{}\n' },
  { path: 'works/a-lamp/thumb.png', content: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
]
const args = { id: 'a-lamp', files, title: 'Work: A lamp', body: 'Made by Merge.' }

describe('repoFromUrl', () => {
  it('reads owner and name from a GitHub address, with or without a token, a .git or a slash', () => {
    expect(repoFromUrl('https://github.com/RomanKuroptev/merge.git')).toBe('RomanKuroptev/merge')
    expect(repoFromUrl('https://x-access-token:secret@github.com/RomanKuroptev/merge')).toBe('RomanKuroptev/merge')
    expect(repoFromUrl('https://github.com/RomanKuroptev/merge/')).toBe('RomanKuroptev/merge')
  })
  it('gives null for anything else', () => {
    for (const url of ['', 'not a url', 'https://example.org/a/b', 'https://github.com/only-one']) expect(repoFromUrl(url), url).toBeNull()
  })
})

describe('openWorkPullRequest (the REST Git Data API, with no local git)', () => {
  it('branches from main, commits the files as one commit and opens a pull request, in that order', async () => {
    const { seen, fetchImpl } = fakeGithub()
    const client = createGithubClient({ token: 't0ken', repo: 'o/r', fetch: fetchImpl })
    const pr = await client.openWorkPullRequest(args)
    expect(pr).toEqual({ number: 7, url: 'https://github.com/o/r/pull/7' })
    expect(seen.map((s) => `${s.method} ${s.path.replace('/repos/o/r', '')}`)).toEqual([
      'GET /git/ref/heads/main',
      'GET /git/commits/base-commit',
      'POST /git/blobs',
      'POST /git/blobs',
      'POST /git/blobs',
      'POST /git/trees',
      'POST /git/commits',
      'POST /git/refs',
      'POST /pulls',
    ])
  })

  it('sends text as utf-8 and a picture as base64, and puts every file in one tree on top of the base tree', async () => {
    const { seen, fetchImpl } = fakeGithub()
    await createGithubClient({ token: 't', repo: 'o/r', fetch: fetchImpl }).openWorkPullRequest(args)
    const blobs = seen.filter((s) => s.path.endsWith('/blobs')).map((s) => s.body)
    expect(blobs[0]).toEqual({ content: '<p>é</p>', encoding: 'utf-8' })
    expect(blobs[2]).toEqual({ content: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'), encoding: 'base64' })
    const tree = seen.find((s) => s.path.endsWith('/trees'))!.body as { base_tree: string; tree: { path: string; mode: string; type: string }[] }
    expect(tree.base_tree).toBe('base-tree')
    expect(tree.tree.map((t) => t.path)).toEqual(files.map((f) => f.path))
    expect(tree.tree.every((t) => t.mode === '100644' && t.type === 'blob')).toBe(true)
    const commit = seen.find((s) => s.path.endsWith('/git/commits') && s.method === 'POST')!.body
    expect(commit).toMatchObject({ tree: 'new-tree', parents: ['base-commit'] })
  })

  it('puts the work on a branch of its own and opens the pull request against main', async () => {
    const { seen, fetchImpl } = fakeGithub()
    await createGithubClient({ token: 't', repo: 'o/r', fetch: fetchImpl }).openWorkPullRequest(args)
    expect(seen.find((s) => s.path.endsWith('/refs'))!.body).toEqual({ ref: 'refs/heads/work/a-lamp', sha: 'new-commit' })
    expect(seen.find((s) => s.path.endsWith('/pulls'))!.body).toEqual({ title: 'Work: A lamp', head: 'work/a-lamp', base: 'main', body: 'Made by Merge.' })
  })

  it('sends the token only as a bearer header, and the API version, and a user agent', async () => {
    const { seen, fetchImpl } = fakeGithub()
    await createGithubClient({ token: 't0ken', repo: 'o/r', fetch: fetchImpl }).openWorkPullRequest(args)
    for (const s of seen) {
      expect(s.headers.get('authorization')).toBe('Bearer t0ken')
      expect(s.headers.get('x-github-api-version')).toBeTruthy()
      expect(s.headers.get('user-agent')).toBeTruthy()
      expect(JSON.stringify(s.body)).not.toContain('t0ken')
    }
  })

  it('refuses an id that could make a bad branch name or a path out of works/<id>/', async () => {
    const { fetchImpl } = fakeGithub()
    const client = createGithubClient({ token: 't', repo: 'o/r', fetch: fetchImpl })
    await expect(client.openWorkPullRequest({ ...args, id: '../x' })).rejects.toThrow(/id/)
    await expect(client.openWorkPullRequest({ ...args, files: [{ path: '.github/workflows/x.yml', content: 'x' }] })).rejects.toThrow(/works\//)
    await expect(client.openWorkPullRequest({ ...args, files: [{ path: 'works/other/index.html', content: 'x' }] })).rejects.toThrow(/works\/a-lamp\//)
  })

  it('says what failed and never the token, when GitHub answers an error', async () => {
    const { fetchImpl } = fakeGithub({ 'POST /repos/o/r/git/refs': { status: 422, json: { message: 'Reference already exists' } } })
    const client = createGithubClient({ token: 'sekret-token', repo: 'o/r', fetch: fetchImpl })
    const error = await client.openWorkPullRequest(args).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/422/)
    expect((error as Error).message).toMatch(/Reference already exists/)
    expect((error as Error).message).not.toContain('sekret-token')
  })

  it('does not hang on a network error: it fails with a message', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNRESET')
    }) as typeof fetch
    await expect(createGithubClient({ token: 't', repo: 'o/r', fetch: fetchImpl }).openWorkPullRequest(args)).rejects.toThrow(/ECONNRESET/)
  })
})
