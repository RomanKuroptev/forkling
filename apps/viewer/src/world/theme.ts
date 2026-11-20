/**
 * Every colour the viewer draws, in one place: the "Merge 95" look (docs/spec/v4/look.md). Tune the look here. A test fails if a
 * hex colour turns up in another file of the viewer. Colours are `#rrggbb` strings; code turns them into what it needs.
 */

/** The look's named colours. */
export const COLORS = {
  deep: '#2b0b5e',
  purple: '#8c1eff',
  hotPink: '#ff3fa4',
  pink: '#ff6ad5',
  peach: '#ffb36b',
  sun: '#fff27a',
  teal: '#7fe3d8',
  cyan: '#01cdfe',
  face: '#ffd6f1',
  ink: '#1a0b3b',
  green: '#39ff88',
  white: '#ffffff',
  lilac: '#b48cff',
  night: '#05021a',
  /** A pale, shiny metal, the body of an arcade. */
  metal: '#eef1f6',
} as const

/** The sky by day, from the horizon up, with the stops (the sine of the angle above the horizon) look.md gives. */
export const SKY = {
  day: { horizon: COLORS.peach, pink: COLORS.hotPink, purple: COLORS.purple, top: COLORS.deep },
  /** By night: purple at the horizon, deep, then near black. */
  night: { horizon: COLORS.purple, pink: COLORS.deep, purple: COLORS.deep, top: COLORS.night },
  /** Where each colour is fully reached, by day: pink by 0.10 up, purple by 0.26, deep from 0.5. */
  stops: { pink: 0.1, purple: 0.26, top: 0.5 },
  below: '#2b0b5e',
  starColor: COLORS.white,
  sunLow: COLORS.hotPink,
  sunHigh: COLORS.sun,
  /** The sun's size across the sky, in radians, and how far its centre stands above the horizon (the sine). */
  sunSize: 0.24,
  sunHeight: 0.13,
} as const

/** The grid floor beyond the land and the faint grid on the land itself. */
export const GRID = {
  ground: '#3a1280',
  line: '#ff40d1',
  landLine: '#ff6bdb',
  /** Beyond the land: one line every 8 m. On the land: one every 4 m, fading out between 40 and 220 m. */
  farSpacing: 8,
  landSpacing: 4,
  landFade: [40, 220],
  farFade: [50, 380],
} as const

export const LIGHT = {
  hemiSkyDay: '#ffd0f4',
  hemiSkyNight: '#8a7bff',
  /** The ground colour of the hemisphere light stays a light purple, or walls facing away from the sun turn brown. */
  hemiGround: COLORS.lilac,
  hemiDayIntensity: 2.1,
  sunDay: '#fff0f8',
  sunNight: '#9db4ff',
  rim: COLORS.cyan,
} as const

/**
 * Inside a place (issues 358, 361). The walls inside are the palette's trim mixed towards the face colour, so a room has a colour of
 * its own and is never the washed-out white of its outside pastel. Under a roof less of the sky's light reaches in, and at night the
 * lamps throw warm pools of light.
 */
export const INTERIOR = {
  /** The inside of the walls: the palette's trim, this far mixed towards `wallTowards`. */
  wallMix: 0.55,
  wallTowards: COLORS.face,
  /**
   * By day the inside walls read as the palette's own pale wall colour (look.md rules 1 and 2: a pastel room, not a dim one), mixed
   * with just enough of its trim to keep some colour (`dayInteriorWall`), and they give off this much of their own colour so the
   * pastel holds under the roof. At night they are the trim colour of `interiorWall`, as before.
   */
  daySelf: 0.45,
  /** The least colour (saturation) a day wall may have, so it never reads as white or grey. */
  dayWallColour: 0.24,
  /** The share of the sky's light (the hemisphere light) that reaches the inside of a place. */
  skyInside: 0.42,
  /** The warm light of a lamp that is on, how strong it is by day and at night, and how far it reaches (meters). */
  lampLight: COLORS.peach,
  lampDay: 0.5,
  lampNight: 4,
  lampReach: 7,
  /** How many lamps near the visitor light the room at once (a fixed number, so the shaders are made once). */
  lamps: 4,
  /**
   * A window seen from inside at night: it glows in the look's pink, more at night (look.md rule 8), not the flat lemon of the glass
   * seen from outside, which read as the sun still out (issue 435). By day it is the palette's glow.
   */
  windowNight: COLORS.pink,
} as const

/**
 * The light at night (look.md rules 2, 3 and 8). The flat light every surface gives off of its own colour drops at night, or pale
 * walls and orange trim read as khaki and brown in the dark; the purple sky light carries the shade instead. Lit trim (the accent
 * bands, title bars and window frames) glows a little in its own colour, more at night, and windows glow more than by day without
 * turning white.
 */
export const NIGHT_LIGHT = {
  /** The light every surface gives off of its own colour, by day and at night. */
  selfDay: 0.22,
  selfNight: 0.06,
  /** The hemisphere light at night. */
  hemiNightIntensity: 1.1,
  /** A window or lamp: what it gives off of its own colour, by day and at night. */
  glowDay: 0.9,
  glowNight: 1.25,
  /** A glowing thing takes this share of the light falling on it, so daylight does not wash it white. */
  glowLit: 0.35,
  /** Lit trim, by day (a little, so a yellow or orange band is not tan in shade) and at night. */
  trimDay: 0.3,
  trimNight: 0.7,
} as const

/** The inside wall colour of a palette with this trim (`INTERIOR`). */
export function interiorWall(trim: string): string {
  const a = Number.parseInt(trim.slice(1), 16)
  const b = Number.parseInt(INTERIOR.wallTowards.slice(1), 16)
  const mix = (shift: number) => Math.round(((a >> shift) & 255) * (1 - INTERIOR.wallMix) + ((b >> shift) & 255) * INTERIOR.wallMix)
  return `#${((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0')}`
}

/** Hue (degrees), saturation and value (0 to 1) of a hex colour. */
export function hsvOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  const mx = Math.max(r, g, b)
  const d = mx - Math.min(r, g, b)
  let h = 0
  if (d > 0) h = (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
  return [(h + 360) % 360, mx ? d / mx : 0, mx]
}

const mixHex = (a: string, b: string, t: number): string => {
  const x = Number.parseInt(a.slice(1), 16)
  const y = Number.parseInt(b.slice(1), 16)
  const m = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t)
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0')}`
}

/**
 * The inside wall colour by day: the palette's wall, mixed with the least of its trim (in steps of 5 percent) that gives it at least
 * `INTERIOR.dayWallColour` of colour and keeps it out of the warm beige and khaki hues look.md rule 3 forbids. Slate's wall has
 * colour enough and stays itself; meadow's pale mint and paper's near-white lean towards their pink trim.
 */
export const dayInteriorWall = (colors: { wall: string; trim: string }): string => pastelWith(colors.wall, colors.trim)

/** The floor inside by day, the same way: the palette's floor with the least of its wood colour that gives it colour. */
export const dayInteriorFloor = (colors: { floor: string; wood: string }): string => pastelWith(colors.floor, colors.wood)

/**
 * The least colour (saturation) the outside walls are drawn with. A near-white wall (meadow's pale mint, moss, paper) read as plain
 * grey in shade, under Home's porch (look.md rule 2: shade stays coloured). The walls of the other palettes have this much already.
 */
export const OUTSIDE_WALL_COLOUR = 0.2

/** The outside wall (the body of a building): the palette's wall, mixed with the least of its trim that gives it `OUTSIDE_WALL_COLOUR` of colour, the same way as inside. */
export const outsideWall = (colors: { wall: string; trim: string }): string => pastelWith(colors.wall, colors.trim, OUTSIDE_WALL_COLOUR)

function pastelWith(base: string, towards: string, least: number = INTERIOR.dayWallColour): string {
  for (let k = 0; k <= 20; k++) {
    const c = mixHex(base, towards, k / 20)
    const [h, s] = hsvOf(c)
    if (s >= least && !(h >= 15 && h <= 75)) return c
  }
  return towards
}

/**
 * Furniture, plinths and stands (issues 409, 430). Under a roof they get less light than the walls, so a palette colour that is pale
 * and grey-ish (a pale wall or the metal) reads as a grey box, and an orange or yellow accent reads as brown or khaki (look.md rule 3).
 * Each furniture colour keeps at least `colour` of colour (more than the day walls, as it stands in their shade) and stays out of the warm and olive hues `warm`
 * gives (the hues the night-muddy check counts, and red, which reads maroon in shade), so it reads pastel by day and does not turn
 * brown at night; a colour mixed to get there is light (`light`), never a dark blot.
 */
export const FURNITURE = {
  colour: 0.34,
  warm: [0, 130] as const,
  light: 0.6,
} as const

const furnitureOk = (hex: string): boolean => {
  const [h, s] = hsvOf(hex)
  return s >= FURNITURE.colour && !(h >= FURNITURE.warm[0] && h <= FURNITURE.warm[1])
}

/**
 * A palette colour as furniture wears it: itself when it is already a pastel off the warm hues, else mixed with the least of the
 * palette's trim, then its wood, that makes it one (in steps of 5 percent). The wood of every palette is a lilac, so there is always one.
 */
export function furnitureColour(hex: string, colors: { trim: string; wood: string }): string {
  if (furnitureOk(hex)) return hex
  const light = (c: string) => hsvOf(c)[2] >= FURNITURE.light
  // A dark trim (slate's deep indigo) would make a pale thing a dark blot: the lilac wood comes first then.
  for (const towards of light(colors.trim) ? [colors.trim, colors.wood] : [colors.wood, colors.trim]) {
    for (let k = 1; k <= 20; k++) {
      const c = mixHex(hex, towards, k / 20)
      if (furnitureOk(c) && light(c)) return c
    }
  }
  return furnitureOk(colors.wood) ? colors.wood : COLORS.lilac
}

/** A palette with every colour but the glow as furniture wears it (`furnitureColour`): the room parts and exhibits are drawn in it. */
export function furniturePalette<P extends { colors: { wall: string; trim: string; roof: string; floor: string; accent: string; wood: string; metal: string; glow: string } }>(palette: P): P {
  const c = palette.colors
  const f = (hex: string) => furnitureColour(hex, c)
  return { ...palette, colors: { ...c, wall: f(c.wall), trim: f(c.trim), roof: f(c.roof), floor: f(c.floor), accent: f(c.accent), wood: f(c.wood), metal: f(c.metal) } }
}

/** The mist at the world's edge and the fog, in the look's colours rather than white. */
export const MIST = {
  fogDay: '#ff7ab8',
  fogNight: '#3a1280',
  cloud: '#e8d8ff',
  /** How much of its own opacity a puff keeps: the sky behind it, and the sun, must stay clear. */
  strength: 0.3,
  targetNight: COLORS.lilac,
  targetDay: COLORS.face,
} as const

/**
 * The land. `side` is its side face, a deeper teal than the top, as in the look's pictures (issue 454); `rim` the bright band at the
 * top of that side and the strip along the end on top, so the end of the land shows where the walk stops.
 */
export const LAND = { grass: COLORS.teal, darkGrass: '#5fd0e8', meadow: '#a6f0df', side: '#3fa9bf', rim: '#c8fff6' } as const

export const PATH = { color: COLORS.face, glow: '#ff9ad8' } as const

/** The loaded CC0 models are restyled to these by their material names. */
export const MODEL: Record<string, string> = {
  woodBark: '#8f5bff',
  woodBarkDark: '#7a4cf0',
  leafsGreen: '#ff71ce',
  leafsDark: '#d94fd0',
  dirt: '#d8d8ff',
  grass: COLORS.teal,
  _defaultMat: '#d8d8ff',
}

/** A place that is being built is drawn as cyan glowing lines (look.md, "Unfinished things are cyan wireframe"). */
export const WIREFRAME = { pole: COLORS.cyan, rail: '#7ffcff', plank: '#4fc3f7' } as const

/** The unfinished plot: markers, board and pennant. */
export const PLOT = { stake: COLORS.cyan, rope: '#7ffcff', board: COLORS.face, pennant: COLORS.hotPink } as const

/** Props on exhibits. */
export const EXHIBIT = { brass: '#ffe08a', paper: COLORS.face, backing: COLORS.ink, dust: '#d8d8ff', web: '#f5f0ff', vine: '#19c6a6', leaf: COLORS.green } as const

/** The cards that show what an exhibit holds (`exhibitCards.ts`): small windows, brass plaques, the terminal's green on dark. */
export const CARD = { body: COLORS.face, ink: COLORS.ink, barFrom: COLORS.purple, barTo: COLORS.hotPink, barText: COLORS.white, brass: '#ffe08a', brassEdge: '#b8892e', screen: '#04140b', green: COLORS.green, picture: COLORS.lilac } as const

/** Marks left by visitors' notes, by state. */
export const NOTE_PAPER = { new: '#fff7d6', found: '#fff27a', replied: '#ff9ad8', kept: '#9ff3ff', declined: '#ff7a9a' } as const
export const NOTE_POST = '#4a2a8a'

/** Merge's screen: terminal green on near black. */
/** `dim` is the frames, dates and page strip of the gallery wall's tiles: the same green, quieter. */
export const SCREEN = { on: COLORS.green, off: '#04140b', dim: '#1f9a55' } as const

/** The place signs and labels are small windows: face-coloured body, ink text, a gradient title bar. */
export const WINDOW = { body: COLORS.face, ink: COLORS.ink, barFrom: COLORS.purple, barTo: COLORS.hotPink, barText: COLORS.white } as const

/** A window in a kit part's glow slot when the place is closed: dark glass. */
export const DARK_GLOW = '#3a2a6a'

/**
 * Fixed hex colours in `kit/parts.json` (plants, glass, stone) painted over by the look. The kit's file keeps its ids and values; a
 * hex that is not listed here is used as it is, and a test checks that every one in the kit is listed.
 */
export const KIT_REPAINT: Record<string, string> = {
  '#bfe3f0': '#9ff3ff',
  '#2a3340': '#3a2a6a',
  '#7a5a3a': '#a06bff',
  '#6b4a2f': '#8f5bff',
  '#5cab5c': '#ff71ce',
  '#5a9a45': '#ff6ad5',
  '#4f9a4f': '#d94fd0',
  '#f2f2f2': '#ffffff',
  '#efe6d2': '#f4f0ff',
  '#e8c547': '#fff27a',
  '#e07a9a': '#ff6ad5',
  '#d8b98a': '#ffd6f1',
  '#c8503c': '#ff3fa4',
  '#a0a0a0': '#d8d8ff',
  '#93949a': '#d8d8ff',
  '#8d8d8d': '#d8d8ff',
  '#8a6ad8': '#8c1eff',
  '#7f8085': '#c9c6ff',
  '#6aaa55': '#ff71ce',
  '#52a05c': '#ff6ad5',
  '#468a5b': '#d94fd0',
  '#3f8a4a': '#d94fd0',
  '#3a7a50': '#b967ff',
  '#2f6b45': '#8f5bff',
}

/** A kit part's fixed colour as the look paints it. */
export const repaint = (hex: string): string => KIT_REPAINT[hex.toLowerCase()] ?? hex
