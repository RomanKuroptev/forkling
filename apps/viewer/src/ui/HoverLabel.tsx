import { useHover } from '../world/hoverStore.ts'

/** The label of whatever the visitor points at: the words Merge put on an exhibit, or a place's sign. */
export function HoverLabel() {
  const hover = useHover()
  if (!hover) return null
  return (
    <div
      className="hud"
      style={{ top: 16, bottom: 'auto', left: '50%', transform: 'translateX(-50%)', maxWidth: 'min(560px, 90vw)', textAlign: 'center', pointerEvents: 'none' }}
    >
      <strong>{hover.title}</strong>
      <div>{hover.text}</div>
    </div>
  )
}
