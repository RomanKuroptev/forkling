import { SCREEN } from './theme.ts'

/** The pixel font of Merge's screens, with plain monospace while it loads. */
const FONT = '"Press Start 2P", ui-monospace, monospace'

/**
 * A work's title in terminal green on near black, as Merge's own screen shows words: the biggest letters that fit the rectangle
 * in at most `maxLines` lines, centred, with the last line cut with an ellipsis if it still does not fit. Shared by the work
 * screens (`WorkScreens`) and the gallery wall's tiles (`GalleryWalls`).
 */
export function paintTitle(g: CanvasRenderingContext2D, title: string, rect: { x: number; y: number; w: number; h: number }, opts: { pad?: number; maxPx?: number; minPx?: number; maxLines?: number; color?: string; fill?: boolean } = {}): void {
  const pad = opts.pad ?? Math.round(rect.h * 0.09)
  const maxLines = opts.maxLines ?? 4
  const minPx = opts.minPx ?? 10
  if (opts.fill !== false) {
    g.fillStyle = SCREEN.off
    g.fillRect(rect.x, rect.y, rect.w, rect.h)
  }
  g.fillStyle = opts.color ?? SCREEN.on
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const room = rect.w - 2 * pad
  let px = opts.maxPx ?? Math.round(rect.h / 7)
  let lines: string[] = []
  const words = title.split(/\s+/).filter(Boolean)
  // The biggest letters that fit the title in its lines and its height.
  for (; px >= minPx; px -= 2) {
    g.font = `700 ${px}px ${FONT}`
    lines = []
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (g.measureText(next).width <= room || !line) line = next
      else {
        lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
    if (lines.length <= maxLines && lines.length * px * 1.35 <= rect.h - 2 * pad && lines.every((l) => g.measureText(l).width <= room)) break
  }
  px = Math.max(px, minPx)
  if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1]}…`]
  const lead = px * 1.35
  lines.forEach((l, i) => {
    const width = g.measureText(l).width
    g.save()
    g.translate(rect.x + rect.w / 2, rect.y + rect.h / 2 + (i - (lines.length - 1) / 2) * lead)
    g.scale(width > room ? room / width : 1, 1)
    g.fillText(l, 0, 0)
    g.restore()
  })
}
