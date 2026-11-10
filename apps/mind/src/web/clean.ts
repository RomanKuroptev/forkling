import { estimateTokens } from '../budget.ts'

/** The most of one page a read call sees (spec 6.2). */
export const PAGE_TOKENS = 3000

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è', aacute: 'á', oacute: 'ó', uuml: 'ü', ouml: 'ö', auml: 'ä', copy: '©',
}

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole
    }
    return NAMED[code.toLowerCase()] ?? whole
  })
}

/**
 * Plain text from HTML: scripts, styles, navigation and other page furniture removed, tags stripped, entities decoded,
 * paragraphs kept apart by a blank line. Plain text passes through with only its whitespace tidied.
 */
export function htmlToText(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|head|nav|footer|svg|form|button|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|ul|ol|tr|table|section|article|blockquote|pre|dd|dt|figure|figcaption|header|main)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
  s = decode(s)
  return s
    .split(/\n{2,}/)
    .map((para) =>
      para
        .split('\n')
        .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n'),
    )
    .filter(Boolean)
    .join('\n\n')
}

/** Cuts text to about `maxTokens`, at a word boundary, ending with " …" when it had to cut. */
export function cutToTokens(text: string, maxTokens = PAGE_TOKENS): string {
  if (estimateTokens(text) <= maxTokens) return text
  const room = maxTokens * 4
  const head = text.slice(0, room)
  const space = head.lastIndexOf(' ')
  return `${(space > room / 2 ? head.slice(0, space) : head).trimEnd()} …`
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}
