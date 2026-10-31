import { MAX_SVG_CHARS } from '@forkling/schema'

/**
 * A drawing is SVG that a model wrote and a visitor's browser will show, so it is never passed through: it is read into
 * tokens and written out again from allowlists of elements and attributes. Anything that can run, load or link is gone.
 * Pure.
 */

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan', 'title', 'desc', 'linearGradient', 'radialGradient', 'stop', 'clipPath',
])
/** Elements whose content goes with them. */
const DROPPED_WITH_CONTENT = new Set(['script', 'style', 'foreignobject'])
const TEXT_PARENTS = new Set(['text', 'tspan', 'title', 'desc'])
const DRAWN = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text'])

const ATTRIBUTES = [
  'id', 'viewBox', 'xmlns', 'preserveAspectRatio', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'width', 'height', 'd', 'points', 'transform',
  'gradientTransform', 'gradientUnits', 'offset', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'stop-color', 'stop-opacity', 'font-size', 'font-weight', 'text-anchor', 'dx', 'dy', 'clip-path', 'clipPathUnits',
]
const ATTRIBUTE_BY_LOWER = new Map(ATTRIBUTES.map((a) => [a.toLowerCase(), a]))

/** Letters, digits, spaces and the punctuation numbers, colours, paths and transforms are made of. No quotes, no angle brackets. */
const SAFE_VALUE = /^[\w\s#%.,;:()\-+/]*$/
const DEFAULT_VIEWBOX = '0 0 100 100'

function safeValue(name: string, value: string): boolean {
  if (!SAFE_VALUE.test(value) || /javascript|data:|expression|vbscript/i.test(value)) return false
  // A reference may point inside the drawing, never out of it.
  for (const m of value.matchAll(/url\(\s*([^)]*)\)/gi)) if (!m[1]!.trim().startsWith('#')) return false
  if (name === 'xmlns') return value === 'http://www.w3.org/2000/svg'
  return true
}

const escapeText = (text: string) => text.replace(/&(?!(?:lt|gt|amp|quot|apos);)/g, '&amp;').replace(/>/g, '&gt;')

function cleanAttributes(raw: string, root: boolean): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of raw.matchAll(/([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const name = ATTRIBUTE_BY_LOWER.get(m[1]!.toLowerCase())
    const value = (m[2] ?? m[3] ?? m[4] ?? '').trim()
    if (!name || seen.has(name) || !safeValue(name, value)) continue
    // A drawing scales to wherever it hangs, so the root takes no fixed size.
    if (root && (name === 'width' || name === 'height')) continue
    seen.add(name)
    out.push(`${name}="${value}"`)
  }
  return out
}

const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[!?][^>]*>|<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)|</g

/** The drawing rewritten from safe parts only, or null if it isn't an SVG, has nothing in it, or is too big. */
export function sanitizeSvg(source: string): string | null {
  if (source.length === 0 || source.length > MAX_SVG_CHARS * 2) return null
  const out: string[] = []
  const stack: string[] = []
  let skip: { name: string; depth: number } | null = null
  let drew = false
  let haveRoot = false

  for (const m of source.matchAll(TOKEN)) {
    const [, closing, rawName, rawAttrs, selfClosing, text] = m
    if (text !== undefined) {
      if (!skip && stack.length > 0 && TEXT_PARENTS.has(stack[stack.length - 1]!)) out.push(escapeText(text))
      continue
    }
    if (rawName === undefined) continue
    const lower = rawName.toLowerCase()

    if (skip) {
      if (lower === skip.name) {
        if (closing) skip.depth -= 1
        else if (!selfClosing) skip.depth += 1
        if (skip.depth === 0) skip = null
      }
      continue
    }
    if (DROPPED_WITH_CONTENT.has(lower)) {
      if (!closing && !selfClosing) skip = { name: lower, depth: 1 }
      continue
    }

    const name = [...ELEMENTS].find((e) => e.toLowerCase() === lower)
    if (!name) continue // an element it doesn't know goes, its children stay
    if (closing) {
      const at = stack.lastIndexOf(name)
      if (at === -1) continue
      while (stack.length > at) out.push(`</${stack.pop()}>`)
      continue
    }
    if (name === 'svg') {
      if (haveRoot) continue
      haveRoot = true
    } else if (!haveRoot) {
      continue
    }
    const attrs = cleanAttributes(rawAttrs ?? '', name === 'svg')
    if (name === 'svg' && !attrs.some((a) => a.startsWith('viewBox='))) attrs.unshift(`viewBox="${DEFAULT_VIEWBOX}"`)
    if (DRAWN.has(name)) drew = true
    out.push(`<${name}${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}${selfClosing ? '/' : ''}>`)
    if (!selfClosing) stack.push(name)
  }
  while (stack.length > 0) out.push(`</${stack.pop()}>`)

  const svg = out.join('')
  return haveRoot && drew && svg.length <= MAX_SVG_CHARS ? svg : null
}
