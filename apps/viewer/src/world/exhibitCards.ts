import type { KitPart, Place, Souvenir } from '@forkling/schema'
import type { ExhibitSpot } from './exhibitGeometry.ts'
import { safeUrl } from './panelContent.ts'

/**
 * What an exhibit shows on its face (issues 347, 355): a card with the words of a quote or a fact, the picture of an image souvenir
 * with its credit and licence, the title on a plaque, the gallery's line on the terminal. Plain data, so it can be tested without
 * a renderer; `ExhibitCards.tsx` paints every card onto one texture and draws them all as one mesh. The screens that show works
 * are not cards: they are drawn by the work screens.
 */
export type CardShows = 'picture' | 'text' | 'title' | 'nothing'
/** A paper card is a small window (title bar, ink on face); brass is a plaque; a terminal is green text on dark. */
export type CardStyle = 'paper' | 'brass' | 'terminal'

export interface CardContent {
  shows: CardShows
  style: CardStyle
  /** The words on the title bar (a paper card), empty for none. */
  title: string
  /** The words on the card. For a picture, its credit and licence. */
  text: string
  /** An image souvenir's picture (https only), drawn above its credit line once it has loaded. */
  picture: { url: string; credit: string; licence: string } | null
  /** In a place being built: the card is drawn as wire, its words in glowing cyan lines on no face, and no picture (issue 426). */
  wire?: true
  /** A frame's label plate: a thin brass strip with at most two short lines (`plateText`). */
  plate?: true
}

/**
 * A card in a place being built (issue 426): the finished model there is cyan wire, so its card is too. Its words are kept, drawn
 * as glowing lines with no face behind them; a picture waits until the place is done, and its card shows its title and credit.
 */
export function wireCard(content: CardContent): CardContent {
  const shows: CardShows = content.shows === 'picture' ? (content.title !== '' || content.text !== '' ? 'text' : 'nothing') : content.shows
  return { ...content, shows, picture: null, wire: true }
}

const squash = (s: string) => s.trim().replace(/\s+/g, ' ')

/**
 * What one exhibit's card says. `souvenir` is the souvenir file the exhibit names once it has been read (null or undefined before,
 * or when it could not be): until then the card shows the exhibit's own label, Merge's words about it, so it is never blank.
 */
export function cardContent(exhibit: Place['exhibits'][number], slotKind: ExhibitSpot['slotKind'], souvenir: Souvenir | null | undefined, workCount: number): CardContent {
  const style: CardStyle = slotKind === 'plaque' ? 'brass' : slotKind === 'terminal' ? 'terminal' : 'paper'
  const label = squash(exhibit.label)
  const done = (c: Omit<CardContent, 'shows'> & { shows: Exclude<CardShows, 'nothing'> }): CardContent => (c.picture || c.text !== '' ? c : { ...c, shows: 'nothing' })
  switch (exhibit.kind) {
    case 'souvenir': {
      const source = souvenir ? squash(souvenir.source.title) : ''
      if (souvenir?.kind === 'image') {
        const url = safeUrl(souvenir.content)
        if (url) return done({ shows: 'picture', style, title: source || 'A picture', text: squash(`${souvenir.credit} · ${souvenir.licence}`), picture: { url, credit: squash(souvenir.credit), licence: souvenir.licence } })
      }
      if (souvenir?.kind === 'quote') return done({ shows: 'text', style, title: source || 'A quote', text: `“${squash(souvenir.content)}”`, picture: null })
      if (souvenir?.kind === 'fact') return done({ shows: 'text', style, title: source || 'A fact', text: squash(souvenir.content), picture: null })
      return done({ shows: 'text', style, title: 'Kept', text: label, picture: null })
    }
    case 'gallery':
      return done({ shows: 'text', style, title: 'works.exe', text: label === '' ? '' : `${label} ${workCount === 1 ? '1 work' : `${workCount} works`}. Click to open.`, picture: null })
    case 'trail':
      return done({ shows: 'title', style, title: 'A trail', text: label, picture: null })
    default:
      return done({ shows: 'title', style, title: '', text: label, picture: null })
  }
}

/** A frame's label plate, in meters: a thin brass strip under the frame. */
export const PLATE = { w: 0.36, h: 0.07, gap: 0.06 } as const
/** A plate's label is cut with "…" past this many characters, so it fits in two lines. */
export const PLATE_CHARS = 60

/**
 * The words on the brass plate under a framed picture (Merge's wish tiny-label-plate: "so the wall can say which weird language is
 * which"): Merge's own label, squashed and cut with "…" past about 60 characters. Null for no plate: only a card that shows a
 * picture gets one (before its souvenir is read, the card itself shows the label), and only when the label has words.
 */
export function plateText(exhibit: Place['exhibits'][number], content: CardContent): string | null {
  if (content.shows !== 'picture') return null
  const label = squash(exhibit.label)
  if (label === '') return null
  return label.length > PLATE_CHARS ? `${label.slice(0, PLATE_CHARS - 1).trimEnd()}…` : label
}

/** What a plate shows: its words on brass. */
export function plateContent(text: string): CardContent {
  return { shows: 'text', style: 'brass', title: '', text, picture: null, plate: true }
}

/**
 * Where a frame's plate hangs: centred under the frame part, its middle `PLATE.gap` below the part's foot (taken from the slot and the
 * part, so it fits a small frame and a large one alike), standing out from the wall like the card. Null for any slot but a frame.
 */
export function platePose(spot: Pick<ExhibitSpot, 'slotKind' | 'position' | 'partFoot'>): CardPose | null {
  if (spot.slotKind !== 'frame') return null
  return { local: [0, spot.partFoot - spot.position[1] - PLATE.gap, 0.02], size: [PLATE.w, PLATE.h], tilt: 0 }
}

/** A card in the world: its middle, its size in meters, how far it leans back (about its own x) and its turn about y. */
export interface CardPose {
  /** The card's middle, from its slot, before the part's turn: x across, y up, z out of the part's front. */
  local: [number, number, number]
  size: [number, number]
  tilt: number
}

/** The terminal's screen leans back like the kit part's (`kit/parts.json`, terminal). */
export const TERMINAL_TILT = -0.4

/**
 * Where an exhibit's card is, by its slot: standing on a shelf, on top of a case, filling a frame, on a plaque, on the terminal's
 * screen. Null for a screen, which shows its work instead.
 */
export function cardPose(spot: Pick<ExhibitSpot, 'slotKind' | 'position' | 'partTop'>): CardPose | null {
  switch (spot.slotKind) {
    case 'shelf': {
      // At the front of the board, so the shelf above does not hide it, leaning back a little towards the visitor's eyes.
      const t = SHELF_CARD.tilt
      return { local: [0, 0.03 + (SHELF_CARD.h / 2) * Math.cos(t), SHELF_CARD.front + (SHELF_CARD.h / 2) * Math.sin(t)], size: [SHELF_CARD.w, SHELF_CARD.h], tilt: t }
    }
    case 'case':
      return { local: [0, spot.partTop - spot.position[1] + CASE_CARD.h / 2 + 0.005, 0.012], size: [CASE_CARD.w, CASE_CARD.h], tilt: 0 }
    case 'frame':
      return { local: [0, 0, 0.02], size: [0.42, 0.315], tilt: 0 }
    case 'plaque':
      return { local: [0, 0, 0.012], size: [0.36, 0.18], tilt: 0 }
    case 'terminal': {
      // On the face of the laptop's dark screen (0.02 in front of its middle), along the screen's lean.
      const out = 0.04
      return { local: [0, -Math.sin(TERMINAL_TILT) * out, -0.02 + Math.cos(TERMINAL_TILT) * out], size: [0.44, 0.3], tilt: TERMINAL_TILT }
    }
    case 'screen':
      return null
  }
}

/**
 * A card on a shelf stands on the shelf board at its front edge (`front`, from the slot), leaning back a little, with a thin backing
 * behind it. Set further in and leaning further back, Home's low shelf's top board hid the first line of its cards from a visitor
 * standing at it (issue 453): standing at the edge, the card's whole face shows under the board above from up against the shelf
 * (`cardView`).
 */
export const SHELF_CARD = { w: 0.36, h: 0.27, front: 0.19, tilt: -0.08 } as const
/** A visitor's eyes are this high above the floor (`apps/viewer/src/player/Player.tsx`: about 1.6 m). */
export const VISITOR_EYE = 1.6
/** A visitor reads a card from this far in front of the part's front: up against it (its capsule's radius), a step back, and further. */
const READ_FROM = [0.3, 0.6, 1.2] as const

type V3 = [number, number, number]

/**
 * What a visitor sees of a card, in the frame of the part it stands on (x across, y up from the part's foot, z out of its front):
 * the visitor's eyes straight in front of the card at the distances it reads from, points of the card's face (its corners and the
 * middle of its top edge, a centimetre in), and the box of each primitive of the part. The audit checks that no box stands between
 * an eye and a point of the face (`world.card-covered`, issue 453). `foot` is how high above its floor the part's foot is drawn.
 */
export function cardView(pose: CardPose, slotAt: readonly [number, number, number], part: KitPart, foot: number): { eyes: V3[]; face: V3[]; boards: { min: V3; max: V3 }[] } {
  const ct = Math.cos(pose.tilt)
  const st = Math.sin(pose.tilt)
  const [hw, hh] = [pose.size[0] / 2 - 0.01, pose.size[1] / 2 - 0.01]
  const point = (x: number, y: number): V3 => [slotAt[0] + pose.local[0] + x, slotAt[1] + pose.local[1] + y * ct, slotAt[2] + pose.local[2] + y * st]
  const face = [point(-hw, -hh), point(hw, -hh), point(hw, hh), point(-hw, hh), point(0, hh), point(0, 0)]
  const eyes = READ_FROM.map((d): V3 => [slotAt[0] + pose.local[0], VISITOR_EYE - foot, part.size[2] / 2 + d])
  const boards = part.primitives.map((p) => ({ min: [p.at[0] - p.size[0] / 2, p.at[1] - p.size[1] / 2, p.at[2] - p.size[2] / 2] as V3, max: [p.at[0] + p.size[0] / 2, p.at[1] + p.size[1] / 2, p.at[2] + p.size[2] / 2] as V3 }))
  return { eyes, face, boards }
}

/** A card on a case stands on its top. */
export const CASE_CARD = { w: 0.28, h: 0.21 } as const

/** A local point of a card (`x` across, `y` up on its face) in the world: lean, move to its middle, turn with the part, move to the slot. */
function toWorld(spot: Pick<ExhibitSpot, 'position' | 'rotY'>, pose: CardPose, x: number, y: number, z = 0): [number, number, number] {
  const ct = Math.cos(pose.tilt)
  const st = Math.sin(pose.tilt)
  const lx = x + pose.local[0]
  const ly = y * ct - z * st + pose.local[1]
  const lz = y * st + z * ct + pose.local[2]
  const c = Math.cos(spot.rotY)
  const s = Math.sin(spot.rotY)
  return [spot.position[0] + lx * c + lz * s, spot.position[1] + ly, spot.position[2] - lx * s + lz * c]
}

/** The four corners of a card in the world (bottom left, bottom right, top right, top left, seen from the front) and the way it faces. */
export function cardCorners(spot: Pick<ExhibitSpot, 'position' | 'rotY'>, pose: CardPose): { corners: [number, number, number][]; normal: [number, number, number] } {
  const [hw, hh] = [pose.size[0] / 2, pose.size[1] / 2]
  const corners = [toWorld(spot, pose, -hw, -hh), toWorld(spot, pose, hw, -hh), toWorld(spot, pose, hw, hh), toWorld(spot, pose, -hw, hh)]
  const o = toWorld(spot, pose, 0, 0, 0)
  const n = toWorld(spot, pose, 0, 0, 1)
  return { corners, normal: [n[0] - o[0], n[1] - o[1], n[2] - o[2]] }
}

/** One card to draw: its key (`<place>/<exhibit>`), where it is and what it says. */
export interface CardFace {
  key: string
  corners: [number, number, number][]
  normal: [number, number, number]
  aspect: number
  content: CardContent
}

/** Every card of the given spots. The souvenirs are the files read so far, by the exhibit's `ref`; `building` are the places being built, whose cards are wire. */
export function cardFaces(spots: readonly ExhibitSpot[], souvenirs: ReadonlyMap<string, Souvenir | null>, workCount: number, building: ReadonlySet<string> = new Set()): CardFace[] {
  const out: CardFace[] = []
  for (const spot of spots) {
    const pose = cardPose(spot)
    if (!pose) continue
    const e = spot.exhibit
    const { corners, normal } = cardCorners(spot, pose)
    const content = cardContent(e, spot.slotKind, e.ref ? souvenirs.get(e.ref) : null, workCount)
    const shown = building.has(spot.placeId) ? wireCard(content) : content
    out.push({ key: `${spot.placeId}/${e.id}`, corners, normal, aspect: pose.size[1] / pose.size[0], content: shown })
    const plate = platePose(spot)
    const text = plate ? plateText(e, shown) : null
    if (plate && text) out.push({ key: `${spot.placeId}/${e.id}/plate`, ...cardCorners(spot, plate), aspect: plate.size[1] / plate.size[0], content: plateContent(text) })
  }
  return out
}

/** The design cell a card is painted in, in pixels: as wide as this, and as tall as its own shape asks (at most `h`). */
export const CARD_CELL = { w: 320, h: 240 } as const
const PAD = 12
/** The title bar of a paper card. */
export const CARD_BAR = 30
/** How wide a character of VT323 is, as a share of its size: an estimate that errs wide. The painter squeezes a line that is wider. */
const CHAR = 0.5
const SIZES: Record<CardStyle, number[]> = { paper: [36, 32, 28, 26], brass: [44, 38, 32, 28, 26], terminal: [32, 28, 26] }
/** The type sizes on a frame's label plate, largest first: two lines of a 60-character label fit at the smallest. */
const PLATE_SIZES = [28, 24, 20] as const
/** The credit line under a picture. */
export const CREDIT_PX = 18

function wrap(text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (let word of squash(text).split(' ')) {
    if (word === '') continue
    while (word.length > max) {
      if (line) lines.push(line)
      line = ''
      lines.push(word.slice(0, max))
      word = word.slice(max)
    }
    if (line === '') line = word
    else if (line.length + 1 + word.length <= max) line += ` ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

export interface CardLayout {
  /** The painted size, in pixels. */
  w: number
  h: number
  /** The title bar's height (0 for none) and its words, cut to fit. */
  bar: number
  title: string
  /** The body's lines, their size and the baseline of the first; each next line is `lineHeight` lower. */
  lines: string[]
  px: number
  top: number
  lineHeight: number
  /** For a picture: where it goes, and the credit line below it. */
  picture: { x: number; y: number; w: number; h: number } | null
}

/**
 * How a card is laid out in its cell: the largest type that fits all of its words, or, at the smallest, as many lines as fit with
 * the last cut and ended with "…". Short readable text: never smaller than 26 pixels on a card of 320 (the whole text is in the panel a click opens).
 */
export function cardLayout(content: CardContent, aspect: number): CardLayout {
  const w = CARD_CELL.w
  const h = Math.min(CARD_CELL.h, Math.round(w * aspect))
  const bar = content.style === 'paper' ? CARD_BAR : 0
  const titleMax = Math.floor((w - 2 * PAD - 40) / (12 * 0.9))
  const title = content.title.length > titleMax ? `${content.title.slice(0, titleMax - 1)}…` : content.title
  const room = (px: number) => Math.max(1, Math.floor((w - 2 * PAD) / (px * CHAR)))
  if (content.plate) {
    // A plate's cell is a strip (about 62 pixels tall): at most two lines, in the largest type they fit in, the last cut with "…".
    const pad = 6
    const fits = (px: number) => Math.max(1, Math.floor((w - 2 * pad) / (px * CHAR)))
    const body = h - 2 * pad
    for (const px of PLATE_SIZES) {
      const lines = wrap(content.text, fits(px))
      const lineHeight = Math.round(px * 1.05)
      if (lines.length <= 2 && lines.length * lineHeight <= body) return { w, h, bar, title, lines, px, top: pad + Math.round((body - lines.length * lineHeight) / 2) + Math.round(px * 0.8), lineHeight, picture: null }
    }
    const px = PLATE_SIZES.at(-1)!
    const lineHeight = Math.round(px * 1.05)
    const lines = wrap(content.text, fits(px)).slice(0, 2)
    lines[lines.length - 1] = `${lines.at(-1)!.slice(0, fits(px) - 1)}…`
    return { w, h, bar, title, lines, px, top: pad + Math.round((body - lines.length * lineHeight) / 2) + Math.round(px * 0.8), lineHeight, picture: null }
  }
  if (content.picture) {
    const lineHeight = Math.round(CREDIT_PX * 1.1)
    const lines = wrap(content.text, room(CREDIT_PX)).slice(0, 1)
    const pic = { x: PAD / 2, y: bar + PAD / 2, w: w - PAD, h: h - bar - PAD - lineHeight - 4 }
    return { w, h, bar, title, lines, px: CREDIT_PX, top: h - PAD / 2 - 2, lineHeight, picture: pic }
  }
  const body = h - bar - 2 * PAD
  const sizes = SIZES[content.style]
  for (const px of sizes) {
    const lines = wrap(content.text, room(px))
    const lineHeight = Math.round(px * 1.05)
    if (lines.length * lineHeight <= body) return { w, h, bar, title, lines, px, top: bar + PAD + Math.round((body - lines.length * lineHeight) / 2) + Math.round(px * 0.8), lineHeight, picture: null }
  }
  const px = sizes.at(-1)!
  const lineHeight = Math.round(px * 1.05)
  const fit = Math.max(1, Math.floor(body / lineHeight))
  const all = wrap(content.text, room(px))
  const lines = all.slice(0, fit)
  if (all.length > fit) lines[fit - 1] = `${lines[fit - 1]!.slice(0, Math.max(0, room(px) - 1))}…`
  return { w, h, bar, title, lines, px, top: bar + PAD + Math.round(px * 0.8), lineHeight, picture: null }
}

/** The atlas every card is painted on: eight cells to a row. */
export const CARD_COLUMNS = 8
/** At most this many cards are drawn at once (a texture of 2560 by 4080 pixels); the insides near the visitor never come close. */
export const MAX_CARDS = CARD_COLUMNS * 17

export function cardAtlas(count: number): { width: number; height: number; cell: (i: number) => { x: number; y: number } } {
  const n = Math.min(count, MAX_CARDS)
  const cols = Math.min(CARD_COLUMNS, Math.max(1, n))
  const rows = Math.max(1, Math.ceil(n / cols))
  return { width: cols * CARD_CELL.w, height: rows * CARD_CELL.h, cell: (i) => ({ x: (i % cols) * CARD_CELL.w, y: Math.floor(i / cols) * CARD_CELL.h }) }
}

/** What the scene list (`?qa=1`) says a card shows: the kind, and the words on it (title and text). */
export function cardShows(content: CardContent): { shows: CardShows; text: string } {
  return { shows: content.shows, text: squash([content.title, content.text].filter((s) => s !== '').join(' · ')) }
}
