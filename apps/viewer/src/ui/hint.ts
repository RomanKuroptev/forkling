/** The key hints on desktop. F3 (the mind overlay) is a debug tool, so it is named only for `?debug`. */
export function desktopHint(forklingName: string, debug: boolean): string {
  const base = 'WASD / arrows to walk · hold Shift to run · Space to jump · drag to look · scroll to zoom · B hides the thought bubble'
  return debug ? `${base} · F3 for ${forklingName}’s mind` : base
}
