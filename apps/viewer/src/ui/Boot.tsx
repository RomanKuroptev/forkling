const BLOCKS = 12

/** The boot screen: Merge 95 on the sunset wallpaper and a blocky progress bar (`progress` 0 to 100, or none while it is not known). */
export function Boot({ progress, note }: { progress?: number; note: string }) {
  const lit = progress === undefined ? 0 : Math.round((Math.min(100, Math.max(0, progress)) / 100) * BLOCKS)
  return (
    <div className="loading boot" role="status">
      <div className="boot-sun" aria-hidden="true" />
      <div className="boot-title">Merge 95</div>
      <div className={progress === undefined ? 'boot-bar boot-bar-wait' : 'boot-bar'} aria-hidden="true">
        {Array.from({ length: BLOCKS }, (_, i) => (
          <i key={i} className={i < lit ? 'on' : ''} />
        ))}
      </div>
      <div className="boot-note">{note}</div>
    </div>
  )
}
