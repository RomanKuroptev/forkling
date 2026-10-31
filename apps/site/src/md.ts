/**
 * Everything this site shows was written by a model, so text is escaped before anything else happens to it. The
 * markdown here is only what the mind itself writes: headings, paragraphs, lists, bold, italics and links.
 */

export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** A link may only go to a web address, and cannot break out of its attribute. */
function link(label: string, url: string): string {
  const decoded = url.replace(/&amp;/g, '&')
  if (!/^https?:\/\/[^\s"'<>`]+$/i.test(decoded)) return label
  return `<a href="${esc(decoded)}" rel="noopener noreferrer">${label}</a>`
}

function inline(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => link(label, url))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

/** Markdown to HTML, from escaped text. */
export function markdown(source: string): string {
  const out: string[] = []
  let paragraph: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  const endParagraph = () => {
    if (paragraph.length > 0) out.push(`<p>${inline(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const endList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`)
    list = null
  }
  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = esc(raw.trim())
    const heading = /^(#{1,3}) (.+)$/.exec(line)
    const bullet = /^[-*] (.+)$/.exec(line)
    const numbered = /^\d+\. (.+)$/.exec(line)
    if (!line) {
      endParagraph()
      endList()
    } else if (heading) {
      endParagraph()
      endList()
      out.push(`<h${heading[1]!.length}>${inline(heading[2]!)}</h${heading[1]!.length}>`)
    } else if (bullet || numbered) {
      endParagraph()
      const tag = bullet ? 'ul' : 'ol'
      if (list && list.tag !== tag) endList()
      list ??= { tag, items: [] }
      list.items.push((bullet ?? numbered)![1]!)
    } else {
      endList()
      paragraph.push(line)
    }
  }
  endParagraph()
  endList()
  return out.join('\n')
}
