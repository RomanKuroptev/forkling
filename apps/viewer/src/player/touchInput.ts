import type { MovementInput } from 'ecctrl'

/** A push shorter than this is a resting thumb, not a direction. Stick values run from 0 to 1. */
export const DEAD_ZONE = 0.12
/** The far edge of the stick runs; short of it walks. The stick is not analog, so this is the only way to choose. */
export const RUN_THRESHOLD = 0.8

export interface StickState {
  x: number
  y: number
  active: boolean
}

/**
 * The keyboard's movement with the touch controls added: the stick steers, its far edge runs, the Jump button jumps.
 * Pass no stick where there are no touch controls (desktop), and the keyboard's state comes back as it was.
 *
 * With a stick, an idle one is reported as an explicit zero: the character applies only the fields it is sent and
 * remembers the rest, so leaving the stick out after a release would keep it walking the way it was last pushed.
 */
export function mergeMovement(keys: MovementInput, stick: StickState | undefined, buttons: { jump?: boolean }): MovementInput {
  const out: MovementInput = { ...keys }
  if (buttons.jump) out.jump = true
  if (!stick) return out
  const reach = Math.hypot(stick.x, stick.y)
  if (stick.active && reach >= DEAD_ZONE) {
    out.joystick = { x: stick.x, y: stick.y }
    if (reach >= RUN_THRESHOLD) out.run = true
  } else {
    out.joystick = { x: 0, y: 0 }
  }
  return out
}
