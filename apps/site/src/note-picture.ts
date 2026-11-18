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
  const msg = wrapLines(i.message, 48, 4)
  const reply = wrapLines(i.reply, 46, 5)
  const msgH = 30 + msg.length * 40
  const replyH = 30 + reply.length * 40
  const top = 150
  const replyTop = top + msgH + 28
  // Merge 95: the sunset with its grid floor, one window with a gradient title bar, the visitor's note as a white row and Merge's reply as a pale cyan row a step in.
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" font-family="system-ui, sans-serif">',
    '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b0b5e"/><stop offset="0.5" stop-color="#8c1eff"/><stop offset="0.85" stop-color="#ff3fa4"/><stop offset="1" stop-color="#ffb36b"/></linearGradient>',
    '<linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8c1eff"/><stop offset="1" stop-color="#ff3fa4"/></linearGradient></defs>',
    '<rect width="1200" height="630" fill="url(#sky)"/>',
    '<rect y="500" width="1200" height="130" fill="#2b0b5e"/>',
    '<g stroke="#ff40d1" stroke-width="2" opacity="0.7"><line x1="0" y1="520" x2="1200" y2="520"/><line x1="0" y1="550" x2="1200" y2="550"/><line x1="0" y1="590" x2="1200" y2="590"/></g>',
    '<rect x="60" y="40" width="1080" height="520" fill="#1a0b3b"/>',
    '<rect x="64" y="44" width="1072" height="512" fill="#ffd6f1"/>',
    '<rect x="64" y="44" width="1072" height="46" fill="url(#bar)"/>',
    '<rect x="1060" y="56" width="20" height="22" fill="#ffd6f1"/><rect x="1088" y="56" width="20" height="22" fill="#ffd6f1"/><rect x="1116" y="56" width="16" height="22" fill="#ffd6f1"/>',
    text([`${who} left a note`], 84, 82, 28, '#ffffff'),
    `<rect x="84" y="${top}" width="1032" height="${msgH}" fill="#ffffff" stroke="#1a0b3b" stroke-width="3"/>`,
    text(msg, 104, top + 42, 30, '#1a0b3b'),
    text(['Merge replied'], 114, replyTop - 8, 24, '#5a2fa8'),
    `<rect x="114" y="${replyTop}" width="1002" height="${replyH}" fill="#c9fbff" stroke="#1a0b3b" stroke-width="3"/>`,
    text(reply, 134, replyTop + 42, 30, '#1a0b3b'),
    text([i.address], 84, 535, 24, '#3d2c6b'),
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
