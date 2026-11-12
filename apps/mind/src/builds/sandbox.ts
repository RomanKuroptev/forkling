/**
 * How a work is shown (spec 7.4): in an `<iframe sandbox="allow-scripts">` with no `allow-same-origin`, under this policy.
 * GitHub Pages cannot send headers, so the policy is a `<meta http-equiv>` tag the build inserts as the first element of the
 * `<head>`, and the check verifies it is there. The sandbox proof (`test/browser/sandbox-proof.test.ts`) shows what it does.
 */
export const POLICY =
  "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'none'; form-action 'none'"

export const policyMeta = (): string => `<meta http-equiv="Content-Security-Policy" content="${POLICY}">`

/** A policy tag of any kind, in any case: the work's own is taken out, so a weaker one cannot sit beside ours. */
const ANY_POLICY_META = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi
const HEAD_OPEN = /<head(?:\s[^>]*)?>/i
const HTML_OPEN = /<html(?:\s[^>]*)?>/i
const DOCTYPE = /^\s*<!doctype[^>]*>/i

/** Puts the policy first in the head. Makes a head if the page has none. Doing it twice changes nothing. */
export function withPolicy(html: string): string {
  const page = html.replace(ANY_POLICY_META, '')
  const meta = policyMeta()
  const head = HEAD_OPEN.exec(page)
  if (head) {
    const at = head.index + head[0].length
    return page.slice(0, at) + meta + page.slice(at)
  }
  const made = `<head>${meta}</head>`
  const htmlTag = HTML_OPEN.exec(page)
  if (htmlTag) {
    const at = htmlTag.index + htmlTag[0].length
    return page.slice(0, at) + made + page.slice(at)
  }
  const doctype = DOCTYPE.exec(page)
  const at = doctype ? doctype[0].length : 0
  return page.slice(0, at) + made + page.slice(at)
}

/** Whether the policy tag, exactly as the spec has it, is the first thing in the head. It covers only what comes after it. */
export function hasPolicy(html: string): boolean {
  const head = HEAD_OPEN.exec(html)
  if (!head) return false
  let at = head.index + head[0].length
  while (/\s/.test(html[at] ?? '')) at++
  return html.startsWith(policyMeta(), at)
}

const escapeAttr = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The iframe that shows a work (spec 7.4): scripts may run and nothing else, and above all not `allow-same-origin`, so the
 * work cannot read the site or the visitor's data. No referrer is sent. The address and the title are escaped.
 */
export function workFrame(src: string, title: string): string {
  return `<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" title="${escapeAttr(title)}" src="${escapeAttr(src)}"></iframe>`
}
