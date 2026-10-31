import { createFlag } from '../ui/flag.ts'

/** Whether the mind overlay is open: F3 and the touch button toggle it, and `?debug` starts it open. */
export const debugOpen = createFlag(typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'))
