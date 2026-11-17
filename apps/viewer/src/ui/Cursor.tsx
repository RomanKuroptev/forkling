import { COLORS } from '../world/theme.ts'
import { cursorKind } from '../player/look.ts'
import { useOpenedNote } from '../world/notesStore.ts'
import { useHover } from '../world/hoverStore.ts'
import { usePanel } from '../world/panelStore.ts'

const INK = COLORS.ink

/** The visitor is the cursor: a white arrow in the middle of the screen, the hand when what it points at can be opened. */
export function Cursor() {
  const hover = useHover()
  const panel = usePanel()
  const note = useOpenedNote()
  const kind = cursorKind({ hovering: hover !== null, panelOpen: panel.status !== 'closed' || note !== null })
  if (kind === 'none') return null
  return (
    <div className="cursor" data-kind={kind} aria-hidden="true">
      {kind === 'arrow' ? (
        <svg width="24" height="24" viewBox="0 0 12 12" shapeRendering="crispEdges">
          <path d="M1 1 L1 10 L3.5 7.5 L5.5 11 L7 10.2 L5 6.8 L8.5 6.8 Z" fill="white" stroke={INK} strokeWidth="1" strokeLinejoin="miter" />
        </svg>
      ) : (
        <svg width="24" height="24" viewBox="0 0 12 12" shapeRendering="crispEdges">
          <path
            d="M4 1 H5.5 V5 H6.2 V4 H7.6 V5 H8.4 V4.4 H9.8 V5.4 H10.6 V9 L9 11 H5 L2.5 7.5 L3.4 6.8 L4 7.4 Z"
            fill="white"
            stroke={INK}
            strokeWidth="0.8"
            strokeLinejoin="miter"
          />
        </svg>
      )}
    </div>
  )
}
