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

export const LAND = { grass: COLORS.teal, darkGrass: '#5fd0e8', meadow: '#a6f0df' } as const

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
export const EXHIBIT = { brass: '#ffe08a', paper: COLORS.face, dust: '#d8d8ff', web: '#f5f0ff', vine: '#19c6a6', leaf: COLORS.green } as const

/** Marks left by visitors' notes, by state. */
export const NOTE_PAPER = { new: '#fff7d6', found: '#fff27a', replied: '#ff9ad8', kept: '#9ff3ff', declined: '#ff7a9a' } as const
export const NOTE_POST = '#4a2a8a'

/** Merge's screen: terminal green on near black. */
export const SCREEN = { on: COLORS.green, off: '#04140b' } as const

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
