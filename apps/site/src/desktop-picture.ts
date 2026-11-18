import { Resvg } from '@resvg/resvg-js'

/**
 * The share picture of the site (look L4b): Merge 95 as a 1200 by 630 picture, the desktop with Merge in its window. Drawn from shapes
 * only, so it needs no font and no network: the sunset with its striped sun and grid floor, a window with a gradient title bar, and
 * Merge's monitor face in it, pixel by pixel. The page's own title and description go in the share tags beside it.
 */
/** A tiny pixel font (5 by 7) for the letters and numbers of "MERGE 95", so the picture needs no font. */
const FONT: Record<string, string[]> = {
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.####'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
}

function pixelText(text: string, x: number, y: number, cell: number, fill: string): string {
  let at = x
  const out: string[] = []
  for (const ch of text) {
    const glyph = FONT[ch]
    if (glyph) glyph.forEach((row, r) => [...row].forEach((v, c) => v === '#' && out.push(`<rect x="${at + c * cell}" y="${y + r * cell}" width="${cell}" height="${cell}" fill="${fill}"/>`)))
    at += (glyph ? 6 : 4) * cell
  }
  return out.join('')
}

export function desktopPictureSvg(): string {
  const px = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
  const grid: string[] = []
  for (let k = 0; k <= 20; k++) grid.push(`<line x1="${600 + (k - 10) * 28}" y1="430" x2="${600 + (k - 10) * 140}" y2="630" stroke="#ff40d1" stroke-width="2" opacity="0.8"/>`)
  for (const y of [445, 465, 492, 528, 575]) grid.push(`<line x1="0" y1="${y}" x2="1200" y2="${y}" stroke="#ff40d1" stroke-width="2" opacity="0.8"/>`)
  // The face on the screen: 16 by 12 big pixels of 13.
  const C = 13
  const face = ['..............', '..####..####..', '..####..####..', '..####..####..', '..####..####..', '..............', '...#........#.', '....########..']
  const rects = face.flatMap((row, r) => [...row].map((ch, c) => (ch === '#' ? px(468 + c * C, 232 + r * C, C, C, '#39ff88') : ''))).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" shape-rendering="crispEdges">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b0b5e"/><stop offset="0.35" stop-color="#8c1eff"/><stop offset="0.7" stop-color="#ff3fa4"/><stop offset="1" stop-color="#ffb36b"/></linearGradient>
<linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8c1eff"/><stop offset="1" stop-color="#ff3fa4"/></linearGradient>
</defs>
<rect width="1200" height="430" fill="url(#sky)"/>
<clipPath id="above"><rect width="1200" height="430"/></clipPath>
<clipPath id="sun"><circle cx="600" cy="430" r="300"/></clipPath>
<g clip-path="url(#above)"><circle cx="600" cy="430" r="300" fill="#fff27a"/><g clip-path="url(#sun)">
<rect x="300" y="250" width="600" height="14" fill="#ff3fa4"/><rect x="300" y="300" width="600" height="20" fill="#ff3fa4"/><rect x="300" y="360" width="600" height="28" fill="#ff3fa4"/></g></g>
<rect y="430" width="1200" height="200" fill="#2b0b5e"/>
${grid.join('')}
${px(380, 70, 440, 370, '#1a0b3b')}
${px(384, 74, 432, 362, '#ffd6f1')}
${px(384, 74, 432, 40, 'url(#bar)')}
${px(752, 84, 16, 20, '#ffd6f1')}${px(774, 84, 16, 20, '#ffd6f1')}${px(796, 84, 16, 20, '#ffd6f1')}
${px(440, 150, 320, 270, '#ffc9a8')}
${px(456, 166, 288, 238, '#04140b')}
${rects}
${px(430, 120, 36, 40, '#3a5cff')}${px(734, 120, 36, 40, '#3a5cff')}
${px(0, 586, 1200, 44, '#ffd6f1')}${px(0, 584, 1200, 4, '#8c1eff')}
${px(10, 591, 214, 32, '#ffd6f1')}${px(10, 591, 214, 3, '#ffffff')}${px(10, 620, 214, 3, '#1a0b3b')}${px(221, 591, 3, 32, '#1a0b3b')}
${px(22, 598, 10, 10, '#ff3fa4')}${px(33, 598, 10, 10, '#01cdfe')}${px(22, 609, 10, 8, '#fff27a')}${px(33, 609, 10, 8, '#39ff88')}
${pixelText('MERGE 95', 56, 598, 3, '#1a0b3b')}
</svg>
`
}

/** The picture as a PNG, which every platform reads (an SVG is not accepted for link previews on most). */
export function desktopPicturePng(): Buffer {
  return Buffer.from(new Resvg(desktopPictureSvg()).render().asPng())
}
