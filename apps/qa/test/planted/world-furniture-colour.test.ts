import { describe, expect, it } from 'vitest'
import { surfaceColourFindings, type SurfaceColour } from '../../src/world/colours.ts'

const surface = (place: string, kind: SurfaceColour['kind'], what: string, color: string, area: number): SurfaceColour => ({ place, kind, what, color, area })

describe('furniture and lit surfaces in the look colours, never brown, khaki, beige or flat grey (issues 409, 430)', () => {
  it('passes a world whose furniture wears pastel palette colours', () => {
    const clean = [
      surface('home', 'furniture', 'part counter-room/0 (plinth)', '#f8a3d1', 0.3),
      surface('home', 'furniture', 'part main/6 (cat-bed)', '#ff8889', 0.48),
      surface('workshop', 'furniture', 'part bench-room/0 (workbench)', '#a289d7', 0.05),
      surface('grown-place-6', 'unlit', 'the outside', '#7ffcff', 6),
      // A thin lamp pole in a pale metal is too small to read as a grey box.
      surface('hillside-room-five-lamps', 'furniture', 'part lamp-room/8 (lamp-floor)', '#d8d8ff', 0.05),
    ]
    expect(surfaceColourFindings(clean, 'day-7')).toEqual([])
  })

  it('planted: the brown cat bed, the khaki desk cube and the tan front panel are one muddy finding per place', () => {
    const found = surfaceColourFindings(
      [
        surface('home', 'furniture', 'part main/6 (cat-bed)', '#ff9f43', 0.38),
        surface('workshop', 'furniture', 'part bench-room/0 (workbench)', '#fff27a', 0.05),
        surface('grown-place-6', 'unlit', 'the outside', '#fff27a', 6.2),
      ],
      'day-7',
    ).filter((f) => f.id === 'world.furniture-muddy')
    expect(found.map((f) => f.fingerprint)).toEqual(['world.furniture-muddy|day-7|home', 'world.furniture-muddy|day-7|workshop', 'world.furniture-muddy|day-7|grown-place-6'])
    expect(found.every((f) => f.severity === 'major' && f.fixKind === 'look')).toBe(true)
    expect(found[0]!.what).toContain('part main/6 (cat-bed)')
    expect(found[0]!.what).toContain('#ff9f43')
  })

  it('planted: the plain grey plinths and the laptop stand are one grey-prop finding per place, the small grey pole is not', () => {
    const found = surfaceColourFindings(
      [
        surface('home', 'furniture', 'part counter-room/0 (plinth)', '#eaffd6', 0.3),
        surface('hillside-room-five-lamps', 'furniture', 'part lamp-room/15 (plinth)', '#e2ccff', 0.3),
        surface('hillside-room-five-lamps', 'furniture', 'part lamp-room/8 (lamp-floor)', '#d8d8ff', 0.05),
        surface('workshop', 'furniture', 'part bench-room/3 (terminal)', '#e2e0ff', 0.24),
      ],
      'day-7',
    )
    const grey = found.filter((f) => f.id === 'world.grey-prop')
    expect(grey.map((f) => f.fingerprint)).toEqual(['world.grey-prop|day-7|home', 'world.grey-prop|day-7|hillside-room-five-lamps', 'world.grey-prop|day-7|workshop'])
    expect(grey.every((f) => f.severity === 'major' && f.fixKind === 'look')).toBe(true)
    expect(grey[1]!.what).toContain('part lamp-room/15 (plinth)')
    expect(grey[1]!.what).not.toContain('lamp-floor')
    // The pale lime of Home's plinth is also an olive in shade.
    expect(found.some((f) => f.fingerprint === 'world.furniture-muddy|day-7|home')).toBe(true)
  })
})
