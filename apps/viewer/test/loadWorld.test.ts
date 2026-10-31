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

describe('loadWorld temperament', () => {
  const roll = { likes: [{ category: 'material', value: 'stone' }], dislikes: [], quirks: [{ id: 'hoarder', text: 'Keeps everything.' }] }

  it('reads brain/temperament.json when the world has one', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'brain/temperament.json': roll }))
    expect(result.ok && result.world.temperament?.quirks[0]?.id).toBe('hoarder')
  })

  it('treats a world without one as not yet rolled', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling }))
    expect(result.ok && result.world.temperament).toBeNull()
  })

  it('reports a temperament file that does not fit, by name', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'brain/temperament.json': { likes: 3 } }))
    expect(!result.ok && result.error.problems.map((p) => p.file)).toEqual(['brain/temperament.json'])
  })

  it('accepts objects the forkling made out of parts', async () => {
    const made = { ...rock, id: 'a-shelf', model: { parts: [{ shape: 'box', size: [0.5, 0.2, 0.5], at: [0, 0.1, 0], color: '#a67c52' }] } }
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'objects/a-shelf.json': made }))
    expect(result.ok && result.world.objects.map((o) => o.id)).toEqual(['a-shelf'])
  })
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

describe('loadWorld art', () => {
  const piece = (id: string, createdAt: string) => ({ id, kind: 'writing', title: id, content: { text: 'x' }, skillLevel: 1, createdAt })

  it('reads what it has made, newest first', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'art/a.json': piece('a', '2026-11-01T10:00:00Z'), 'art/b.json': piece('b', '2026-11-03T10:00:00Z') }))
    expect(result.ok && result.world.art.map((a) => a.id)).toEqual(['b', 'a'])
  })

  it('has no art in a world that has made none', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling }))
    expect(result.ok && result.world.art).toEqual([])
  })

  it('leaves out a piece that does not fit instead of failing the world', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'art/ok.json': piece('ok', '2026-11-01T10:00:00Z'), 'art/bad.json': { id: 'bad', kind: 'melody', content: { text: 'no' } } }))
    expect(result.ok).toBe(true)
    expect(result.ok && result.world.art.map((a) => a.id)).toEqual(['ok'])
  })

  it('ignores files in art/ that are not artifacts', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'art/.gitkeep': '', 'art/notes.txt': 'hello' }))
    expect(result.ok && result.world.art).toEqual([])
  })

  it('reads at most thirty', async () => {
    const files: Record<string, unknown> = { 'forkling.json': forkling }
    for (let n = 0; n < 40; n++) files[`art/p${String(n).padStart(2, '0')}.json`] = piece(`p${n}`, `2026-11-01T10:${String(n).padStart(2, '0')}:00Z`)
    const result = await loadWorld(ref, deps(files))
    expect(result.ok && result.world.art).toHaveLength(30)
  })
})
