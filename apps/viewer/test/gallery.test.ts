import { describe, expect, it } from 'vitest'
import { Artifact } from '@forkling/schema'
import { hearsMelody, MELODY_RANGE, noteSchedule, pickDrawings, pickMelody, svgDataUrl } from '../src/art/gallery.ts'

const make = (id: string, kind: string, content: unknown, createdAt: string) => Artifact.parse({ id, kind, title: id, content, skillLevel: 1, createdAt })

const drawing = (id: string, at: string) => make(id, 'drawing', { svg: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>' }, at)
const melody = (id: string, at: string) => make(id, 'melody', { bpm: 120, notes: [{ pitch: 'C4', beats: 1 }, { pitch: 'R', beats: 1 }, { pitch: 'G4', beats: 2 }] }, at)
const poem = (id: string, at: string) => make(id, 'writing', { text: 'x' }, at)

describe('pickDrawings', () => {
  it('takes the newest drawings, and nothing else', () => {
    const art = [drawing('a', '2026-11-01T10:00:00Z'), poem('p', '2026-11-05T10:00:00Z'), drawing('b', '2026-11-03T10:00:00Z'), drawing('c', '2026-11-02T10:00:00Z'), drawing('d', '2026-11-04T10:00:00Z')]
    expect(pickDrawings(art, 3).map((a) => a.id)).toEqual(['d', 'b', 'c'])
  })

  it('is empty without drawings', () => {
    expect(pickDrawings([poem('p', '2026-11-05T10:00:00Z')], 3)).toEqual([])
  })
})

describe('pickMelody', () => {
  it('takes the newest melody', () => {
    expect(pickMelody([melody('old', '2026-11-01T10:00:00Z'), melody('new', '2026-11-04T10:00:00Z'), drawing('d', '2026-11-05T10:00:00Z')])?.id).toBe('new')
  })

  it('is null without one', () => {
    expect(pickMelody([drawing('d', '2026-11-05T10:00:00Z')])).toBeNull()
  })
})

describe('noteSchedule', () => {
  it('lays the notes out in seconds from the tempo, and skips rests', () => {
    const m = melody('m', '2026-11-04T10:00:00Z')
    if (m.kind !== 'melody') throw new Error('not a melody')
    const { notes, length } = noteSchedule(m.content)
    // 120 bpm is half a second a beat.
    expect(notes).toHaveLength(2)
    expect(notes[0]).toMatchObject({ pitch: 'C4', at: 0 })
    expect(notes[0]!.duration).toBeCloseTo(0.45, 5)
    expect(notes[1]).toMatchObject({ pitch: 'G4', at: 1 })
    expect(length).toBeCloseTo(2, 5)
  })
})

describe('svgDataUrl', () => {
  it('turns a drawing into an image address a texture can load, with the namespace an image needs', () => {
    const url = svgDataUrl('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>')!
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(url.split(',')[1]!)).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('cleans the drawing first, so nothing that could run reaches an image either', () => {
    const url = svgDataUrl('<svg viewBox="0 0 10 10" onload="x()"><script>x()</script><circle cx="5" cy="5" r="3"/></svg>')!
    const svg = decodeURIComponent(url.split(',')[1]!)
    expect(svg).not.toMatch(/script|onload/)
  })

  it('gives nothing for a drawing with nothing safe in it', () => {
    expect(svgDataUrl('<script>x()</script>')).toBeNull()
  })
})

describe('hearsMelody', () => {
  const near = { x: 3, z: 4 } // 5 m away
  const far = { x: 30, z: 40 }
  const at = { x: 0, z: 0 }

  it('is true while the forkling makes or plays music and the visitor is close', () => {
    expect(hearsMelody({ id: 'compose', artifact: 'melody' }, at, near)).toBe(true)
    expect(hearsMelody({ id: 'play' }, at, near)).toBe(true)
  })

  it('is false when it is doing something else, or the visitor is far away, or there is no visitor yet', () => {
    expect(hearsMelody({ id: 'draw', artifact: 'drawing' }, at, near)).toBe(false)
    expect(hearsMelody({ id: 'compose', artifact: 'melody' }, at, far)).toBe(false)
    expect(hearsMelody({ id: 'compose', artifact: 'melody' }, at, null)).toBe(false)
  })

  it('has a range of about eight meters', () => {
    expect(MELODY_RANGE).toBe(8)
  })
})
