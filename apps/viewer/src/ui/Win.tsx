import type { CSSProperties, ReactNode } from 'react'

/** A window on Merge's desktop: a title bar with a name and three buttons (the last one closes), and a face-coloured body. */
export function Win({ title, onClose, className = '', style, label, children }: { title: string; onClose?: () => void; className?: string; style?: CSSProperties; label?: string; children: ReactNode }) {
  return (
    <div className={`win ${className}`} role="dialog" aria-label={label ?? title} style={style}>
      <div className="win-title">
        <span>{title}</span>
        <span className="win-buttons">
          <i aria-hidden="true" />
          <i aria-hidden="true" />
          {onClose ? <button type="button" className="win-close" aria-label="Close" onClick={onClose} /> : <i aria-hidden="true" />}
        </span>
      </div>
      <div className="win-body">{children}</div>
    </div>
  )
}
