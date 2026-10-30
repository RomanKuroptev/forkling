import type { Playback } from '@forkling/sim'

/** The forkling's live playback, for the debug overlay and browser tests. Written by the render loop. */
export const live: { playback: Playback | null } = { playback: null }
