import { describe, expect, it } from 'vitest'
import { Artifact, SpeciesPack } from '@forkling/schema'
import catSpecies from '@forkling/species-cat/species.json'
import { photoUrl, pickPhotos } from '../src/art/gallery.ts'
import { createWorldClock } from '../src/clock.ts'
import { eyeCamUrl, parseEyeCam, type EyeCamShot } from '../src/eyecam/params.ts'
import { loadWorld } from '../src/world/loadWorld.ts'
import { localFetch, LOCAL_REF } from '../src/world/localWorld.ts'

const photo = (id: string, at: string) =>
  Artifact.parse({ id, kind: 'photo', title: id, content: { image: `photos/${id}.jpg`, caption: 'c', opinion: 'o', noticed: false }, skillLevel: 1, createdAt: at })
const poem = (id: string, at: string) => Artifact.parse({ id, kind: 'writing', title: id, content: { text: 'x' }, skillLevel: 1, createdAt: at })

describe('pickPhotos', () => {
  it('takes the newest photos, and nothing else', () => {
    const art = [photo('a', '2026-11-01T10:00:00Z'), poem('p', '2026-11-05T10:00:00Z'), photo('b', '2026-11-03T10:00:00Z'), photo('c', '2026-11-02T10:00:00Z')]
    expect(pickPhotos(art, 2).map((a) => a.id)).toEqual(['b', 'c'])
  })

  it('is empty without photos', () => {
    expect(pickPhotos([poem('p', '2026-11-05T10:00:00Z')], 3)).toEqual([])
  })
})

describe('photoUrl', () => {
  it('points at the frame in the repo, at the commit the world was read from', () => {
    expect(photoUrl({ owner: 'RomanKuroptev', repo: 'merge' }, 'abc123', 'photos/pond.jpg')).toBe('https://raw.githubusercontent.com/RomanKuroptev/merge/abc123/art/photos/pond.jpg')
  })

  it('has nothing for an image path that is not under photos', () => {
    expect(photoUrl({ owner: 'o', repo: 'r' }, 'abc', '../forkling.json')).toBeNull()
    expect(photoUrl({ owner: 'o', repo: 'r' }, 'abc', 'photos/x.svg')).toBeNull()
  })
})

describe('createWorldClock with ?at=', () => {
  it('holds the world at that moment, wherever and whenever it is opened', () => {
    const clock = createWorldClock('Europe/Stockholm', '?at=2026-11-03T12:30:00Z')
    expect(clock.now()).toBe(Date.parse('2026-11-03T12:30:00Z'))
    expect(clock.hour()).toBeCloseTo(13.5, 5)
    expect(clock.synced).toBe(false)
  })

  it('ignores a time that is not one', () => {
    const clock = createWorldClock('Europe/Stockholm', '?at=yesterday')
    expect(clock.synced).toBe(true)
    expect(Math.abs(clock.now() - Date.now())).toBeLessThan(1000)
  })
})

describe('parseEyeCam', () => {
  const shot: EyeCamShot = { eye: [1, 0.3, 2], look: [3, 0.5, 4] }

  it('reads the shot from the address', () => {
    expect(parseEyeCam(eyeCamUrl(shot, '2026-11-03T12:30:00Z'))).toEqual(shot)
  })

  it('is null when it is not asked for', () => {
    expect(parseEyeCam('?debug')).toBeNull()
  })

  it('is null for something that is not a shot', () => {
    expect(parseEyeCam('?eyecam=nope')).toBeNull()
    expect(parseEyeCam(`?eyecam=${encodeURIComponent(JSON.stringify({ eye: [1, 2], look: [1, 2, 3] }))}`)).toBeNull()
    expect(parseEyeCam(`?eyecam=${encodeURIComponent(JSON.stringify({ eye: [1, 2, 'x'], look: [1, 2, 3] }))}`)).toBeNull()
  })
})

describe('localFetch', () => {
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
  const rock = { id: 'sunny-rock', kind: 'rock', name: 'The sunny rock', position: [5, 0, 22], model: { asset: 'nature/rock_largeA' }, reason: 'Morning sun.' }
  const files: Record<string, unknown> = { 'forkling.json': forkling, 'objects/sunny-rock.json': rock }

  /** What a static server would answer under `<origin>/world/`. */
  const served: typeof fetch = async (input) => {
    const url = String(input)
    const path = url.replace('http://localhost:4173/world/', '')
    if (path === 'manifest.json') return new Response(JSON.stringify(Object.keys(files)))
    return path in files ? new Response(JSON.stringify(files[path])) : new Response('nope', { status: 404 })
  }

  it('lets the viewer load a world from files served next to it, with no GitHub in between', async () => {
    const result = await loadWorld(LOCAL_REF, {
      fetch: localFetch('http://localhost:4173/', served),
      species: { cat: SpeciesPack.parse(catSpecies) },
      assets: new Set(['nature/rock_largeA']),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.world.forkling.name).toBe('Merge')
      expect(result.world.objects.map((o) => o.id)).toEqual(['sunny-rock'])
      expect(result.world.sha).toBe('local')
    }
  })

  it('leaves every other address to the real fetch', async () => {
    const seen: string[] = []
    const real: typeof fetch = async (input) => {
      seen.push(String(input))
      return new Response('ok')
    }
    await localFetch('http://localhost:4173/', real)('https://example.com/models/cat.glb')
    expect(seen).toEqual(['https://example.com/models/cat.glb'])
  })
})
