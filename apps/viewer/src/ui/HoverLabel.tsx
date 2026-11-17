import { useHover } from '../world/hoverStore.ts'
import { useOpenedNote } from '../world/notesStore.ts'
import { usePanel } from '../world/panelStore.ts'

/** The label of whatever the visitor points at: the words Merge put on an exhibit, or a place's sign. */
export function HoverLabel() {
  const hover = useHover()
  const panel = usePanel()
  const note = useOpenedNote()
  // While a panel is open it holds the words, so the hover label steps aside.
  if (!hover || panel.status !== 'closed' || note) return null
  return (
    <div className="win win-hover" role="status" style={{ pointerEvents: 'none' }}>
      <div className="win-title">
        <span>{hover.title}</span>
      </div>
      <div className="win-body">{hover.text}</div>
    </div>
  )
}
