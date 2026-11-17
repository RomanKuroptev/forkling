import { COLORS } from '../world/theme.ts'
import { Joystick, VirtualButton } from 'ecctrl/input'
import { useSyncExternalStore } from 'react'
import { bubbleHidden } from '../forkling/bubbleHidden.ts'
import { debugEnabled } from '../debugEnabled.ts'
import { debugOpen } from '../forkling/debugOpen.ts'
import { JOYSTICK_RADIUS, TASKBAR_H } from '../touch.ts'

/** Keeps the controls clear of a notch or the home bar. */
const inset = (side: 'left' | 'right' | 'bottom' | 'top', px: number) => `calc(${px}px + env(safe-area-inset-${side}, 0px))`

/**
 * The touch controls, shown only on a touch device: a stick to walk (its far edge runs), a Jump button, a button to hide
 * the thought bubble, and a button for the mind overlay. Dragging anywhere else
 * turns the camera, and pinching zooms (see `Player`).
 */
export function TouchControls() {
  const mindOpen = useSyncExternalStore(debugOpen.subscribe, debugOpen.get)
  const textHidden = useSyncExternalStore(bubbleHidden.subscribe, bubbleHidden.get)

  return (
    <div className="touch-controls">
      <Joystick
        joystickMaxRadius={JOYSTICK_RADIUS}
        joystickWrapperStyle={{ position: 'fixed', left: inset('left', 12), bottom: inset('bottom', 12 + TASKBAR_H) }}
      />
      <VirtualButton
        id="jump"
        label="Jump"
        buttonWrapperStyle={{ position: 'fixed', right: inset('right', 20), bottom: inset('bottom', 36 + TASKBAR_H), background: 'transparent', borderRadius: 0, width: 64, height: 48 }}
        buttonCapStyle={{ color: COLORS.ink, fontFamily: 'Press Start 2P, monospace', fontSize: 10, background: COLORS.face, border: `2px solid ${COLORS.ink}`, borderRadius: 0, width: 64, height: 48, boxSizing: 'border-box', boxShadow: `inset 2px 2px 0 ${COLORS.white}, inset -2px -2px 0 ${COLORS.purple}` }}
      />
      <button
        type="button"
        className="touch-text"
        aria-pressed={textHidden}
        style={{ right: inset('right', 20), bottom: inset('bottom', 112 + TASKBAR_H) }}
        onPointerDown={(e) => {
          e.stopPropagation()
          bubbleHidden.toggle()
        }}
      >
        {textHidden ? 'Show text' : 'Hide text'}
      </button>
      {debugEnabled(location.search) && (
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
      )}
    </div>
  )
}
