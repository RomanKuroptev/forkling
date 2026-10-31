import { createPersistedFlag } from '../ui/flag.ts'

/** Whether the thought bubble is hidden. The B key and the touch button toggle it, and the choice is remembered. */
export const bubbleHidden = createPersistedFlag('forkling.bubbleHidden', false, typeof localStorage === 'undefined' ? undefined : localStorage)
