import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cameraPoses, hashString, type Box as Box3, type Vec3 } from '@forkling/sim'
import { PNG } from 'pngjs'
import type { Page } from 'playwright'
import { shrinkPng } from '../fixtures/trim.ts'
import type { CheckResult } from '../report/finding.ts'
import { contactSheet, type Box, type Tile } from '../report/sheet.ts'
import type { SceneObject } from './open.ts'
import type { FrameCost } from './budget.ts'
import { flicker, middleLight, muddyShare, nearWhiteShare, paletteShare, pictureStats } from './picture.ts'

/**
 * The picture checks of one opened world (audit spec 7.3, 7.4): the fixed cameras (aerial, each place's front, Merge close) and
 * 40 seeded poses, each picture judged for blank, light and palette; each place's sign looked at for a texture that never
 * loaded; flicker at the fronts; the sign letters' size on a phone; and a contact sheet (PNG) of every picture.
 */

/** The look's colours (docs/spec/v4/look.md): the theme, the sky stops, the mist, and the eight palettes. */
export const LOOK_PALETTE = [
  '#2b0b5e', '#8c1eff', '#ff3fa4', '#ff6ad5', '#ffb36b', '#fff27a', '#7fe3d8', '#01cdfe', '#ffd6f1', '#1a0b3b', '#39ff88', '#b48cff', '#05021a', '#ffffff',
  // The cyan wireframe as the glow brightens it.
  '#00ffff',
  '#bfeaf5', '#6a4cff', '#e8d9ff', '#b388ff', '#d8d8ff', '#7ffcff', '#fff3c4', '#ff71ce', '#ffe6f5', '#ff9f43', '#c79bff', '#e2e0ff',
  '#ffc8e8', '#ff4f6d', '#ff7a59', '#ffe9dc', '#c06cff', '#e8d6ff', '#d6ffe9', '#19c6a6', '#e8fff4', '#8f7bff', '#d8f5ff', '#baffc9',
  '#e2ccff', '#5b2bd6', '#f1e4ff', '#a06bff', '#ff9ad8', '#f4f0ff', '#fff0fa', '#d0a8ff', '#f0ecff', '#c9c6ff', '#3a2a8a', '#dedcff', '#7a5cff', '#f5e6ff', '#ffd0f0',
]

/** Levels (first guesses, audit steps "Facts" 11; tuned with a reason in docs/decisions.md). */
export const PICTURE_LEVELS = {
  /** Below this spread of light a picture is blank. */
  blankSpread: 6,
  /** The mean light of a day picture, and of a night one. */
  day: [40, 245] as const,
  night: [4, 200] as const,
  /** Below this share of pixels near the look's colours, a picture is off the palette. The fixtures' pictures score 0.97 and up (19 November). */
  palette: 0.75,
  /** More than this share of near-white pixels in a picture taken inside a room is blown out (issue 358; the before pictures were 0.46 to 0.57). */
  roomNearWhite: 0.4,
  /** By day, a picture inside a room whose middle band (mostly the walls) is darker than this reads as dusk (the dull violet Workshop at noon was 105; Home, 150). */
  roomDayMiddle: 115,
  /** More than this share of brown, olive or khaki pixels in a night picture breaks look.md rule 3 (issue 361; the before pictures were 0.13). */
  nightMuddy: 0.08,
  /** More than this share of pixels jumping when the camera moves 1 mm is flicker. */
  flicker: 0.003,
  /** The smallest letters on a sign must be this many pixels high on a phone (390x844) from 6 m. */
  letterPx: 10,
}

export interface Shot {
  name: string
  png: Buffer
}

/** The judgement of one picture on its own: blank, too dark or bright, off the palette. */
export function judgeShot(shot: Shot, ctx: { fixture: string; night: boolean; file: string }): CheckResult[] {
  const img = PNG.sync.read(shot.png)
  const { light, spread } = pictureStats(img)
  const out: CheckResult[] = []
  const add = (id: string, severity: CheckResult['severity'], title: string, what: string, causes: string) =>
    out.push({ id, fingerprint: `${id}|${ctx.fixture}|${shot.name}`, severity, title, what, causes, evidence: [ctx.file], fixKind: 'look', fixture: ctx.fixture })
  if (spread < PICTURE_LEVELS.blankSpread) add('world.blank', 'major', `The view "${shot.name}" is blank`, `The picture has almost no detail (light spread ${spread.toFixed(1)}).`, 'A visitor looking this way sees a flat colour, not a world.')
  const [lo, hi] = ctx.night ? PICTURE_LEVELS.night : PICTURE_LEVELS.day
  if (light < lo) add('world.too-dark', 'major', `The view "${shot.name}" is too dark`, `Mean light ${light.toFixed(0)} of 255 (at least ${lo} ${ctx.night ? 'at night' : 'by day'}).`, 'A visitor cannot make out what is there.')
  if (light > hi) add('world.too-bright', 'major', `The view "${shot.name}" is washed out`, `Mean light ${light.toFixed(0)} of 255 (at most ${hi}).`, 'The glow swallows the shapes.')
  // Inside a room (the seeded poses named `room:`): the walls and floor must keep their colours.
  if (shot.name.startsWith('room:')) {
    const white = nearWhiteShare(img)
    if (white > PICTURE_LEVELS.roomNearWhite) add('world.room-blown-out', 'major', `The room in "${shot.name}" is washed out`, `${(white * 100).toFixed(0)}% of the picture is near white (at most ${PICTURE_LEVELS.roomNearWhite * 100}%).`, 'The room looks like an empty, overlit showroom: its walls and floor lose their colours.')
    const middle = middleLight(img)
    if (!ctx.night && middle < PICTURE_LEVELS.roomDayMiddle) add('world.room-too-dark', 'major', `The room in "${shot.name}" is dim by day`, `The walls in the middle of the picture have a mean light of ${middle.toFixed(0)} of 255 (at least ${PICTURE_LEVELS.roomDayMiddle} by day).`, 'At noon the room looks like dusk: its walls read as a dull dark colour.')
  }
  if (ctx.night) {
    const muddy = muddyShare(img)
    if (muddy > PICTURE_LEVELS.nightMuddy) add('world.night-muddy', 'major', `The view "${shot.name}" turns brown or olive at night`, `${(muddy * 100).toFixed(0)}% of its pixels are brown, olive or khaki (at most ${PICTURE_LEVELS.nightMuddy * 100}%; look.md rule 3).`, 'At night the pastel world reads as mud instead of glowing colour.')
  }
  const share = paletteShare(img, LOOK_PALETTE)
  if (share < PICTURE_LEVELS.palette) add('world.off-palette', 'minor', `The view "${shot.name}" is off the look's colours`, `${(share * 100).toFixed(0)}% of its pixels are near the look's palette (look.md); at least ${PICTURE_LEVELS.palette * 100}% should be.`, 'It looks less like the agreed pastel world and more like a generic 3D scene.')
  return out
}

/** Letter height in pixels on a phone picture (844 px high, 70 degree view) from `distance` meters. */
export const letterPixels = (letterMeters: number, distance = 6, screenHeight = 844, fovY = 70) => (letterMeters / (2 * distance * Math.tan(((fovY / 2) * Math.PI) / 180))) * screenHeight

type Qa = {
  step(ms: number): Promise<void>
  teleport(x: number, z: number, yaw?: number): Promise<void>
  setCamera(pose: { position: Vec3; target: Vec3 } | string | null): Promise<void>
  cameras: Record<string, { position: Vec3; target: Vec3 }>
  project(points: Vec3[]): { x: number; y: number; front: boolean; visible: boolean }[]
  textures(): { object: string; slot: string }[]
  renderer(): { drawCalls: number; triangles: number }
}
const qa = <T>(page: Page, fn: (q: Qa, arg: never) => T | Promise<T>, arg?: unknown) =>
  page.evaluate(({ src, arg }) => (0, eval)(`(${src})`)((globalThis as unknown as { __qa: Qa }).__qa, arg), { src: fn.toString(), arg }) as Promise<T>

/** The part of the picture a box covers (its corners in front of the camera, cut to the 640x400 picture), or null when too little shows. */
const rectOf = (pts: { x: number; y: number; front: boolean }[]): Box | null => {
  if (!pts.every((p) => p.front)) return null
  const x0 = Math.max(0, Math.min(...pts.map((p) => p.x)))
  const y0 = Math.max(0, Math.min(...pts.map((p) => p.y)))
  const x1 = Math.min(640, Math.max(...pts.map((p) => p.x)))
  const y1 = Math.min(400, Math.max(...pts.map((p) => p.y)))
  if ((x1 - x0) * (y1 - y0) < 200) return null
  // A little inside the edges, so the frame around the board does not count.
  const inset = (n: number) => Math.round(n * 0.15)
  return { x: Math.round(x0) + inset(x1 - x0), y: Math.round(y0) + inset(y1 - y0), w: Math.max(1, Math.round((x1 - x0) * 0.7)), h: Math.max(1, Math.round((y1 - y0) * 0.7)) }
}
const corners = (b: Box3): Vec3[] => [[b.min[0], b.min[1], b.min[2]], [b.max[0], b.min[1], b.min[2]], [b.min[0], b.max[1], b.max[2]], [b.max[0], b.max[1], b.max[2]]]

/** Takes and judges every picture of an opened world, and writes its contact sheet. The page is set to 640x400. */
export async function pictureChecks(page: Page, opts: { fixture: string; scene: SceneObject[]; night: boolean; out: string }): Promise<{ findings: CheckResult[]; sheet: string; shots: number; costs: FrameCost[] }> {
  const costs: FrameCost[] = []
  const { fixture, scene, out } = opts
  const dir = join(out, 'world', fixture)
  mkdirSync(dir, { recursive: true })
  await page.setViewportSize({ width: 640, height: 400 })
  const findings: CheckResult[] = []
  const tiles: Tile[] = []
  const shoot = async (name: string): Promise<{ png: Buffer; file: string }> => {
    const file = join(dir, `${name.replace(/[^a-z0-9-]+/gi, '-')}.png`)
    const png = await page.screenshot({ path: file, timeout: 120_000 })
    return { png, file }
  }
  const take = async (name: string, boxes: () => Promise<Box[]> = async () => []) => {
    const { png, file } = await shoot(name)
    findings.push(...judgeShot({ name, png }, { fixture, night: opts.night, file }))
    costs.push({ view: name, ...(await qa(page, (q) => q.renderer())) })
    tiles.push({ png: shrinkPng(png, 320), boxes: (await boxes()).map((b) => ({ x: Math.round(b.x / 2), y: Math.round(b.y / 2), w: Math.max(1, Math.round(b.w / 2)), h: Math.max(1, Math.round(b.h / 2)) })) })
    return { png, file }
  }
  const boxed = scene.filter((o): o is SceneObject & { box: Box3 } => o.box !== null)
  const places = boxed.filter((o) => o.kind === 'place')

  // The fixed cameras: from above, each front with its sign (texture and flicker), and Merge close.
  await qa(page, (q) => q.setCamera('aerial'))
  await take('aerial')
  const named = await qa(page, (q) => q.cameras)
  for (const p of places) {
    const pose = named[`front:${p.id}`]
    if (!pose) continue
    await qa(page, (q, a: [number, number]) => q.teleport(a[0], a[1]), [pose.position[0], pose.position[2]])
    await qa(page, (q, a: { position: Vec3; target: Vec3 }) => q.setCamera(a), pose)
    const { png, file } = await take(`front-${p.id}`)
    // Flicker: the same view with the camera moved 1 mm.
    await qa(page, (q, a: { position: Vec3; target: Vec3 }) => q.setCamera({ position: [a.position[0] + 0.001, a.position[1], a.position[2]], target: a.target }), pose)
    const moved = await shoot(`front-${p.id}-1mm`)
    const f = flicker(PNG.sync.read(png), PNG.sync.read(moved.png))
    if (f.share > PICTURE_LEVELS.flicker && f.box)
      findings.push({ id: 'world.flicker', fingerprint: `world.flicker|${fixture}|front-${p.id}`, severity: 'minor', title: `Surfaces flicker at the front of ${p.id}`, what: `${(f.share * 100).toFixed(2)}% of the pixels change when the camera moves 1 mm, around x ${f.box.x}, y ${f.box.y} (${f.box.w} by ${f.box.h}).`, causes: 'Two surfaces fight: a visitor sees stripes that shimmer as they move.', evidence: [file, moved.file], fixKind: 'look', fixture })
  }
  // Each sign straight on from 3 m, boxed, for the sheet and the look reviewer (a porch column may stand in front of it).
  const signShots: string[] = []
  for (const sign of boxed.filter((o) => o.kind === 'sign')) {
    const c: Vec3 = [(sign.box.min[0] + sign.box.max[0]) / 2, (sign.box.min[1] + sign.box.max[1]) / 2, (sign.box.min[2] + sign.box.max[2]) / 2]
    await qa(page, (q, a: [number, number]) => q.teleport(a[0], a[1]), [c[0], c[2] + 3])
    await qa(page, (q, a: { position: Vec3; target: Vec3 }) => q.setCamera(a), { position: [c[0], c[1], c[2] + 3], target: c })
    const rect = rectOf(await qa(page, (q, a: Vec3[]) => q.project(a), corners(sign.box)))
    signShots.push((await take(`sign-${sign.place ?? sign.id}`, async () => (rect ? [rect] : []))).file)
  }
  // Textures whose picture never loaded: drawn black (or not at all), whatever the camera sees.
  const broken = new Map<string, string[]>()
  for (const t of await qa(page, (q) => q.textures())) broken.set(t.object, [...(broken.get(t.object) ?? []), t.slot])
  for (const [object, slots] of broken) {
    const t = { object, slot: [...new Set(slots)].join(' and ') }
    findings.push({ id: 'world.missing-texture', fingerprint: `world.missing-texture|${fixture}|${t.object}`, severity: 'major', title: `A texture of "${t.object}" never loaded`, what: `The ${t.slot} of "${t.object}" has no picture, so it is drawn black.`, causes: t.object === 'signs' ? "A visitor sees black slabs instead of the places' names." : 'A visitor sees black where a picture should be.', evidence: t.object === 'signs' ? signShots : [], fixKind: 'code', fixture })
  }
  if (named['merge-close']) {
    await qa(page, (q) => q.setCamera('merge-close'))
    await take('merge-close')
  }

  // The 40 seeded poses (spec 7.4), the visitor standing at each so the insides near it are drawn.
  const poses = cameraPoses({ places: places.map((p) => ({ id: p.id, box: p.box })), rooms: boxed.filter((o) => o.kind === 'room').map((r) => ({ id: r.id, ...(r.place ? { place: r.place } : {}), box: r.box })), merge: boxed.find((o) => o.kind === 'merge')?.box ?? null }, hashString(fixture))
  for (const pose of poses) {
    await qa(page, (q, a: [number, number]) => q.teleport(a[0], a[1]), [pose.stand.x, pose.stand.z])
    await qa(page, (q, a: { position: Vec3; target: Vec3 }) => q.setCamera(a), { position: pose.position, target: pose.target })
    await take(pose.name)
  }
  await qa(page, (q) => q.setCamera(null))

  // Sign letters on a phone from 6 m (no picture needed: the letter size comes from the scene).
  for (const s of boxed.filter((o) => o.kind === 'sign' && o.letter)) {
    const px = letterPixels(s.letter!)
    if (px < PICTURE_LEVELS.letterPx) findings.push({ id: 'world.label-small', fingerprint: `world.label-small|${fixture}|${s.id}`, severity: 'minor', title: `The words on ${s.id} are too small to read on a phone`, what: `Its smallest letters are ${px.toFixed(1)} px high from 6 m on a phone; at least ${PICTURE_LEVELS.letterPx} px are readable.`, causes: 'A visitor on a phone has to walk right up to read it.', evidence: [], fixKind: 'look', fixture })
  }

  const sheet = join(out, 'sheets', `world-${fixture}.png`)
  mkdirSync(join(out, 'sheets'), { recursive: true })
  writeFileSync(sheet, contactSheet(tiles, { columns: 8 }))
  return { findings: findings.map((f) => (f.evidence.length ? f : { ...f, evidence: [sheet] })), sheet, shots: tiles.length, costs }
}
