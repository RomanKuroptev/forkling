/** The states Merge's face shows, from what the viewer already has. Never a feeling the mind did not report. */
export type FaceState = 'awake' | 'step' | 'asleep' | 'nosignal'

export const FACE_COLS = 16
export const FACE_ROWS = 12

/** No signal wins (old data says nothing true about the rest), then asleep, then a step in progress, else awake between steps. */
export function faceState(s: { stale: boolean; asleep: boolean; inStep: boolean }): FaceState {
  if (s.stale) return 'nosignal'
  if (s.asleep) return 'asleep'
  return s.inStep ? 'step' : 'awake'
}

const blank = (): string[][] => Array.from({ length: FACE_ROWS }, () => Array.from({ length: FACE_COLS }, () => '.'))
const set = (g: string[][], col: number, row: number, w = 1, h = 1) => {
  for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) if (r >= 0 && r < FACE_ROWS && c >= 0 && c < FACE_COLS) g[r]![c] = '#'
}

/** One frame of a face as 12 rows of 16 characters, `#` lit and `.` dark. `t` is seconds: it makes the blink, the dots and the drifting z. */
export function faceGrid(state: FaceState, t: number): string[] {
  const g = blank()
  if (state === 'awake') {
    // A blink every few seconds: for a moment the eyes are one pixel tall.
    const blinking = t % 4 > 3.85
    set(g, 3, blinking ? 4 : 3, 3, blinking ? 1 : 3)
    set(g, 10, blinking ? 4 : 3, 3, blinking ? 1 : 3)
    set(g, 4, 8)
    set(g, 11, 8)
    set(g, 5, 9, 6, 1)
  } else if (state === 'step') {
    // The same eyes looking down, and three dots that fill one by one.
    set(g, 3, 4, 3, 3)
    set(g, 10, 4, 3, 3)
    set(g, 4, 6)
    set(g, 11, 6)
    const filled = Math.floor(t * 1.5) % 4
    for (let k = 0; k < filled; k++) set(g, 4 + k * 3, 10, 2, 1)
  } else if (state === 'asleep') {
    set(g, 3, 6, 4, 1)
    set(g, 9, 6, 4, 1)
    // A z drifts up and fades out, then another starts.
    const phase = (t * 0.5) % 1
    const row = Math.round(5 - phase * 4)
    if (phase < 0.85) {
      set(g, 12, row, 3, 1)
      set(g, 14, row + 1)
      set(g, 13, row + 2)
      set(g, 12, row + 3)
      set(g, 12, row + 4, 3, 1)
    }
  } else {
    // Two x eyes; the viewer writes NO SIGNAL under them.
    for (const col of [3, 10]) {
      set(g, col, 2)
      set(g, col + 2, 2)
      set(g, col + 1, 3)
      set(g, col, 4)
      set(g, col + 2, 4)
    }
  }
  return g.map((row) => row.join(''))
}
