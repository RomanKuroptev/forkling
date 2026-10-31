import { createFlag } from '../ui/flag.ts'

/** Whether the visitor is within reach of a contraption; the touch button shows while it is. */
export const contraptionNear = createFlag(false)

/** Who is in reach right now. Each contraption reports for itself each frame, so several never overwrite one another. */
export function createReach(flag = contraptionNear) {
  const near = new Set<string>()
  return {
    report(id: string, inReach: boolean) {
      if (inReach) near.add(id)
      else near.delete(id)
      flag.set(near.size > 0)
    },
    forget(id: string) {
      near.delete(id)
      flag.set(near.size > 0)
    },
  }
}
export const reach = createReach()

/** A counter of presses of the touch button, its version of the E key. Every reader keeps its own last-seen count, so one press reaches all of them. */
export function createPress() {
  let presses = 0
  return {
    press() {
      presses += 1
    },
    count: () => presses,
  }
}
export const interactPress = createPress()
