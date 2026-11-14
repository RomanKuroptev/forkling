import { debugEnabled } from '../debugEnabled.ts'
import { createFlag } from '../ui/flag.ts'

/** Whether the mind overlay is open. It is a debug tool: only `?debug` opens it, and F3 and the touch button work only then. */
export const debugOpen = createFlag(typeof location !== 'undefined' && debugEnabled(location.search))
