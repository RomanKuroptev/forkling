import { describe, expect, it } from 'vitest'
import { SpeciesPack } from '@forkling/schema'
import catSpecies from '@forkling/species-cat/species.json'
import { loadWorld, type LoadDeps } from '../src/world/loadWorld.ts'

const SHA = 'abc123'
const ref = { owner: 'RomanKuroptev', repo: 'merge' }

const forkling = {
  name: 'Merge',
  species: 'cat',
  needs: { hunger: 70, energy: 80 },
  position: [2, 0, 20],
  mood: 'curious',
  intention: { type: 'sit', startedAt: '2026-10-30T21:00:00Z', seed: 1, reason: 'New island.' },
  lastTickAt: '2026-10-30T21:00:00Z',
  timezone: 'Europe/Stockholm',
}

const rock = {
  id: 'sunny-rock',
  kind: 'rock',
  name: 'The sunny rock',
  position: [5, 0, 22],
  model: { asset: 'nature/rock_largeA' },
  reason: 'Morning sun.',
}

type Files = Record<string, unknown>

/** A fake GitHub: the commits and trees API plus raw file contents, with knobs for failure modes. */
function github(files: Files, opts: { status?: number; rateLimited?: boolean } = {}): LoadDeps['fetch'] {
  return async (input) => {
    const url = String(input)
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers })
    if (url.startsWith('https://api.github.com/')) {
      if (opts.rateLimited) return json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0' })
      if (opts.status) return json({ message: 'Not Found' }, opts.status)
      if (url.includes('/commits/')) return json({ sha: SHA, commit: { committer: { date: '2026-10-30T21:05:00Z' } } })
      if (url.includes(`/git/trees/${SHA}`)) {
        return json({ tree: Object.keys(files).map((path) => ({ path, type: 'blob' })), truncated: false })
      }
    }
    const raw = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${SHA}/`
    if (url.startsWith(raw)) {
      const path = url.slice(raw.length)
      if (path in files) return json(files[path])
    }
    return json('Not found', 404)
  }
}

const deps = (files: Files, opts?: Parameters<typeof github>[1]): LoadDeps => ({
  fetch: github(files, opts),
  species: { cat: SpeciesPack.parse(catSpecies) },
  assets: new Set(['nature/rock_largeA']),
})

describe('loadWorld goals', () => {
  const goals = {
    long: { text: 'Own the rock.', reason: 'Warm.', setAt: '2026-11-03T07:10:00Z', reviewedAt: '2026-11-03T07:10:00Z' },
  }

  it('reads mind/goals.json when the world has one', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'mind/goals.json': goals }))
    expect(result.ok && result.world.goals.long?.text).toBe('Own the rock.')
  })

  it('treats a world without one as having no goals yet', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling }))
    expect(result.ok && result.world.goals).toEqual({})
  })

  it('reports a goals file that does not fit, by name', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'mind/goals.json': { now: { index: -1 } } }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.problems.map((p) => p.file)).toEqual(['mind/goals.json'])
  })
})

describe('loadWorld', () => {
  it('loads the forkling and its objects at the latest commit', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'objects/sunny-rock.json': rock, 'journal/2026-10-30.md': '# hi' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.world.sha).toBe(SHA)
    expect(result.world.committedAt).toBe('2026-10-30T21:05:00Z')
    expect(result.world.forkling.name).toBe('Merge')
    expect(result.world.objects.map((o) => o.id)).toEqual(['sunny-rock'])
  })

  it('says so when the repo does not exist', async () => {
    const result = await loadWorld(ref, deps({}, { status: 404 }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('not-found')
  })

  it('explains the GitHub rate limit instead of failing silently', async () => {
    const result = await loadWorld(ref, deps({}, { rateLimited: true }))
    expect(!result.ok && result.error.kind).toBe('rate-limited')
  })

  it('recognises a repo that is not a forkling world', async () => {
    const result = await loadWorld(ref, deps({ 'README.md': '# not a world' }))
    expect(!result.ok && result.error.kind).toBe('not-a-world')
  })

  it('names the file and field when forkling.json is invalid', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': { ...forkling, needs: { hunger: 140 } } }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid')
    expect(result.error.problems[0]!.file).toBe('forkling.json')
    expect(result.error.problems[0]!.lines.join('\n')).toMatch(/needs\.hunger/)
  })

  it('reports JSON that does not parse', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': '{ "name": "Merge",' }))
    expect(!result.ok && result.error.problems[0]!.lines.join(' ')).toMatch(/JSON/)
  })

  it('reports an unknown species and a forkling that does not fit its pack', async () => {
    const dog = await loadWorld(ref, deps({ 'forkling.json': { ...forkling, species: 'dog' } }))
    expect(!dog.ok && dog.error.problems[0]!.lines.join(' ')).toMatch(/dog/)
    const flying = await loadWorld(ref, deps({ 'forkling.json': { ...forkling, intention: { ...forkling.intention, type: 'fly' } } }))
    expect(!flying.ok && flying.error.problems[0]!.lines.join(' ')).toMatch(/fly/)
  })

  it('collects every broken object file, not just the first', async () => {
    const result = await loadWorld(
      ref,
      deps({
        'forkling.json': forkling,
        'objects/sunny-rock.json': { ...rock, id: 'other-name' },
        'objects/statue.json': { ...rock, id: 'statue', model: { asset: 'nature/statue' } },
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.problems.map((p) => p.file).sort()).toEqual(['objects/statue.json', 'objects/sunny-rock.json'])
    expect(result.error.problems.find((p) => p.file === 'objects/statue.json')!.lines.join(' ')).toMatch(/nature\/statue/)
  })

  it('revalidates API answers so a push shows up on the next refresh', async () => {
    const modes: (RequestCache | undefined)[] = []
    const base = deps({ 'forkling.json': forkling })
    await loadWorld(ref, {
      ...base,
      fetch: (input, init) => {
        if (String(input).startsWith('https://api.github.com/')) modes.push(init?.cache)
        return base.fetch(input, init)
      },
    })
    expect(modes.length).toBeGreaterThan(0)
    expect(modes.every((m) => m === 'no-cache')).toBe(true)
  })

  it('loads a branch when one is asked for', async () => {
    const seen: string[] = []
    const base = deps({ 'forkling.json': forkling })
    const result = await loadWorld({ ...ref, ref: 'builder/new-box' }, {
      ...base,
      fetch: (input, init) => {
        seen.push(String(input))
        return base.fetch(input, init)
      },
    })
    expect(result.ok).toBe(true)
    expect(seen[0]).toContain('/commits/builder%2Fnew-box')
  })
})
