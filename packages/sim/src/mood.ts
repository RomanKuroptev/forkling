/**
 * Mood and energy (spec 3.2): two numbers from -1 to 1 that replace needs. Each event adds the amounts in the table and
 * the value is clamped. Pure and deterministic. Nothing here picks what the forkling does; the effects are limits that
 * code enforces (`tiredLimits`), and the words are shown to the model as information, never as instructions.
 */

export type MoodEvent = 'souvenirKept' | 'buildAccepted' | 'buildFailed' | 'noteFound' | 'nothingMadeToday' | 'stepCompleted'

export interface MoodState {
  mood: number
  energy: number
}

/** Mood change and energy change for each event. */
export const MOOD_EVENTS: Record<MoodEvent, { mood: number; energy: number }> = {
  souvenirKept: { mood: 0.1, energy: 0 },
  /** An expand, found or tinker that passed its checks. */
  buildAccepted: { mood: 0.2, energy: 0.1 },
  /** An expand, found or tinker that failed validation. */
  buildFailed: { mood: -0.2, energy: -0.1 },
  noteFound: { mood: 0.05, energy: 0 },
  /** A day ends with no file from tend, expand, found, tinker or write. */
  nothingMadeToday: { mood: -0.1, energy: 0 },
  stepCompleted: { mood: 0, energy: -0.05 },
}

/** Valence from bad (-1) to good (1) and arousal from calm (0) to wound up (1): what the body's drift takes in. Made from mood and energy. */
export interface Feelings {
  valence: number
  arousal: number
}

export const INITIAL_MOOD: MoodState = { mood: 0, energy: 0.5 }

/** Energy under this limits the day (spec 3.2). */
export const TIRED_BELOW = -0.5
/** Mood under this at wake, on 3 days in a row, is the spiral warning. */
export const SPIRAL_BELOW = -0.6
export const SPIRAL_DAYS = 3

/** Rounded so a long run of events does not drift from floating point. */
const tidy = (x: number) => Math.max(-1, Math.min(1, Math.round(x * 1000) / 1000))

export function applyMoodEvent(state: MoodState, event: MoodEvent, count = 1): MoodState {
  const d = MOOD_EVENTS[event]
  return { mood: tidy(state.mood + d.mood * count), energy: tidy(state.energy + d.energy * count) }
}

/** At wake, mood moves 20% toward 0 and energy is set to +0.5. */
export function wakeMood(state: MoodState): MoodState {
  return { mood: tidy(state.mood * 0.8), energy: 0.5 }
}

export interface TiredLimits {
  /** The most steps a plan may hold, or null for no limit besides the plan's own. */
  maxSteps: number | null
  /** Whether expand, found and tinker may be planned. */
  allowBuilds: boolean
}

/** Energy under -0.5: at most 4 steps, and no expand, found or tinker that day. */
export function tiredLimits(state: MoodState): TiredLimits {
  return state.energy < TIRED_BELOW ? { maxSteps: 4, allowBuilds: false } : { maxSteps: null, allowBuilds: true }
}

/** "low, tired": how the decide and step calls are told how it feels. */
export function moodWords(state: MoodState): string {
  const m = state.mood
  const mood = m <= SPIRAL_BELOW ? 'very low' : m < -0.2 ? 'low' : m < 0.2 ? 'steady' : m < 0.6 ? 'good' : 'very good'
  const e = state.energy
  const energy = e > 0.3 ? 'rested' : e > -0.1 ? 'steady' : e >= TIRED_BELOW ? 'tired' : 'exhausted'
  return `${mood}, ${energy}`
}

/** The mood at each wake, oldest first: true when the latest 3 are all under -0.6. */
export function inSpiral(wakeMoods: readonly number[]): boolean {
  const last = wakeMoods.slice(-SPIRAL_DAYS)
  return last.length === SPIRAL_DAYS && last.every((m) => m < SPIRAL_BELOW)
}
