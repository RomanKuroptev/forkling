import { Joystick, VirtualButton } from 'ecctrl/input'
import { useSyncExternalStore } from 'react'
import { bubbleHidden } from '../forkling/bubbleHidden.ts'
import { debugOpen } from '../forkling/debugOpen.ts'
import { JOYSTICK_RADIUS } from '../touch.ts'
import { contraptionNear, interactPress } from '../world/interact.ts'

/** Keeps the controls clear of a notch or the home bar. */
const inset = (side: 'left' | 'right' | 'bottom' | 'top', px: number) => `calc(${px}px + env(safe-area-inset-${side}, 0px))`

/**
 * The touch controls, shown only on a touch device: a stick to walk (its far edge runs), a Jump button, a button to set
 * off a contraption that appears only when one is within reach, and a button for the mind overlay. Dragging anywhere else
 * turns the camera, and pinching zooms (see `Player`).
 */
export function TouchControls() {
  const near = useSyncExternalStore(contraptionNear.subscribe, contraptionNear.get)
  const mindOpen = useSyncExternalStore(debugOpen.subscribe, debugOpen.get)
  const textHidden = useSyncExternalStore(bubbleHidden.subscribe, bubbleHidden.get)

  return (
    <div className="touch-controls">
      <Joystick
        joystickMaxRadius={JOYSTICK_RADIUS}
        joystickWrapperStyle={{ position: 'fixed', left: inset('left', 12), bottom: inset('bottom', 12) }}
      />
      <VirtualButton
        id="jump"
        label="Jump"
        buttonWrapperStyle={{ position: 'fixed', right: inset('right', 20), bottom: inset('bottom', 36) }}
        buttonCapStyle={{ color: '#1f2d38', fontWeight: 700 }}
      />
      {near && (
        <button
          type="button"
          className="touch-action"
          style={{ right: inset('right', 96), bottom: inset('bottom', 36) }}
          onPointerDown={(e) => {
            e.stopPropagation()
            interactPress.press()
          }}
        >
          Set it off
        </button>
      )}
      <button
        type="button"
        className="touch-text"
        aria-pressed={textHidden}
        style={{ right: inset('right', 20), bottom: inset('bottom', 112) }}
        onPointerDown={(e) => {
          e.stopPropagation()
          bubbleHidden.toggle()
        }}
      >
        {textHidden ? 'Show text' : 'Hide text'}
      </button>
      <button
        type="button"
        className="touch-mind"
        aria-pressed={mindOpen}
        style={{ right: inset('right', 12), top: inset('top', 12) }}
        onPointerDown={(e) => {
          e.stopPropagation()
          debugOpen.toggle()
        }}
      >
        {mindOpen ? 'Close' : 'Mind'}
      </button>
    </div>
  )
}
