import { describe, expect, it } from 'vitest'
import type { SceneObject } from '../../src/world/open.ts'
import { standingFindings } from '../../src/world/inside-walls.ts'

const o = (id: string, kind: SceneObject['kind'], min: [number, number, number], max: [number, number, number], extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind, place: 'home', box: { min, max }, visible: true, material: 'solid', ...extra })

/** Home on day-7: Tiny Patch on its screen, hung on the back wall, and a souvenir card on a plaque stand. */
const clean = (): SceneObject[] => [
  o('home/counter-room/1', 'part', [12.45, 1.2, 11.65], [13.35, 2, 11.85], { name: 'screen-small' }),
  o('home/screen-tiny-patch-mostly-empty', 'work', [12.5, 1.45, 11.79], [13.3, 1.95, 11.83], { at: 'home/counter-room/1/0', slot: 'screen' }),
  o('home/counter-room/2', 'part', [12.88, 0, 16.65], [13.38, 1.1, 16.95], { name: 'plaque-stand' }),
  o('home/brainfuck-extensions-skateboard', 'exhibit', [12.9, 0.9, 16.8], [13.3, 1.2, 16.9], { at: 'home/counter-room/2/0' }),
]

describe('exhibits stand on their parts, and nothing with a foot stands in mid-air (look review of #412; audit QW.2)', () => {
  it('find nothing when every exhibit touches its part and no part is in the air', () => {
    expect(standingFindings('test', clean())).toEqual([])
  })

  it('planted: a screen exhibit drawn 0.6 m above its screen is a major look finding', () => {
    const lifted = clean().map((x) => (x.id === 'home/screen-tiny-patch-mostly-empty' ? { ...x, box: { min: [12.5, 2.6, 11.79] as [number, number, number], max: [13.3, 3.1, 11.83] as [number, number, number] } } : x))
    const found = standingFindings('test', lifted)
    expect(found.map((f) => f.fingerprint)).toEqual(['world.exhibit-off-part|test|home/screen-tiny-patch-mostly-empty'])
    expect(found[0]).toMatchObject({ severity: 'major', fixKind: 'look', where: 'places/home.json' })
    expect(found[0]!.what).toContain('home/counter-room/1')
  })

  it('planted: a card drawn a metre beside its plaque stand is a finding too', () => {
    const beside = clean().map((x) => (x.id === 'home/brainfuck-extensions-skateboard' ? { ...x, box: { min: [11.9, 0.9, 16.8] as [number, number, number], max: [12.3, 1.2, 16.9] as [number, number, number] } } : x))
    expect(standingFindings('test', beside).map((f) => f.fingerprint)).toEqual(['world.exhibit-off-part|test|home/brainfuck-extensions-skateboard'])
  })

  it('planted: a screen with its stand in mid-air (the scene marks it inAir) is a major look finding', () => {
    const air = clean().map((x) => (x.id === 'home/counter-room/1' ? { ...x, inAir: true as const } : x))
    const found = standingFindings('test', air)
    expect(found.map((f) => f.fingerprint)).toEqual(['world.part-in-air|test|home/counter-room/1'])
    expect(found[0]!.what).toContain('1.20 m up')
  })

  it('leaves alone what is not drawn now', () => {
    const hidden = clean().map((x) => (x.id === 'home/counter-room/1' ? { ...x, inAir: true as const, visible: false } : x))
    expect(standingFindings('test', hidden)).toEqual([])
  })
})
