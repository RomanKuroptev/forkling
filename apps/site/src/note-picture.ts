import { Resvg } from '@resvg/resvg-js'
import { esc } from './md.ts'

/** Words wrapped to lines of at most `width` characters; text that needs more than `maxLines` is cut with an ellipsis on the last line. */
export function wrapLines(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.length > width ? `${word.slice(0, width - 1)}…` : word
    if (line && line.length + 1 + w.length > width) {
      lines.push(line)
      line = w
    } else line = line ? `${line} ${w}` : w
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1]!
  kept[maxLines - 1] = `${last.length >= width ? last.slice(0, width - 1) : last}…`
  return kept
}

export interface ThreadPictureInput {
  name: string
  message: string
  reply: string
  /** The public address, without a scheme if it is shown plain, like `merge.example`. */
  address: string
}

/**
 * The picture a visitor can share (sharing S5): the visitor's note, Merge's reply, the name they gave and the address, as one SVG of
 * 1200 by 630 made by the site build with no model and no network. Every word is escaped. A page that links it in the share tags
 * (see `render.ts`) lets a platform that does not read SVG fall back to the page; the look of it is lane D's to restyle.
 */
export function threadPicture(i: ThreadPictureInput): string {
  const text = (lines: readonly string[], x: number, y: number, size: number, fill: string) =>
    lines.map((l, n) => `<text x="${x}" y="${y + n * Math.round(size * 1.35)}" font-size="${size}" fill="${fill}">${esc(l)}</text>`).join('')
  const who = i.name.trim() || 'A visitor'
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" font-family="system-ui, sans-serif">',
    '<rect width="1200" height="630" fill="#1c1b22"/>',
    '<rect x="40" y="40" width="1120" height="550" rx="16" fill="#26252e" stroke="#4a4858" stroke-width="2"/>',
    text([`${who} left a note`], 80, 100, 26, '#a9a6bd'),
    text(wrapLines(i.message, 50, 4), 80, 150, 32, '#ece9f7'),
    text(['Merge replied'], 80, 330, 26, '#a9a6bd'),
    text(wrapLines(i.reply, 50, 5), 80, 380, 32, '#f6d78b'),
    text([i.address], 80, 565, 24, '#a9a6bd'),
    '</svg>',
    '',
  ].join('\n')
}

/**
 * The picture as a PNG of 1200 by 630, which is what link previews read (og:image). Rendered by a pure renderer in the site build, no browser,
 * with the system's sans-serif fonts. Null when it cannot be rendered, so the page falls back to the SVG.
 */
export function pictureToPng(svg: string): Buffer | null {
  try {
    return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' } }).render().asPng())
  } catch {
    return null
  }
}
