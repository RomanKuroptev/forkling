/** The bottom bar of Merge's desktop: the start button and the key hints. */
export function Taskbar({ hint, touch }: { hint: string; touch: boolean }) {
  return (
    <div className={touch ? 'taskbar taskbar-touch' : 'taskbar'} role="status">
      <span className="taskbar-start">Merge 95</span>
      <span className="taskbar-hint">{hint}</span>
    </div>
  )
}
