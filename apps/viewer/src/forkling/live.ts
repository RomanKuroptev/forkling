import type { ForklingState } from '@forkling/sim'

/** The forkling's live state, for the debug overlay and browser tests. Written by the render loop. */
export const live: { state: ForklingState | null } = { state: null }
