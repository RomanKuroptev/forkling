/** The bottom bar of Merge's desktop: the start button, with its little window logo, and the key hints. */
export function Taskbar({ hint, touch }: { hint: string; touch: boolean }) {
  return (
    <div className={touch ? 'taskbar taskbar-touch' : 'taskbar'} role="status">
      <span className="taskbar-start">
        <span className="taskbar-logo" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        Merge 95
      </span>
      <span className="taskbar-hint">{hint}</span>
    </div>
  )
}
