import { z } from 'zod'
import { Vec3 } from './geometry.ts'

/**
 * The kit (spec 5.3): the parts a place is built from, the exterior styles and the palettes. It lives in the engine at
 * `kit/parts.json` and is shared by every forkling. A place file only names parts, styles and palettes; Merge never writes 3D.
 *
 * Units are meters. A part's origin is the middle of its floor footprint (x and z centred, y up from 0), and `size` is its box.
 */

/** The colours a palette sets. A primitive names one of these, so a palette recolours a whole place. */
export const PALETTE_SLOTS = ['wall', 'trim', 'roof', 'floor', 'accent', 'wood', 'metal', 'glow'] as const
export const PaletteSlot = z.enum(PALETTE_SLOTS)
export type PaletteSlot = z.infer<typeof PaletteSlot>

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'like #a67c52')
/** A palette slot, or a fixed colour for things that never change (leaves, glass). */
export const KitColor = z.union([PaletteSlot, Hex])
export type KitColor = z.infer<typeof KitColor>

/** A part is made of up to 24 of these plain shapes (spec 5.3), the same shapes a forkling's own objects used. */
export const MAX_PRIMITIVES = 24
export const KitPrimitive = z
  .object({
    shape: z.enum(['box', 'sphere', 'cylinder', 'cone']),
    size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
    at: Vec3,
    rotation: Vec3.optional(),
    color: KitColor,
  })
  .strict()
export type KitPrimitive = z.infer<typeof KitPrimitive>

export const PartCategory = z.enum(['structure', 'furniture', 'display', 'light', 'nature'])
export type PartCategory = z.infer<typeof PartCategory>

/** What can be put in a slot (spec 5.3). A `terminal` opens the gallery of every work; a shelf has three slots, one small souvenir each. */
export const SlotKind = z.enum(['frame', 'screen', 'terminal', 'plaque', 'shelf', 'case'])
export type SlotKind = z.infer<typeof SlotKind>

export const ExhibitKind = z.enum(['souvenir', 'work', 'plaque', 'trail', 'gallery'])
export type ExhibitKind = z.infer<typeof ExhibitKind>

export const SouvenirKindName = z.enum(['quote', 'fact', 'image'])
export type SouvenirKindName = z.infer<typeof SouvenirKindName>

/** Which exhibits each slot takes, and which kinds of souvenir where it takes souvenirs. */
export const SLOT_ACCEPTS: Record<SlotKind, { exhibits: ExhibitKind[]; souvenirs?: SouvenirKindName[] }> = {
  frame: { exhibits: ['souvenir', 'trail'], souvenirs: ['image'] },
  screen: { exhibits: ['work'] },
  terminal: { exhibits: ['gallery'] },
  plaque: { exhibits: ['plaque', 'souvenir'], souvenirs: ['quote'] },
  shelf: { exhibits: ['souvenir'], souvenirs: ['image', 'quote', 'fact'] },
  case: { exhibits: ['souvenir'], souvenirs: ['image', 'quote', 'fact'] },
}

export const PartId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, 'lowercase words with dashes')

/** Where an exhibit sits on a part, relative to the part's origin. */
export const KitSlot = z.object({ kind: SlotKind, at: Vec3 }).strict()
export type KitSlot = z.infer<typeof KitSlot>

export const KitPart = z
  .object({
    id: PartId,
    name: z.string().min(1).max(40),
    category: PartCategory,
    size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
    primitives: z.array(KitPrimitive).min(1).max(MAX_PRIMITIVES),
    slots: z.array(KitSlot).max(3).default([]),
  })
  .strict()
export type KitPart = z.infer<typeof KitPart>

/** An exterior style: which structure parts make the walls, windows, door and roof of a place. */
export const KitStyle = z
  .object({ id: PartId, name: z.string().min(1).max(40), wall: PartId, window: PartId, door: PartId, roof: PartId })
  .strict()
export type KitStyle = z.infer<typeof KitStyle>

/** A named colour set. Merge picks a style and a palette, never free colours (spec 5.3). */
export const KitPalette = z
  .object({
    id: PartId,
    name: z.string().min(1).max(40),
    colors: z.object(Object.fromEntries(PALETTE_SLOTS.map((slot) => [slot, Hex])) as Record<PaletteSlot, typeof Hex>).strict(),
  })
  .strict()
export type KitPalette = z.infer<typeof KitPalette>

export const Kit = z
  .object({ parts: z.array(KitPart).min(1), styles: z.array(KitStyle), palettes: z.array(KitPalette).min(1) })
  .strict()
  .superRefine((kit, ctx) => {
    const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i)
    for (const [what, ids] of [
      ['part', kit.parts.map((p) => p.id)],
      ['style', kit.styles.map((s) => s.id)],
      ['palette', kit.palettes.map((p) => p.id)],
    ] as const) {
      for (const id of dupes([...ids])) ctx.addIssue({ code: 'custom', message: `two ${what}s have the id "${id}"` })
    }
    const category = new Map(kit.parts.map((p) => [p.id, p.category]))
    for (const style of kit.styles) {
      for (const role of ['wall', 'window', 'door', 'roof'] as const) {
        const id = style[role]
        if (!category.has(id)) ctx.addIssue({ code: 'custom', message: `style "${style.id}" names the ${role} part "${id}", which the kit does not have` })
        else if (category.get(id) !== 'structure') ctx.addIssue({ code: 'custom', message: `style "${style.id}" ${role} part "${id}" must be a structure part` })
      }
    }
  })
export type Kit = z.infer<typeof Kit>
