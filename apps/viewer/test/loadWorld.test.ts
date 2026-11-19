import { describe, expect, it } from 'vitest'
import { PlaceRequest, SpeciesPack, formatRequest } from '@forkling/schema'
import catSpecies from '@forkling/species-cat/species.json'
import { loadWorld, placesOrStarter, type LoadDeps } from '../src/world/loadWorld.ts'
import homeFile from '../../../templates/forkling-world/places/home.json'
import workshopFile from '../../../templates/forkling-world/places/workshop.json'

const SHA = 'abc123'
const ref = { owner: 'RomanKuroptev', repo: 'merge' }

const forkling = {
  name: 'Merge',
  species: 'cat',
  position: [2, 0, 20],
  mood: 0.1,
  intention: { type: 'sit', startedAt: '2026-10-30T21:00:00Z', seed: 1, reason: 'New island.' },
  lastTickAt: '2026-10-30T21:00:00Z',
  timezone: 'Europe/Stockholm',
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
  it('loads the forkling at the latest commit', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'journal/2026-10-30.md': '# hi' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.world.sha).toBe(SHA)
    expect(result.world.committedAt).toBe('2026-10-30T21:05:00Z')
    expect(result.world.forkling.name).toBe('Merge')
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
    const result = await loadWorld(ref, deps({ 'forkling.json': { ...forkling, mood: 2 } }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.kind).toBe('invalid')
    expect(result.error.problems[0]!.file).toBe('forkling.json')
    expect(result.error.problems[0]!.lines.join('\n')).toMatch(/mood/)
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

  it('ignores a leftover objects/ folder from the pet era instead of failing on it', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'objects/old.json': { id: 'not an object' }, 'objects/bowl.json': 'not json at all' }))
    expect(result.ok).toBe(true)
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

describe('loadWorld places (W5)', () => {
  const home = { ...homeFile }
  const workshop = { ...workshopFile }

  it('reads places/<id>.json, in id order', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'places/workshop.json': workshop, 'places/home.json': home }))
    expect(result.ok && result.world.places.map((p) => p.id)).toEqual(['home', 'workshop'])
  })

  it('shows Home and the Workshop for a world that has no places yet', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling }))
    expect(result.ok && result.world.places.map((p) => p.id)).toEqual(['home', 'workshop'])
  })

  it('also falls back when every place file is left out as not fitting', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'places/broken.json': { id: 'broken' } }))
    expect(result.ok && result.world.places.map((p) => p.id)).toEqual(['home', 'workshop'])
  })

  it('keeps the places a world has, and never mixes the built-in ones in', () => {
    const mine = [{ ...home, id: 'mine' }] as never[]
    expect(placesOrStarter(mine)).toBe(mine)
    expect(placesOrStarter([]).map((p) => p.id)).toEqual(['home', 'workshop'])
  })

  it('leaves out a place file that does not fit, as the mind does, instead of failing the whole world', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'places/home.json': home, 'places/broken.json': { id: 'broken' }, 'places/worse.json': 'not json at all' }))
    expect(result.ok && result.world.places.map((p) => p.id)).toEqual(['home'])
  })

  it('reads only the files directly in places/, and only json', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'places/home.json': home, 'places/old/workshop.json': workshop, 'places/notes.md': 'x', 'other/places/workshop.json': workshop }))
    expect(result.ok && result.world.places.map((p) => p.id)).toEqual(['home'])
  })

  it('reads at most 64, the most a world may have', async () => {
    const many: Files = { 'forkling.json': forkling }
    for (let i = 0; i < 70; i++) many[`places/p${String(i).padStart(2, '0')}.json`] = { ...home, id: `p${String(i).padStart(2, '0')}` }
    const result = await loadWorld(ref, deps(many))
    expect(result.ok && result.world.places).toHaveLength(64)
  })
})

describe('loadWorld works (W5)', () => {
  it('lists the ids of the works in the repo, in name order, without reading them', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'works/b/meta.json': {}, 'works/a/meta.json': {}, 'works/a/index.html': 'x', 'works/c/thumb.png': 'x', 'notes/works/z/meta.json': {} }))
    expect(result.ok && result.world.workIds).toEqual(['a', 'b'])
  })
})

describe('loadWorld work pictures (issue 352)', () => {
  it('lists the works that have a thumbnail, so a screen can show it', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'works/b/meta.json': {}, 'works/b/thumb.png': 'x', 'works/a/meta.json': {}, 'works/c/thumb.png': 'x', 'notes/works/z/thumb.png': 'x' }))
    expect(result.ok && result.world.workThumbs).toEqual(['b', 'c'])
  })
})

describe('loadWorld requests (W6 slice 8)', () => {
  const request = (over: Record<string, unknown> = {}) =>
    formatRequest(PlaceRequest.parse({ id: 'lantern-hall', kind: 'place', name: 'Lantern Hall', purpose: 'Where the lidar finds hold up.', tags: ['maya lidar'], chunk: [1, 0], related: [], souvenirs: [], written: '2026-11-14T10:00:00Z', status: 'open', statusAt: null, note: null, body: 'I want a lamp over each find.', ...over }))

  it('reads requests/<id>.md, in id order, and keeps their status', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling, 'requests/lantern-hall.md': request(), 'requests/a-first.md': request({ id: 'a-first', name: 'A First', chunk: [0, 1], status: 'building', statusAt: '2026-11-15T10:00:00Z' }) }))
    expect(result.ok && result.world.requests.map((r) => [r.id, r.status])).toEqual([['a-first', 'building'], ['lantern-hall', 'open']])
  })

  it('has none for a world with no requests', async () => {
    const result = await loadWorld(ref, deps({ 'forkling.json': forkling }))
    expect(result.ok && result.world.requests).toEqual([])
  })

  it('leaves out a file that does not fit, one whose id is not its name, and anything not directly in requests/ or not markdown, never an error', async () => {
    const result = await loadWorld(
      ref,
      deps({ 'forkling.json': forkling, 'requests/lantern-hall.md': request(), 'requests/junk.md': 'just words', 'requests/wrong.md': request({ id: 'other' }), 'requests/old/x.md': request({ id: 'x' }), 'requests/notes.txt': request({ id: 'notes' }) }),
    )
    expect(result.ok && result.world.requests.map((r) => r.id)).toEqual(['lantern-hall'])
  })

  it('reads at most 24', async () => {
    const many: Record<string, unknown> = { 'forkling.json': forkling }
    for (let i = 0; i < 30; i++) many[`requests/r${String(i).padStart(2, '0')}.md`] = request({ id: `r${String(i).padStart(2, '0')}`, name: `Place ${i}` })
    const result = await loadWorld(ref, deps(many))
    expect(result.ok && result.world.requests).toHaveLength(24)
  })
})
