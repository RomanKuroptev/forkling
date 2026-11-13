import { z } from 'zod'
import { Vec3 } from './geometry.ts'
import { Exhibit, PlaceId, PlacedPart, Room } from './place.ts'
import { PartId } from './kit.ts'

/**
 * What a model may ask to change in a place (spec 5.4). Each verb has its own shape, and every shape is strict, so a tend
 * cannot carry a part and a revisit cannot carry anything. The counts and limits (3 exhibit changes, 2 labels, 15 parts) are checked
 * by `validatePlacePatch` in `packages/sim`, with a reason Merge can read. Code adds the dates; the model never writes them.
 */
const Summary = z.string().min(1).max(1000)

/** An exhibit as a model proposes it. Code sets `added`. */
export const PatchExhibit = Exhibit.omit({ added: true })
export type PatchExhibit = z.infer<typeof PatchExhibit>

export const ExhibitOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), exhibit: PatchExhibit }).strict(),
  z.object({ op: z.literal('move'), id: PartId, slot: z.string().max(120) }).strict(),
  z.object({ op: z.literal('remove'), id: PartId }).strict(),
])
export type ExhibitOp = z.infer<typeof ExhibitOp>

export const TendPatch = z
  .object({
    verb: z.literal('tend'),
    exhibits: z.array(ExhibitOp).max(10).default([]),
    labels: z.array(z.object({ id: PartId, label: z.string().max(1000) }).strict()).max(10).default([]),
    sign: z.string().max(200).optional(),
    lamps: z.boolean().optional(),
    summary: Summary,
  })
  .strict()

export const RevisitPatch = z.object({ verb: z.literal('revisit'), summary: Summary }).strict()

export const ExpandChange = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('room'), room: Room }).strict(),
  z
    .object({
      kind: z.literal('enlarge'),
      roomId: PartId,
      size: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
      at: z.tuple([z.number().finite(), z.number().finite()]).optional(),
      /** Parts that move because the room grew. */
      moves: z.array(z.object({ index: z.number().int().min(0), at: Vec3 }).strict()).max(60).default([]),
      addParts: z.array(PlacedPart).max(60).default([]),
    })
    .strict(),
  z.object({ kind: z.literal('path'), to: PlaceId }).strict(),
])
export type ExpandChange = z.infer<typeof ExpandChange>

export const ExpandPatch = z.object({ verb: z.literal('expand'), change: ExpandChange, summary: Summary }).strict()
export type ExpandPatch = z.infer<typeof ExpandPatch>

export const RenamePatch = z.object({ verb: z.literal('rename'), name: z.string().max(200), summary: Summary }).strict()

export const PlacePatch = z.discriminatedUnion('verb', [TendPatch, RevisitPatch, ExpandPatch, RenamePatch])
export type PlacePatch = z.infer<typeof PlacePatch>
