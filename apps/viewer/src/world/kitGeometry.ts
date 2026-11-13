import type { Kit, KitColor, KitPalette, KitPart, Place } from '@forkling/schema'
import { DOOR_HALF, WALL, chunkAt, neglectFor, placeCentre, toLandPlace } from '@forkling/sim'
import { constructionInstances } from './constructionGeometry.ts'
import { exhibitInstances, exhibitSpots, neglectInstances, neglectLook, signSpot } from './exhibitGeometry.ts'
import { SHAPES, floorHeight, type Instance, type Shape } from './kitBase.ts'
import { compose, multiply, type Mat4 } from './matrix.ts'

export { SHAPES, floorHeight, type Instance, type Shape }

/**
 * A world of places as shapes (spec 5.3, 4.6), worked out in plain arrays so it can be tested without a renderer. Every part is a
 * handful of boxes, spheres, cylinders and cones; the whole world is drawn as one instanced mesh per shape, each instance with its
 * own matrix and colour, so the number of draw calls does not grow with the number of places.
 */

/** Segments of the unit shapes the components draw. The triangle counts below follow from these, and the budget from them. */
export const SPHERE_SEGMENTS = [8, 6] as const
export const ROUND_SEGMENTS = 10
export const SHAPE_TRIANGLES: Record<Shape, number> = {
  box: 12,
  sphere: SPHERE_SEGMENTS[0] * SPHERE_SEGMENTS[1] * 2 - 2 * SPHERE_SEGMENTS[0],
  cylinder: ROUND_SEGMENTS * 2 + ROUND_SEGMENTS * 2,
  cone: ROUND_SEGMENTS + ROUND_SEGMENTS,
}

/**
 * The most a model file may cost: meshes (a draw call each) and triangles. `apps/mind/test/kit-models.test.ts` holds every file in
 * `kit/models` to this, so the render budget below can count a model at the limit without opening it.
 */
export const MODEL_LIMITS = { meshes: 2, triangles: 2000 } as const

/** The model files the kit's parts use, once each, in name order: what the viewer loads. */
export const modelFiles = (kit: Kit): string[] => [...new Set(kit.parts.flatMap((p) => (p.model ? [p.model.file] : [])))].sort()

export function resolveColor(color: KitColor, palette: KitPalette): string {
  return color.startsWith('#') ? color : palette.colors[color as keyof KitPalette['colors']]
}

/**
 * One instance for each primitive of a part, standing at `at` (the middle of its floor footprint), turned `rotY` about y, and
 * stretched by `scale` in its own axes (so a wall fits a stretch of footprint and a roof fits a building).
 */
export function partInstances(part: KitPart, at: readonly [number, number, number], rotY: number, palette: KitPalette, scale: readonly [number, number, number] = [1, 1, 1]): Instance[] {
  const base = multiply(compose(at, [0, rotY, 0], [1, 1, 1]), compose([0, 0, 0], [0, 0, 0], scale))
  return part.primitives.map((p) => ({
    shape: p.shape,
    matrix: multiply(base, compose(p.at, p.rotation ?? [0, 0, 0], p.size)),
    color: resolveColor(p.color, palette),
  }))
}

/** How far inside the footprint's edge a wall's middle stands, so it lies within the 0.8 m the body cannot walk on. */
const INSET = 0.4
const DOOR_WIDTH = 2
const DOOR_HEIGHT = 2.2

function look(place: Place, kit: Kit) {
  const style = kit.styles.find((s) => s.id === place.exterior.style) ?? kit.styles[0]!
  const palette = kit.palettes.find((p) => p.id === place.exterior.palette) ?? kit.palettes[0]!
  const part = (id: string) => kit.parts.find((p) => p.id === id)!
  return { style, palette, wall: part(style.wall), window: part(style.window), door: part(style.door), roof: part(style.roof) }
}

/** The outside of a place: walls with windows on every floor, a door in the front (+z) wall, a roof, as its style and palette say. */
export function exteriorInstances(place: Place, kit: Kit, baseY: number): Instance[] {
  const { palette, wall, window, door, roof } = look(place, kit)
  const [px, pz] = placeCentre(toLandPlace(place))
  const [fw, fd] = place.exterior.footprint
  const height = floorHeight(place)
  const floors = place.exterior.floors
  const out: Instance[] = []
  const wallW = wall.size[0]
  const sy = height / wall.size[1]

  /** A line of wall from `a` to `b` (along x, or along z when `alongZ`), cut into equal tiles, each with a window. */
  const line = (a: number, b: number, fixed: number, alongZ: boolean, y: number) => {
    const length = b - a
    if (length < 0.5) return
    const n = Math.max(1, Math.round(length / wallW))
    const tile = length / n
    for (let k = 0; k < n; k++) {
      const c = a + tile * (k + 0.5)
      const at: [number, number, number] = alongZ ? [fixed, y, c] : [c, y, fixed]
      const rot = alongZ ? Math.PI / 2 : 0
      out.push(...partInstances(wall, at, rot, palette, [tile / wallW, sy, 1]))
      if (tile >= window.size[0] + 0.4) out.push(...partInstances(window, [at[0], y + 1.0, at[2]], rot, palette))
    }
  }

  for (let f = 0; f < floors; f++) {
    const y = baseY + f * height
    line(px - fw / 2, px + fw / 2, pz - fd / 2 + INSET, false, y)
    line(pz - fd / 2, pz + fd / 2, px - fw / 2 + INSET, true, y)
    line(pz - fd / 2, pz + fd / 2, px + fw / 2 - INSET, true, y)
    const frontZ = pz + fd / 2 - INSET
    if (f === 0) {
      // The door is in the middle of the front wall on the ground floor, as wide a gap as the body's own world leaves.
      line(px - fw / 2, px - DOOR_HALF, frontZ, false, y)
      line(px + DOOR_HALF, px + fw / 2, frontZ, false, y)
      out.push(...partInstances(door, [px, y, frontZ], 0, palette, [DOOR_WIDTH / door.size[0], DOOR_HEIGHT / door.size[1], 1.5]))
      const lintel = height - DOOR_HEIGHT
      if (lintel > 0.05) out.push({ shape: 'box', matrix: compose([px, y + DOOR_HEIGHT + lintel / 2, frontZ], [0, 0, 0], [DOOR_HALF * 2, lintel, 0.3]), color: palette.colors.wall })
    } else {
      line(px - fw / 2, px + fw / 2, frontZ, false, y)
    }
  }

  // The roof, a little wider than the walls.
  out.push(...partInstances(roof, [px, baseY + floors * height, pz], 0, palette, [(fw + 1.2) / roof.size[0], 1, (fd + 1.2) / roof.size[2]]))
  // The sign by the door, where the place's history is opened from (spec 4.6).
  const sign = kit.parts.find((p) => p.id === 'sign-post')
  if (sign) out.push(...partInstances(sign, signSpot(place, baseY).position, 0, palette))
  return out
}

/** A part drawn from its model file instead of its primitives. */
export interface ModelInstance {
  file: string
  matrix: Mat4
}

/**
 * The inside: a floor for each floor of the building, and every room's furniture where the place file put it. A part with a model
 * is a model instance once its file is in `models` (it has loaded), and its primitives until then, or for good if it never loads.
 */
export function interiorParts(place: Place, kit: Kit, baseY: number, models: ReadonlySet<string> = new Set(), opts: { lampsOn?: boolean } = {}): { instances: Instance[]; models: ModelInstance[] } {
  const { palette } = look(place, kit)
  // Lamps that are off are dark: the glow of their palette is replaced by a dull grey.
  const dark: KitPalette = { ...palette, colors: { ...palette.colors, glow: '#4a4a4a' } }
  const [px, pz] = placeCentre(toLandPlace(place))
  const [fw, fd] = place.exterior.footprint
  const height = floorHeight(place)
  const out: Instance[] = []
  const modelOut: ModelInstance[] = []
  for (let f = 0; f < place.exterior.floors; f++) {
    out.push({ shape: 'box', matrix: compose([px, baseY + f * height + 0.06, pz], [0, 0, 0], [fw - 1, 0.12, fd - 1]), color: palette.colors.floor })
  }
  for (const room of place.rooms) {
    for (const placed of room.parts) {
      const part = kit.parts.find((p) => p.id === placed.part)
      if (!part) continue
      const at: [number, number, number] = [px + room.at[0] + placed.at[0], baseY + room.floor * height + placed.at[1], pz + room.at[1] + placed.at[2]]
      if (part.model && models.has(part.model.file)) {
        const s = part.model.scale
        modelOut.push({ file: part.model.file, matrix: compose(at, [0, placed.rot, 0], [s, s, s]) })
      } else {
        out.push(...partInstances(part, at, placed.rot, part.category === 'light' && opts.lampsOn === false ? dark : palette))
      }
    }
  }
  return { instances: out, models: modelOut }
}

/** The inside as primitives only. */
export const interiorInstances = (place: Place, kit: Kit, baseY: number): Instance[] => interiorParts(place, kit, baseY).instances

/** A wall the visitor cannot walk through, as an axis-aligned box from the ground up. */
export interface WallBox {
  x0: number
  x1: number
  z0: number
  z1: number
  height: number
}

/** The walls of a place for the visitor's physics: the same 0.8 m ring, and the same door gap, as the body's world (`buildBodyWorld`). */
export function wallBoxes(place: Place): WallBox[] {
  const [px, pz] = placeCentre(toLandPlace(place))
  const [fw, fd] = place.exterior.footprint
  const x0 = px - fw / 2
  const x1 = px + fw / 2
  const z0 = pz - fd / 2
  const z1 = pz + fd / 2
  const height = floorHeight(place) * place.exterior.floors
  return [
    { x0, x1, z0, z1: z0 + WALL, height },
    { x0, x1: x0 + WALL, z0, z1, height },
    { x0: x1 - WALL, x1, z0, z1, height },
    { x0, x1: px - DOOR_HALF, z0: z1 - WALL, z1, height },
    { x0: px + DOOR_HALF, x1, z0: z1 - WALL, z1, height },
  ]
}

/** The places whose insides are drawn: those in the visitor's chunk and the chunks around it (spec 4.6). Nobody looking, none. */
export function interiorsToLoad(places: readonly Place[], visitor: { x: number; z: number } | null): Set<string> {
  if (!visitor) return new Set()
  const [cx, cz] = chunkAt(visitor.x, visitor.z)
  return new Set(places.filter((p) => Math.abs(p.chunk[0] - cx) <= 1 && Math.abs(p.chunk[1] - cz) <= 1).map((p) => p.id))
}

export interface ShapeInstances {
  matrices: Float32Array
  /** Linear RGB, three floats each, as an instanced mesh keeps them. */
  colors: Float32Array
  count: number
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)]
}

export type SceneInstances = Record<Shape, ShapeInstances> & {
  /** For each model file, the matrices of its instances (16 numbers each). */
  models: Record<string, Float32Array>
}

/**
 * Every place's shapes, grouped by shape: its outside always (with scaffolding while it is being built), its inside only when `interiors` has it. Each stands on the ground
 * under it. `models` are the model files that have loaded: a part that has one is drawn from it, the others from their primitives.
 */
export function sceneInstances(places: readonly Place[], kit: Kit, opts: { heightAt: (x: number, z: number) => number; interiors: ReadonlySet<string>; models?: ReadonlySet<string>; nowMs?: number }): SceneInstances {
  const lists: Record<Shape, Instance[]> = { box: [], sphere: [], cylinder: [], cone: [] }
  const modelLists: Record<string, Mat4[]> = {}
  for (const place of places) {
    const [px, pz] = placeCentre(toLandPlace(place))
    const baseY = opts.heightAt(px, pz)
    // How long since it was cared for sets how it looks (spec 4.4). Without a clock, nothing is neglected.
    const level = opts.nowMs === undefined ? 0 : neglectFor({ id: place.id, lastCareAt: place.state.lastCareAt, founded: place.founded }, opts.nowMs)
    const lampsOn = neglectLook(level, place.state.lamps).lampsOn
    for (const i of exteriorInstances(place, kit, baseY)) lists[i.shape].push(i)
    for (const i of neglectInstances(place, kit, baseY, level, 'exterior')) lists[i.shape].push(i)
    // A place that is being built is wrapped in scaffolding until its finish time (spec 4.5).
    for (const i of constructionInstances(place, baseY, opts.nowMs)) lists[i.shape].push(i)
    if (opts.interiors.has(place.id)) {
      const inside = interiorParts(place, kit, baseY, opts.models, { lampsOn })
      for (const i of inside.instances) lists[i.shape].push(i)
      for (const m of inside.models) (modelLists[m.file] ??= []).push(m.matrix)
      const { palette } = look(place, kit)
      for (const spot of exhibitSpots(place, kit, baseY)) for (const i of exhibitInstances(spot, palette.colors)) lists[i.shape].push(i)
      for (const i of neglectInstances(place, kit, baseY, level, 'interior')) lists[i.shape].push(i)
    }
  }
  const models: Record<string, Float32Array> = {}
  for (const [file, list] of Object.entries(modelLists)) {
    const packed = new Float32Array(list.length * 16)
    list.forEach((m, k) => packed.set(m, k * 16))
    models[file] = packed
  }
  const pack = (list: Instance[]): ShapeInstances => {
    const matrices = new Float32Array(list.length * 16)
    const colors = new Float32Array(list.length * 3)
    list.forEach((inst, k) => {
      matrices.set(inst.matrix, k * 16)
      colors.set(rgb(inst.color), k * 3)
    })
    return { matrices, colors, count: list.length }
  }
  return { box: pack(lists.box), sphere: pack(lists.sphere), cylinder: pack(lists.cylinder), cone: pack(lists.cone), models }
}

/** What drawing these costs: a draw call for each shape that has any and the triangles of every instance, and for each model file at most `MODEL_LIMITS`. */
export function renderBudget(scene: Record<Shape, ShapeInstances> & { models?: Record<string, Float32Array> }): { drawCalls: number; triangles: number } {
  let drawCalls = 0
  let triangles = 0
  for (const matrices of Object.values(scene.models ?? {})) {
    drawCalls += MODEL_LIMITS.meshes
    triangles += (matrices.length / 16) * MODEL_LIMITS.triangles
  }
  for (const shape of SHAPES) {
    if (scene[shape].count === 0) continue
    drawCalls++
    triangles += scene[shape].count * SHAPE_TRIANGLES[shape]
  }
  return { drawCalls, triangles }
}
