import { esc } from './md.ts'
import { wrapLines, pictureToPng } from './note-picture.ts'

/**
 * The picture a link preview or a saved card shows (sharing S2 and S3): a Merge 95 window with the thing's own picture, a title bar line,
 * Merge's caption and the address in a strip at the bottom. 1200 by 630. Made by the site build from files the world repo already has,
 * with no model and no network. Every word is escaped; the picture is embedded as a data address so the renderer needs no file access.
 */
export interface SharePictureInput {
  /** The title bar line, like `Today Merge`. */
  heading: string
  /** Merge's caption (up to a few lines are shown). */
  caption: string
  /** The public address without a scheme, shown in the strip at the bottom. */
  address: string
  /** The picture, as PNG bytes; left out, the window shows a plain screen. */
  image?: Buffer | null
}

const isPng = (b: Buffer) => b.length > 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG'

export function sharePictureSvg(i: SharePictureInput): string {
  const lines = wrapLines(i.caption, 22, 8)
  const text = lines.map((l, n) => `<text x="700" y="${170 + n * 42}" font-size="30" fill="#1a0b3b">${esc(l)}</text>`).join('')
  const picture = i.image && isPng(i.image) ? `<image x="100" y="120" width="520" height="370" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${i.image.toString('base64')}"/>` : ''
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" font-family="system-ui, sans-serif">',
    '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b0b5e"/><stop offset="0.55" stop-color="#8c1eff"/><stop offset="1" stop-color="#ff3fa4"/></linearGradient>',
    '<linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8c1eff"/><stop offset="1" stop-color="#ff3fa4"/></linearGradient>',
    '<clipPath id="pic"><rect x="100" y="120" width="520" height="370"/></clipPath></defs>',
    '<rect width="1200" height="630" fill="url(#sky)"/>',
    '<g stroke="#ff40d1" stroke-width="2" opacity="0.6"><line x1="0" y1="560" x2="1200" y2="560"/><line x1="0" y1="590" x2="1200" y2="590"/><line x1="0" y1="615" x2="1200" y2="615"/></g>',
    '<rect x="60" y="30" width="1080" height="520" fill="#1a0b3b"/>',
    '<rect x="64" y="34" width="1072" height="512" fill="#ffd6f1"/>',
    '<rect x="64" y="34" width="1072" height="50" fill="url(#bar)"/>',
    `<text x="84" y="70" font-size="30" font-weight="bold" fill="#ffffff">${esc(i.heading)}</text>`,
    '<rect x="1056" y="46" width="20" height="26" fill="#ffd6f1"/><rect x="1084" y="46" width="20" height="26" fill="#ffd6f1"/><rect x="1112" y="46" width="16" height="26" fill="#ffd6f1"/>',
    '<rect x="96" y="116" width="528" height="378" fill="#1a0b3b"/>',
    '<rect x="100" y="120" width="520" height="370" fill="#2b0b5e"/>',
    `<g clip-path="url(#pic)">${picture}</g>`,
    text,
    `<rect x="64" y="500" width="1072" height="46" fill="#ffd6f1"/><rect x="64" y="498" width="1072" height="4" fill="#8c1eff"/>`,
    `<text x="700" y="530" font-size="26" fill="#5a2fa8">${esc(i.address)}</text>`,
    '</svg>',
    '',
  ].join('\n')
}

/** The share picture as a PNG; null when it cannot be rendered (the page then falls back to the desktop picture). */
export const sharePicturePng = (i: SharePictureInput): Buffer | null => pictureToPng(sharePictureSvg(i))
