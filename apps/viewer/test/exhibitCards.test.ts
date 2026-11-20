import { describe, expect, it } from 'vitest'
import type { Place, Souvenir } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { starterPlaces } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { exhibitSpots, type ExhibitSpot } from '../src/world/exhibitGeometry.ts'
import { CARD_CELL, cardAtlas, cardContent, cardFaces, cardLayout, cardPose, cardShows, MAX_CARDS } from '../src/world/exhibitCards.ts'

type Exhibit = Place['exhibits'][number]
const exhibit = (over: Partial<Exhibit>): Exhibit => ({ id: 'e', kind: 'souvenir', ref: 'souvenirs/2026-11-13-a', slot: 'main/0/0', label: 'Why I kept it, in my words.', added: '2026-11-13', ...over })
const source = { url: 'https://en.wikipedia.org/wiki/Canopy_(botany)', title: 'Canopy (botany)', fetchedAt: '2026-11-13T06:25:44.992Z' }
const common = { id: '2026-11-13-a', why: 'It names the number.', topics: [], source, licence: null, placedIn: 'home' }
const quote: Souvenir = { ...common, kind: 'quote', content: 'The canopy is the upper layer.' }
const fact: Souvenir = { ...common, kind: 'fact', content: 'Leaf area index is a key measure of a canopy.', evidence: 'Leaf area index is a key measure.' }
const image: Souvenir = { ...common, kind: 'image', content: 'https://upload.wikimedia.org/a.jpg', licence: 'CC BY-SA', credit: 'A. Person' }

describe('what each exhibit shows on its face (issues 347, 355: no more blank boxes)', () => {
  it('a quote and a fact show their own words; the title bar names the page they came from', () => {
    const q = cardContent(exhibit({}), 'shelf', quote, 0)
    expect(q).toMatchObject({ shows: 'text', style: 'paper', title: 'Canopy (botany)', text: '“The canopy is the upper layer.”', picture: null })
    expect(cardContent(exhibit({}), 'case', fact, 0)).toMatchObject({ shows: 'text', text: 'Leaf area index is a key measure of a canopy.' })
  })

  it('an image shows its picture, with its credit and licence kept on the card', () => {
    const c = cardContent(exhibit({}), 'frame', image, 0)
    expect(c.shows).toBe('picture')
    expect(c.picture).toEqual({ url: 'https://upload.wikimedia.org/a.jpg', credit: 'A. Person', licence: 'CC BY-SA' })
    expect(c.text).toContain('A. Person')
    expect(c.text).toContain('CC BY-SA')
  })

  it('an image from an address that is not https is not loaded: the card shows the label instead', () => {
    const c = cardContent(exhibit({}), 'frame', { ...image, content: 'javascript:alert(1)' }, 0)
    expect(c.picture).toBeNull()
    expect(c.text).toBe('Why I kept it, in my words.')
  })

  it('before its souvenir file is read, or when it cannot be, the card shows the label Merge wrote, never nothing', () => {
    expect(cardContent(exhibit({}), 'shelf', undefined, 0)).toMatchObject({ shows: 'text', text: 'Why I kept it, in my words.' })
    expect(cardContent(exhibit({}), 'shelf', null, 0).shows).toBe('text')
  })

  it('a plaque shows its title in brass, the gallery a green line on the terminal with how many works there are', () => {
    expect(cardContent(exhibit({ kind: 'plaque', ref: 'places/home/plaque.md', label: 'On sand' }), 'plaque', null, 0)).toMatchObject({ shows: 'title', style: 'brass', text: 'On sand' })
    const g = cardContent(exhibit({ kind: 'gallery', ref: null, label: 'Every work I have made, in one place.' }), 'terminal', null, 5)
    expect(g).toMatchObject({ shows: 'text', style: 'terminal' })
    expect(g.text).toContain('5 works')
  })

  it('a card with no words and no picture says so (what the scene list reports, and the harness flags)', () => {
    const c = cardContent(exhibit({ label: '   ' }), 'shelf', null, 0)
    expect(c.shows).toBe('nothing')
    expect(cardShows(c)).toEqual({ shows: 'nothing', text: 'Kept' })
  })
})

describe('where a card is', () => {
  const fixture = makeFixtureWorld(1, 10)
  const spots: ExhibitSpot[] = fixture.places.flatMap((p) => exhibitSpots(p, kit, 0))

  it('every exhibit but a work screen gets a card (screens show their work)', () => {
    for (const s of spots) expect(cardPose(s) === null, `${s.slotKind} ${s.exhibit.id}`).toBe(s.slotKind === 'screen')
  })

  it('a shelf card stands on the shelf board near its front, inside the shelf, facing out and a little up', () => {
    const shelf = spots.find((s) => s.slotKind === 'shelf')!
    const [face] = cardFaces([shelf], new Map(), 0)
    const ys = face!.corners.map((c) => c[1])
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(shelf.position[1] + 0.03 - 1e-6)
    // Facing the part's front (+z turned by the part), leaning back towards the eyes.
    const flat = Math.hypot(face!.normal[0], face!.normal[2])
    expect(face!.normal[0] / flat).toBeCloseTo(Math.sin(shelf.rotY), 5)
    expect(face!.normal[2] / flat).toBeCloseTo(Math.cos(shelf.rotY), 5)
    // A little: leaning further back, the shelf's top board hid its first line from up close (issue 453).
    expect(face!.normal[1]).toBeGreaterThan(0.05)
    // Every corner is in front of the shelf's back and behind its front (the part is 0.4 deep, the slot in its middle).
    for (const c of face!.corners) {
      const out = (c[0] - shelf.position[0]) * Math.sin(shelf.rotY) + (c[2] - shelf.position[2]) * Math.cos(shelf.rotY)
      expect(out).toBeGreaterThan(-0.16)
      expect(out).toBeLessThan(0.2)
    }
  })

  it('a case card stands on top of its case', () => {
    const c = spots.find((s) => s.slotKind === 'case')
    if (!c) return
    const [face] = cardFaces([c], new Map(), 0)
    expect(Math.min(...face!.corners.map((p) => p[1]))).toBeGreaterThanOrEqual(c.partTop)
  })

  it('the terminal card leans back with the laptop screen', () => {
    const workshop = starterPlaces().find((p) => p.id === 'workshop')!
    const t = exhibitSpots(workshop, kit, 0).find((s) => s.slotKind === 'terminal')!
    const [face] = cardFaces([t], new Map(), 3)
    expect(face!.normal[1]).toBeGreaterThan(0.3)
    expect(face!.content.style).toBe('terminal')
  })
})

describe('how a card is laid out', () => {
  it('fits the whole of a short text in large type', () => {
    const l = cardLayout(cardContent(exhibit({}), 'shelf', quote, 0), 0.75)
    expect(l.px).toBeGreaterThanOrEqual(26)
    expect(l.lines.join(' ')).toBe('“The canopy is the upper layer.”')
    expect(l.h).toBe(240)
  })

  it('cuts a long quote with "…", never below 26 pixels, and every line stays inside the card', () => {
    const long: Souvenir = { ...quote, content: 'word '.repeat(56).trim() }
    const l = cardLayout(cardContent(exhibit({}), 'shelf', long, 0), 0.75)
    expect(l.px).toBe(26)
    expect(l.lines.at(-1)!.endsWith('…')).toBe(true)
    for (const line of l.lines) expect(line.length * l.px * 0.5).toBeLessThanOrEqual(CARD_CELL.w - 24)
    expect(l.top + (l.lines.length - 1) * l.lineHeight).toBeLessThanOrEqual(l.h)
  })

  it('a picture gets the card above one credit line', () => {
    const l = cardLayout(cardContent(exhibit({}), 'frame', image, 0), 0.75)
    expect(l.picture).not.toBeNull()
    expect(l.picture!.h).toBeGreaterThan(120)
    expect(l.lines).toHaveLength(1)
  })

  it('every card in one texture, eight to a row, never larger than a phone can hold', () => {
    expect(cardAtlas(3)).toMatchObject({ width: 960, height: 240 })
    expect(cardAtlas(20)).toMatchObject({ width: 2560, height: 720 })
    expect(cardAtlas(10_000).height).toBeLessThanOrEqual(4096)
    expect(MAX_CARDS).toBeGreaterThan(100)
  })
})
