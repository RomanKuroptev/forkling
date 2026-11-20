/**
 * The pixel icons of Merge's desktop (look L4b): each is 8 by 8 pixels, written here as text, made into an SVG of 32 by 32 with sharp
 * edges and shown at twice that size with no smoothing. Emoji are not used, because they look different on every phone.
 * `#` ink, `o` face, `p` purple, `h` hot pink, `c` cyan, `s` sun, `g` green, `w` white, `.` nothing.
 */
const COLORS: Record<string, string> = { '#': '#1a0b3b', o: '#ffd6f1', p: '#8c1eff', h: '#ff3fa4', c: '#01cdfe', s: '#fff27a', g: '#39ff88', w: '#ffffff' }

export const ICONS: Record<string, readonly string[]> = {
  home: ['...hh...', '..hhhh..', '.hhhhhh.', 'hhhhhhhh', '.oo##oo.', '.oo##oo.', '.oo##oo.', '.oooooo.'],
  journal: ['.######.', '#pppppp#', '#p####p#', '#pppppp#', '#p####p#', '#pppppp#', '#pppppp#', '.######.'],
  notebook: ['#.#.#.#.', '########', '#oooooo#', '#o####o#', '#oooooo#', '#o####o#', '#oooooo#', '########'],
  obsessions: ['.hh..hh.', 'hhhhhhhh', 'hhhhhhhh', 'hhhhhhhh', '.hhhhhh.', '..hhhh..', '...hh...', '........'],
  notes: ['########', '#oooooo#', '##oooo##', '#o#oo#o#', '#oo##oo#', '#oooooo#', '########', '........'],
  workshop: ['..#..#..', '.######.', '##cccc##', '#cc##cc#', '#cc##cc#', '##cccc##', '.######.', '..#..#..'],
  underthehood: ['.######.', '#pppppp#', '#p#..#p#', '#p.##.p#', '#p.##.p#', '#p#..#p#', '#pppppp#', '.######.'],
  why: ['.######.', '##pppp##', '#pp..pp#', '....pp..', '...pp...', '...pp...', '........', '...pp...'],
  places: ['..hhhh..', '.hhhhhh.', '.hh##hh.', '.hhhhhh.', '..hhhh..', '...hh...', '...hh...', '........'],
  projects: ['###.....', '#ss####.', '#ssssss#', '#ssssss#', '#ssssss#', '#ssssss#', '########', '........'],
  requests: ['...ss...', '...ss...', 'ssssssss', '.ssssss.', '..ssss..', '.ss..ss.', 'ss....ss', '........'],
  trails: ['.gg..gg.', '.gg..gg.', '........', '..gg..gg', '..gg..gg', '........', 'gg......', 'gg......'],
  about: ['..oooo..', '.o#oo#o.', '.oooooo.', '..#oo#..', '..####..', '.######.', '########', '........'],
  page: ['########', '#hhhhhh#', '########', '#oooooo#', '#o####o#', '#oooooo#', '########', '........'],
  gallery: ['########', '#cccccc#', '#c#cc#c#', '#cchhcc#', '#cchhhc#', '#cccccc#', '########', '........'],
  archive: ['########', '#hhhhhh#', '########', '#oooooo#', '#oo##oo#', '#oooooo#', '########', '........'],
  /** An old save file: a floppy disk, for the window of the forkling's first life (`<name> v1`). */
  oldsave: ['#######.', '#c#ww#c#', '#c####c#', '#cccccc#', '#owwwwo#', '#ow##wo#', '#owwwwo#', '########'],
}

/** The icon for a page's name in the navigation (`Why?` is `why`, `Merge v1` the old save file); a window for a page with no picture of its own. */
export function iconFor(label: string): string {
  if (/ v1$/i.test(label)) return 'oldsave'
  const key = label.toLowerCase().replace(/[^a-z]/g, '')
  return key in ICONS ? key : 'page'
}

/** One icon as an SVG: a rectangle for each pixel, 4 by 4 in a 32 by 32 picture, with sharp edges. */
export function iconSvg(name: string): string {
  const rows = ICONS[name] ?? ICONS.page!
  const rects = rows.flatMap((row, y) => [...row].map((ch, x) => (COLORS[ch] ? `<rect x="${x * 4}" y="${y * 4}" width="4" height="4" fill="${COLORS[ch]}"/>` : ''))).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges">${rects}</svg>\n`
}

/** The red error badge of Merge 95's windows: a circle with a pixel x. */
export function errorIconSvg(): string {
  const px = (x: number, y: number) => `<rect x="${x * 2}" y="${y * 2}" width="2" height="2" fill="#ffffff"/>`
  const cross = Array.from({ length: 6 }, (_, i) => px(4 + i, 4 + i) + px(9 - i, 4 + i)).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" shape-rendering="crispEdges"><circle cx="14" cy="14" r="13" fill="#e0245e" stroke="#1a0b3b" stroke-width="2"/>${cross}</svg>\n`
}

/** Merge asleep: the monitor with flat closed eyes and a small z, for the NO SIGNAL screen. */
export function asleepFaceSvg(): string {
  const p = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges">${[
    p(4, 2, 4, 4, '#3a5cff'),
    p(24, 2, 4, 4, '#3a5cff'),
    p(2, 6, 28, 22, '#ffc9a8'),
    p(5, 9, 22, 16, '#04140b'),
    p(8, 16, 6, 2, '#39ff88'),
    p(18, 16, 6, 2, '#39ff88'),
    p(22, 10, 4, 1, '#39ff88'),
    p(24, 11, 1, 1, '#39ff88'),
    p(22, 12, 4, 1, '#39ff88'),
  ].join('')}</svg>\n`
}

/** Merge's monitor face, the favicon: a peach monitor with ears and a green smile on a dark screen, 32 by 32. */
export function faviconSvg(): string {
  const p = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges">${[
    p(4, 2, 4, 4, '#3a5cff'),
    p(24, 2, 4, 4, '#3a5cff'),
    p(2, 6, 28, 22, '#ffc9a8'),
    p(5, 9, 22, 16, '#04140b'),
    p(9, 12, 4, 5, '#39ff88'),
    p(19, 12, 4, 5, '#39ff88'),
    p(11, 20, 10, 2, '#39ff88'),
    p(9, 19, 2, 2, '#39ff88'),
    p(21, 19, 2, 2, '#39ff88'),
  ].join('')}</svg>\n`
}
