import * as THREE from 'three'

/** The visitor's view. `yaw` is a heading as the sim counts it (0 looks along +z); `pitch` is up from level. */
export interface Look {
  yaw: number
  pitch: number
}

/** A little short of straight up, so the view never flips over. */
export const MAX_PITCH = Math.PI * 0.47
/** Radians turned per pixel dragged. */
export const LOOK_SPEED = 0.005
/** Pointer movement, in pixels, above which a press was a drag and not a tap. */
export const DRAG_PIXELS = 6

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Dragging right turns right, dragging up looks up. */
export function applyLookDrag(look: Look, dx: number, dy: number): Look {
  return {
    yaw: wrap(look.yaw + dx * LOOK_SPEED),
    pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, look.pitch - dy * LOOK_SPEED)),
  }
}

/** The camera's rotation. A three.js camera looks along -z, a heading of 0 along +z, so yaw is a half turn on. */
export function lookEuler(look: Look): THREE.Euler {
  return new THREE.Euler(look.pitch, look.yaw + Math.PI, 0, 'YXZ')
}

export const wasDrag = (movedPixels: number): boolean => movedPixels > DRAG_PIXELS

export type CursorKind = 'arrow' | 'hand' | 'none'

/** The centre cursor: an arrow, the hand over something that opens, and nothing while a panel covers the view. */
export function cursorKind(s: { hovering: boolean; panelOpen: boolean }): CursorKind {
  if (s.panelOpen) return 'none'
  return s.hovering ? 'hand' : 'arrow'
}
