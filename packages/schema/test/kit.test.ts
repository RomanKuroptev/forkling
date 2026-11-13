import { describe, expect, it } from 'vitest'
import { Kit, KitPart, PALETTE_SLOTS, SLOT_ACCEPTS, SlotKind } from '../src/kit.ts'
import { kit } from '../src/kit-data.ts'

const box = { shape: 'box', size: [1, 1, 1], at: [0, 0.5, 0], color: 'wall' }
const part = { id: 'crate', name: 'Crate', category: 'furniture', size: [1, 1, 1], primitives: [box], slots: [] }

describe('the kit data (spec 5.3: about 60 parts, 5 exterior styles, 8 palettes)', () => {
  it('has about 60 parts, with unique ids, in all five categories', () => {
    expect(kit.parts.length).toBeGreaterThanOrEqual(56)
    expect(kit.parts.length).toBeLessThanOrEqual(64)
    expect(new Set(kit.parts.map((p) => p.id)).size).toBe(kit.parts.length)
    for (const category of ['structure', 'furniture', 'display', 'light', 'nature']) {
      expect(kit.parts.filter((p) => p.category === category).length, category).toBeGreaterThanOrEqual(5)
    }
  })

  it('has the five exterior styles, each made of wall, window, door and roof parts that exist and are structure', () => {
    expect(kit.styles.map((s) => s.id).sort()).toEqual(['glass', 'stone', 'timber', 'tin-shack', 'tower'])
    const byId = new Map(kit.parts.map((p) => [p.id, p]))
    for (const style of kit.styles) {
      for (const role of ['wall', 'window', 'door', 'roof'] as const) {
        expect(byId.get(style[role])?.category, `${style.id} ${role}`).toBe('structure')
      }
    }
  })

  it('has 8 named palettes, each colouring every palette slot', () => {
    expect(kit.palettes).toHaveLength(8)
    expect(new Set(kit.palettes.map((p) => p.id)).size).toBe(8)
    for (const palette of kit.palettes) expect(Object.keys(palette.colors).sort()).toEqual([...PALETTE_SLOTS].sort())
  })

  it('keeps every part to 24 primitives, with each primitive centred inside the part\'s own box', () => {
    for (const p of kit.parts) {
      expect(p.primitives.length, p.id).toBeLessThanOrEqual(24)
      const [w, h, d] = p.size
      for (const prim of p.primitives) {
        expect(Math.abs(prim.at[0]), `${p.id} x`).toBeLessThanOrEqual(w / 2 + 1e-6)
        expect(prim.at[1], `${p.id} y`).toBeGreaterThanOrEqual(-1e-6)
        expect(prim.at[1], `${p.id} y`).toBeLessThanOrEqual(h + 1e-6)
        expect(Math.abs(prim.at[2]), `${p.id} z`).toBeLessThanOrEqual(d / 2 + 1e-6)
      }
    }
  })

  it('gives the display parts the slots spec 5.3 describes, and no other part a slot except shelves', () => {
    const count = (p: KitPart, kind: string) => p.slots.filter((s) => s.kind === kind).length
    for (const p of kit.parts) {
      if (p.id.startsWith('frame-')) expect(p.slots.map((s) => s.kind), p.id).toEqual(['frame'])
      if (p.id.startsWith('screen-')) expect(p.slots.map((s) => s.kind), p.id).toEqual(['screen'])
      if (p.id === 'terminal') expect(p.slots.map((s) => s.kind)).toEqual(['terminal'])
      if (p.id === 'plaque-stand') expect(p.slots.map((s) => s.kind)).toEqual(['plaque'])
      if (p.id.startsWith('case-')) expect(p.slots.map((s) => s.kind), p.id).toEqual(['case'])
      if (p.id.startsWith('shelf-')) expect(count(p, 'shelf'), p.id).toBe(3)
      if (p.slots.length > 0) {
        const [w, h, d] = p.size
        for (const s of p.slots) {
          expect(Math.abs(s.at[0]), `${p.id} slot x`).toBeLessThanOrEqual(w / 2 + 1e-6)
          expect(s.at[1], `${p.id} slot y`).toBeLessThanOrEqual(h + 1e-6)
          expect(Math.abs(s.at[2]), `${p.id} slot z`).toBeLessThanOrEqual(d / 2 + 0.2)
        }
      }
    }
    const withSlots = kit.parts.filter((p) => p.slots.length > 0).map((p) => p.id)
    expect(withSlots.every((id) => /^(frame|screen|case|shelf)-|^terminal$|^plaque-stand$/.test(id))).toBe(true)
  })

  it('has what Home and the Workshop need: a desk, a workbench, screens, a terminal, lamps and a way up', () => {
    const ids = new Set(kit.parts.map((p) => p.id))
    for (const id of ['desk', 'workbench', 'screen-small', 'screen-large', 'terminal', 'lamp-floor', 'lamp-desk', 'door-wood', 'stairs', 'shelf-low', 'shelf-tall']) expect(ids.has(id), id).toBe(true)
  })
})

describe('what each slot takes (spec 5.3)', () => {
  it('lists, for every slot kind, the exhibit kinds it accepts', () => {
    expect(Object.keys(SLOT_ACCEPTS).sort()).toEqual([...SlotKind.options].sort())
    expect(SLOT_ACCEPTS.frame).toEqual({ exhibits: ['souvenir', 'trail'], souvenirs: ['image'] })
    expect(SLOT_ACCEPTS.screen).toEqual({ exhibits: ['work'] })
    expect(SLOT_ACCEPTS.terminal).toEqual({ exhibits: ['gallery'] })
    expect(SLOT_ACCEPTS.plaque).toEqual({ exhibits: ['plaque', 'souvenir'], souvenirs: ['quote'] })
    expect(SLOT_ACCEPTS.shelf).toEqual({ exhibits: ['souvenir'], souvenirs: ['image', 'quote', 'fact'] })
    expect(SLOT_ACCEPTS.case).toEqual({ exhibits: ['souvenir'], souvenirs: ['image', 'quote', 'fact'] })
  })
})

describe('the kit schema', () => {
  it('rejects a part with more than 24 primitives, none, or a primitive that is not a plain shape', () => {
    expect(KitPart.safeParse({ ...part, primitives: Array.from({ length: 25 }, () => box) }).success).toBe(false)
    expect(KitPart.safeParse({ ...part, primitives: [] }).success).toBe(false)
    expect(KitPart.safeParse({ ...part, primitives: [{ ...box, shape: 'mesh' }] }).success).toBe(false)
    expect(KitPart.safeParse(part).success).toBe(true)
  })

  it('takes a colour as a palette slot or a fixed hex, and nothing else', () => {
    expect(KitPart.safeParse({ ...part, primitives: [{ ...box, color: '#228833' }] }).success).toBe(true)
    expect(KitPart.safeParse({ ...part, primitives: [{ ...box, color: 'green' }] }).success).toBe(false)
  })

  it('rejects an unknown category or slot kind, a part with more than 3 slots, and an id that is not a slug', () => {
    expect(KitPart.safeParse({ ...part, category: 'weapons' }).success).toBe(false)
    expect(KitPart.safeParse({ ...part, slots: [{ kind: 'portal', at: [0, 0, 0] }] }).success).toBe(false)
    expect(KitPart.safeParse({ ...part, slots: Array.from({ length: 4 }, () => ({ kind: 'shelf', at: [0, 0.5, 0] })) }).success).toBe(false)
    expect(KitPart.safeParse({ ...part, id: 'Not A Slug' }).success).toBe(false)
  })

  it('rejects a kit with a duplicate part id, or a style that names a part the kit does not have', () => {
    const palette = Object.fromEntries(PALETTE_SLOTS.map((s) => [s, '#aabbcc']))
    const base = { parts: [part], styles: [], palettes: [{ id: 'plain', name: 'Plain', colors: palette }] }
    expect(Kit.safeParse(base).success).toBe(true)
    expect(Kit.safeParse({ ...base, parts: [part, part] }).success).toBe(false)
    expect(Kit.safeParse({ ...base, styles: [{ id: 'hut', name: 'Hut', wall: 'nope', window: 'crate', door: 'crate', roof: 'crate' }] }).success).toBe(false)
  })
})

describe("a part's model (spec 5.3: a part may be a CC0 model file, and always has its primitives as the fallback)", () => {
  it('names a .glb file in kit/models and a scale', () => {
    expect(KitPart.safeParse({ ...part, model: { file: 'tree_default.glb', scale: 2 } }).success).toBe(true)
  })
  it('refuses a path, another kind of file, or a scale that is not positive', () => {
    expect(KitPart.safeParse({ ...part, model: { file: '../secret.glb', scale: 1 } }).success).toBe(false)
    expect(KitPart.safeParse({ ...part, model: { file: 'sub/tree.glb', scale: 1 } }).success).toBe(false)
    expect(KitPart.safeParse({ ...part, model: { file: 'tree.obj', scale: 1 } }).success).toBe(false)
    expect(KitPart.safeParse({ ...part, model: { file: 'tree.glb', scale: 0 } }).success).toBe(false)
    expect(KitPart.safeParse({ ...part, model: { file: 'tree.glb', scale: 1, extra: true } }).success).toBe(false)
  })
  it('is optional: most parts are only primitives', () => {
    expect(kit.parts.some((p) => p.model === undefined)).toBe(true)
  })
})
