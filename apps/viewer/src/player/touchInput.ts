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
 * With nothing touched the keyboard's state comes back as it was, so desktop behaves exactly as before.
 */
export function mergeMovement(keys: MovementInput, stick: StickState, buttons: { jump?: boolean }): MovementInput {
  const out: MovementInput = { ...keys }
  if (buttons.jump) out.jump = true
  const reach = Math.hypot(stick.x, stick.y)
  if (stick.active && reach >= DEAD_ZONE) {
    out.joystick = { x: stick.x, y: stick.y }
    if (reach >= RUN_THRESHOLD) out.run = true
  }
  return out
}
