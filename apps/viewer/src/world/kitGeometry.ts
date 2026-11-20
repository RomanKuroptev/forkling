import type { Kit, KitColor, KitPalette, KitPart, Place, PlaceRequest } from '@forkling/schema'
import { DARK_GLOW, dayInteriorFloor, furnitureColour, furniturePalette, repaint } from './theme.ts'
import { DOOR_HALF, WALL, chunkAt, neglectFor, placeCentre, toLandPlace, type NeglectLevel } from '@forkling/sim'
import { buildingModel, partKey, windowLayout } from './building.ts'
import { constructionInstances } from './constructionGeometry.ts'
import { wireframeInstances } from './wireframe.ts'
import { plotInstances } from './plotGeometry.ts'
import { exhibitInstances, exhibitSpots, neglectInstances, neglectLook, signSpot } from './exhibitGeometry.ts'
import { galleryWalls, wallInstances, type GalleryWork } from './galleryWall.ts'
import { FLOOR_BELOW, FLOOR_INSET, FLOOR_TOP, SHAPES, floorHeight, type Instance, type Shape } from './kitBase.ts'
import { compose, multiply, type Mat4 } from './matrix.ts'
import { partInDoorway } from './doorway.ts'
import { hungParts, isFootPrimitive, onTallStand, screenStands, settledPlace } from './insideWalls.ts'

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
  return color.startsWith('#') ? repaint(color) : palette.colors[color as keyof KitPalette['colors']]
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
    // A window's glass is marked in the kit; a lamp's own glow colour lights the same way.
    glow: p.glow === true || p.color === 'glow',
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
export function exteriorInstances(place: Place, kit: Kit, baseY: number, heightAt?: (x: number, z: number) => number): Instance[] {
  // A style drawn by the building model (look.md) is its six slots and the sign by the door; the others keep the drawing below.
  const model = buildingModel(place, kit, baseY)
  if (model) return [...model.instances, ...signPostInstances(place, kit, baseY, heightAt)]
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
      // A window is as deep as its wall and a little more, so its glass shows on both faces (the walls are 0.1 to 0.4 m thick).
      if (tile >= window.size[0] + 0.4) out.push(...partInstances(window, [at[0], y + 1.0, at[2]], rot, palette, [1, 1, (wall.size[2] + 0.16) / window.size[2]]))
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
      // A closed place (spec 9.9) has its door boarded: planks nailed across the gap, a little crooked, in front of the door.
      if (place.state.closed) {
        const planks: [number, number][] = [[0.55, 0.05], [1.1, -0.06], [1.65, 0.04]]
        for (const [h, tilt] of planks) out.push({ shape: 'box', matrix: compose([px, y + h, frontZ + 0.22], [0, 0, tilt], [DOOR_HALF * 2 + 0.5, 0.26, 0.07]), color: palette.colors.wood })
      }
    } else {
      line(px - fw / 2, px + fw / 2, frontZ, false, y)
    }
  }

  // The roof, a little wider than the walls.
  out.push(...partInstances(roof, [px, baseY + floors * height, pz], 0, palette, [(fw + 1.2) / roof.size[0], 1, (fd + 1.2) / roof.size[2]]))
  out.push(...signPostInstances(place, kit, baseY, heightAt))
  return out
}

/**
 * The sign by the door, where the place's history is opened from (spec 4.6): its two posts on the ground, the board they carry and
 * its trim. A place being built keeps it solid too, so the site's sign stands on its posts and does not float over the wire (issue 427).
 * Where the ground falls away under the sign (`heightAt`), each post reaches down to the ground under it.
 */
export function signPostInstances(place: Place, kit: Kit, baseY: number, heightAt?: (x: number, z: number) => number): Instance[] {
  const post = kit.parts.find((p) => p.id === 'sign-post')
  if (!post) return []
  const palette = kit.palettes.find((p) => p.id === place.exterior.palette) ?? kit.palettes[0]!
  const pieces = partInstances(post, signSpot(place, baseY).position, 0, palette)
  if (!heightAt) return pieces
  return pieces.map((i) => {
    const m = i.matrix
    const h = Math.hypot(m[4]!, m[5]!, m[6]!)
    const bottom = m[13]! - h / 2
    // A post: upright, standing on the place's base. The board and its trim hang on the posts.
    if (h < 1 || Math.abs(m[5]!) < 0.99 * h || Math.abs(bottom - baseY) > 0.01) return i
    const ground = heightAt(m[12]!, m[14]!)
    if (ground >= bottom) return i
    const top = bottom + h
    const matrix = [...m]
    matrix[5] = top - ground
    matrix[13] = (top + ground) / 2
    return { ...i, matrix }
  })
}

/** A part drawn from its model file instead of its primitives. */
export interface ModelInstance {
  file: string
  matrix: Mat4
}

/**
 * The inside: a floor for each floor of the building, and every room's furniture where the place file put it, but for a part that
 * stands in the doorway (`doorway.ts`), which is not drawn. A part with a model
 * is a model instance once its file is in `models` (it has loaded), and its primitives until then, or for good if it never loads.
 */
export function interiorParts(place: Place, kit: Kit, baseY: number, models: ReadonlySet<string> = new Set(), opts: { lampsOn?: boolean } = {}): { instances: Instance[]; models: ModelInstance[] } {
  const stands = screenStands(place, kit)
  const hung = hungParts(place, kit)
  place = settledPlace(place, kit)
  const { palette } = look(place, kit)
  // Furniture, plinths, stands and lamps wear the palette's colours made pastel and kept off grey, beige and brown: under the roof a
  // pale wall colour or the metal reads as a grey box, and an orange or yellow accent as brown or khaki (issues 409, 430).
  const furnished = furniturePalette(palette)
  // Lamps that are off are dark: the glow of their palette is replaced by a dark glass.
  const dark: KitPalette = { ...furnished, colors: { ...furnished.colors, glow: DARK_GLOW } }
  const [px, pz] = placeCentre(toLandPlace(place))
  const [fw, fd] = place.exterior.footprint
  const height = floorHeight(place)
  const out: Instance[] = []
  const modelOut: ModelInstance[] = []
  for (let f = 0; f < place.exterior.floors; f++) {
    // A floor reaches 3 cm under its storey's line, so the feet of the furniture and the walls standing on that line are inside it, not
    // in the plane of its underside (issue 335), and its top is 2 cm over the building's 0.12 m slab, not in its plane (issues 350, 353).
    // It stops 1 cm short of the line where the walls' corner pieces end, for the same reason. By day it is a pastel of its own
    // (`dayInteriorFloor`), not the grey a pale floor turns under the roof.
    out.push({ shape: 'box', matrix: compose([px, baseY + f * height + (FLOOR_TOP - FLOOR_BELOW) / 2, pz], [0, 0, 0], [fw - 2 * FLOOR_INSET, FLOOR_TOP + FLOOR_BELOW, fd - 2 * FLOOR_INSET]), color: palette.colors.floor, dayColor: dayInteriorFloor(palette.colors) })
  }
  // A building drawn by the building model lines its walls inside in the room's own colour, and its windows stand where the rooms'
  // window parts are, which are then not drawn again (issues 358, 346).
  const model = buildingModel(place, kit, baseY)
  const consumed = model ? windowLayout(place).consumed : new Set<string>()
  if (model) out.push(...model.inside)
  for (const [r, room] of place.rooms.entries()) {
    for (const [index, placed] of room.parts.entries()) {
      if (consumed.has(partKey(r, index))) continue
      const part = kit.parts.find((p) => p.id === placed.part)
      if (!part) continue
      // Nothing stands in the doorway: the building draws the opening, and a frame or a door leaf there blocks it (issues 342, 345, 354).
      if (partInDoorway(place, kit, room, placed, baseY)) continue
      const at: [number, number, number] = [px + room.at[0] + placed.at[0], baseY + room.floor * height + placed.at[1], pz + room.at[1] + placed.at[2]]
      if (part.model && models.has(part.model.file)) {
        const s = part.model.scale
        modelOut.push({ file: part.model.file, matrix: compose(at, [0, placed.rot, 0], [s, s, s]) })
      } else {
        const off = part.category === 'light' && opts.lampsOn === false
        // A lamp that is off is dark: it does not glow either.
        const group = `${room.id}/${index}`
        // A part hung on a wall is drawn without its foot (`hungParts`); a screen raised on a tall stand, with it (`screenStands`).
        const lift = stands.get(group)
        const drawn = hung.has(group) ? { ...part, primitives: part.primitives.filter((p) => !isFootPrimitive(part, p)) } : lift !== undefined ? onTallStand(part, lift) : part
        const furniture = part.category !== 'structure' && part.category !== 'nature'
        const colours = off ? dark : furniture ? furnished : palette
        // By day a piece of furniture gives off some of its own colour, as the room's walls do (`dayColor`), so its pastel holds in the
        // shade of the roof instead of going grey or dusty (issue 430); at night it is lit by the lamps and the sky as before.
        for (const i of partInstances(drawn, at, placed.rot, colours)) {
          const day = furniture && !i.glow && i.color !== DARK_GLOW ? { dayColor: i.color } : {}
          out.push(off ? { ...i, glow: false, group, ...day } : { ...i, group, ...day })
        }
      }
    }
  }
  return { instances: out, models: modelOut }
}

/** How neglected a place looks at `nowMs` (spec 4.4) and whether its lamps are on. Without a clock, nothing is neglected. */
export function placeLight(place: Place, opts: { nowMs?: number; litAlways?: boolean }): { level: NeglectLevel; lampsOn: boolean } {
  const level = opts.nowMs === undefined || opts.litAlways ? 0 : neglectFor({ id: place.id, lastCareAt: place.state.lastCareAt, founded: place.founded, closed: place.state.closed !== null }, opts.nowMs)
  // A closed place (spec 9.9) has its lamps off, whatever its own switch says.
  const lampsOn = place.state.closed ? false : opts.litAlways ? true : neglectLook(level, place.state.lamps).lampsOn
  return { level, lampsOn }
}

/**
 * A glowing thing whose lamps are off: it does not glow, and its colour is the glow colour as furniture wears it, so a lemon or peach
 * screen or window does not read as a tan panel in shade (the front of Grown Place 6, issue 409); a cyan one stays cyan.
 */
export const unlit = (i: Instance, colors: KitPalette['colors']): Instance => (i.glow ? { ...i, glow: false, color: furnitureColour(i.color, colors) } : i)

/** The inside as primitives only. */
export const interiorInstances = (place: Place, kit: Kit, baseY: number): Instance[] => interiorParts(place, kit, baseY).instances

/** A lamp that is on, as a light: where its glowing part is. */
export interface LampSpot {
  position: [number, number, number]
}

/**
 * The lamps of a place that is lit (its lamps on): one spot for each light part in its rooms, at the middle of its glowing parts. The
 * viewer puts warm lights at the ones nearest the visitor, so a room at night has pools of lamp light (issue 361).
 */
export function lampSpots(place: Place, kit: Kit, baseY: number, lampsOn: boolean): LampSpot[] {
  place = settledPlace(place, kit)
  if (!lampsOn) return []
  const { palette } = look(place, kit)
  const [px, pz] = placeCentre(toLandPlace(place))
  const height = floorHeight(place)
  const out: LampSpot[] = []
  for (const room of place.rooms) {
    for (const placed of room.parts) {
      const part = kit.parts.find((p) => p.id === placed.part)
      if (!part || part.category !== 'light') continue
      const at: [number, number, number] = [px + room.at[0] + placed.at[0], baseY + room.floor * height + placed.at[1], pz + room.at[1] + placed.at[2]]
      const lit = partInstances(part, at, placed.rot, palette).filter((i) => i.glow)
      if (lit.length === 0) continue
      const mean = (k: number) => lit.reduce((n, i) => n + i.matrix[k]!, 0) / lit.length
      out.push({ position: [mean(12), mean(13), mean(14)] })
    }
  }
  return out
}

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
    // A boarded door (spec 9.9) cannot be walked through.
    ...(place.state.closed ? [{ x0: px - DOOR_HALF, x1: px + DOOR_HALF, z0: z1 - WALL, z1, height }] : []),
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
  /** 1 for an instance that lights up at night (a window's glass, a lamp that is on), else 0. */
  glow: Float32Array
  /** 1 for lit trim (an accent band, a title bar, a window frame), which glows a little at night, else 0. */
  trim: Float32Array
  /** 1 for the inside of a place, which gets less of the sky's light, else 0. */
  inside: Float32Array
  /** The colour by day (`Instance.dayColor`), linear RGB and 1, four floats each; all 0 for an instance with none. */
  day: Float32Array
  count: number
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)]
}

export type SceneInstances = Record<Shape, ShapeInstances> & {
  /** The see-through glass boxes, one more draw call. */
  glassBox: ShapeInstances
  /** For each model file, the matrices of its instances (16 numbers each). */
  models: Record<string, Float32Array>
  /** The lamps that are on in the insides drawn (`lampSpots`). */
  lamps: LampSpot[]
}

/** The inside of a place being built, to be drawn as lines: its floor, furniture and lamps, and the pieces of its exhibits (issues 329, 426). */
export function siteInside(place: Place, kit: Kit, baseY: number): Instance[] {
  const { palette } = look(place, kit)
  return [...interiorParts(place, kit, baseY).instances, ...exhibitSpots(place, kit, baseY).flatMap((spot) => exhibitInstances(spot, palette.colors))]
}

/**
 * Every place's shapes, grouped by shape: its outside always (with scaffolding while it is being built), its inside only when `interiors` has it. Each stands on the ground
 * under it. `models` are the model files that have loaded: a part that has one is drawn from it, the others from their primitives.
 */
export function sceneInstances(places: readonly Place[], kit: Kit, opts: { heightAt: (x: number, z: number) => number; interiors: ReadonlySet<string>; models?: ReadonlySet<string>; nowMs?: number; plots?: readonly PlaceRequest[]; litAlways?: boolean; wireAlways?: boolean; shelf?: readonly GalleryWork[] }): SceneInstances {
  const lists: Record<Shape, Instance[]> = { box: [], sphere: [], cylinder: [], cone: [] }
  const glassList: Instance[] = []
  const modelLists: Record<string, Mat4[]> = {}
  const lamps: LampSpot[] = []
  for (const place of places) {
    const [px, pz] = placeCentre(toLandPlace(place))
    const baseY = opts.heightAt(px, pz)
    const { level, lampsOn } = placeLight(place, opts)
    // A place whose lamps are on (or that is cared for, spec 4.4) has lit windows; one with its lamps off, or neglected, is dark.
    // A place that is being built is its finished model as cyan wireframe until its finish time (spec 4.5); a style the building model
    // does not draw keeps the scaffolding.
    // Its inside, when it is drawn, is lines too: the floor, the furniture and the lamps (issue 329), from their plain shapes.
    // So are the exhibits Merge keeps there (issue 426): their pieces are lines, and their cards are drawn as wire (`ExhibitCards`).
    const wireInside = opts.interiors.has(place.id) ? siteInside(place, kit, baseY) : []
    const wire = wireframeInstances(place, kit, baseY, opts.nowMs, opts.wireAlways, wireInside)
    const wired = wire !== null && wire.length > 0
    if (wired) {
      for (const i of wire) lists[i.shape].push(i)
      // The sign stays solid and stands on its posts, as the finished place's does (issue 427).
      for (const i of signPostInstances(place, kit, baseY, opts.heightAt)) lists[i.shape].push(lampsOn || !i.glow ? i : { ...i, glow: false })
    } else {
      // The tinted see-through glass of a glass house goes to its own draw call.
      const { colors } = look(place, kit).palette
      for (const i of exteriorInstances(place, kit, baseY, opts.heightAt)) (i.glass ? glassList : lists[i.shape]).push(lampsOn ? i : unlit(i, colors))
      for (const i of neglectInstances(place, kit, baseY, level, 'exterior')) lists[i.shape].push(i)
      for (const i of constructionInstances(place, baseY, opts.nowMs)) lists[i.shape].push(i)
    }
    if (opts.interiors.has(place.id)) {
      // Everything inside is marked so: under the roof it gets less of the sky's light.
      const push = (i: Instance) => lists[i.shape].push({ ...i, inside: true })
      // Being built, the rooms and the exhibits in them are in the wireframe above (issues 329, 426).
      if (!wired) {
        const inside = interiorParts(place, kit, baseY, opts.models, { lampsOn })
        for (const i of inside.instances) push(i)
        for (const m of inside.models) (modelLists[m.file] ??= []).push(m.matrix)
        lamps.push(...lampSpots(place, kit, baseY, lampsOn))
      }
      const { palette } = look(place, kit)
      if (!wired) for (const spot of exhibitSpots(place, kit, baseY)) for (const i of exhibitInstances(spot, palette.colors)) push(lampsOn ? i : unlit(i, palette.colors))
      // The gallery wall's board (every finished work, a page at a time): one box; its painted face is drawn apart (`GalleryWalls`).
      if (opts.shelf?.length) for (const wall of galleryWalls(place, kit, baseY, opts.shelf, exteriorInstances(place, kit, baseY))) for (const i of wallInstances(wall, palette.colors)) push(lampsOn ? i : unlit(i, palette.colors))
      if (!wired) for (const i of neglectInstances(place, kit, baseY, level, 'interior')) push(i)
    }
  }
  // The plots staked by open requests (spec 10.3), each on its own ground.
  for (const request of opts.plots ?? []) for (const i of plotInstances(request, opts.heightAt)) lists[i.shape].push(i)
  const models: Record<string, Float32Array> = {}
  for (const [file, list] of Object.entries(modelLists)) {
    const packed = new Float32Array(list.length * 16)
    list.forEach((m, k) => packed.set(m, k * 16))
    models[file] = packed
  }
  const pack = (list: Instance[]): ShapeInstances => {
    const matrices = new Float32Array(list.length * 16)
    const colors = new Float32Array(list.length * 3)
    const glow = new Float32Array(list.length)
    const trim = new Float32Array(list.length)
    const inside = new Float32Array(list.length)
    const day = new Float32Array(list.length * 4)
    list.forEach((inst, k) => {
      matrices.set(inst.matrix, k * 16)
      colors.set(rgb(inst.color), k * 3)
      glow[k] = inst.glow ? 1 : 0
      trim[k] = inst.trim ? 1 : 0
      inside[k] = inst.inside ? 1 : 0
      if (inst.dayColor) day.set([...rgb(inst.dayColor), 1], k * 4)
    })
    return { matrices, colors, glow, trim, inside, day, count: list.length }
  }
  return { box: pack(lists.box), sphere: pack(lists.sphere), cylinder: pack(lists.cylinder), cone: pack(lists.cone), glassBox: pack(glassList), models, lamps }
}

/** What drawing these costs: a draw call for each shape that has any and the triangles of every instance, and for each model file at most `MODEL_LIMITS`. */
export function renderBudget(scene: Record<Shape, Omit<ShapeInstances, 'trim' | 'inside' | 'day'>> & { glassBox?: Omit<ShapeInstances, 'trim' | 'inside' | 'day'>; models?: Record<string, Float32Array> }): { drawCalls: number; triangles: number } {
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
  if (scene.glassBox && scene.glassBox.count > 0) {
    drawCalls++
    triangles += scene.glassBox.count * SHAPE_TRIANGLES.box
  }
  return { drawCalls, triangles }
}
