import { MAX_SKETCH_BYTES, MAX_WORK_BYTES } from '@forkling/schema'
import { hasPolicy } from './sandbox.ts'

/** At most this many reasons are given, so a repair prompt stays short. */
export const MAX_REASONS = 8

export interface CheckResult {
  ok: boolean
  /** What is wrong, in plain words, for the repair call and for the scrap bin. No markup, so it cannot pass for the work. */
  reasons: string[]
}

/** The only scripts a work may load (spec 7.1), by path from `works/<id>/`. */
const SCRIPT_SRC = /^\.\.\/\.\.\/lib\/(?:p5\.min\.js|Tone\.js)$/
/** The one module a work may import (three.js). */
const MODULE_IMPORT = '../../lib/three/three.module.js'
const DATA_URI = /^data:(?:image|audio|video)\//i

const URL_ATTRIBUTES = new Set(['src', 'href', 'action', 'formaction', 'poster', 'data', 'srcset', 'background', 'xlink:href', 'ping', 'manifest', 'codebase'])
const BANNED_TAGS: Record<string, string> = {
  form: 'a form',
  iframe: 'an iframe',
  frame: 'a frame',
  frameset: 'a frameset',
  object: 'an object tag',
  embed: 'an embed tag',
  applet: 'an applet',
  portal: 'a portal',
  base: 'a base tag',
  link: 'a link tag (a work has inline CSS only)',
}

/** The words of 7.3, step 1, and what a policy cannot stop (navigation, found in the sandbox proof). Each is a hygiene check: the sandbox is the boundary. */
const BANNED_CODE: [RegExp, string][] = [
  [/(?<![\w$])fetch\s*\(/, 'uses fetch, and a work has no network'],
  [/\bXMLHttpRequest\b/, 'uses XMLHttpRequest, and a work has no network'],
  [/\bWebSocket\b/, 'uses WebSocket, and a work has no network'],
  [/\bEventSource\b/, 'uses EventSource, and a work has no network'],
  [/\bsendBeacon\b/, 'uses sendBeacon, and a work has no network'],
  [/\blocalStorage\b/, 'uses localStorage, and a work has no storage'],
  [/\bsessionStorage\b/, 'uses sessionStorage, and a work has no storage'],
  [/\bindexedDB\b/, 'uses indexedDB, and a work has no storage'],
  [/\bdocument\s*\.\s*cookie\b/, 'uses document.cookie, and a work has no cookies'],
  [/\bwindow\s*\.\s*open\b|(?<![\w$.])open\s*\(/, 'opens a window, and a work has no pop-ups'],
  [/\b(?:getUserMedia|mediaDevices|enumerateDevices|geolocation|createCapture|UserMedia)\b/, 'asks for the camera, the microphone or the location, and a work has none'],
  [/\b(?:Worker|SharedWorker)\s*\(|\bimportScripts\b|\bserviceWorker\b/, 'starts a worker, and a work loads nothing but its own page'],
  [/\b(?:window|self|top|parent|document|globalThis)\s*\.\s*location\b|\b(?:window|self|top|parent|document|globalThis)\s*\[\s*['"]location['"]\s*\]/, 'changes the address of the page (location), and a work stays where it is'],
  [/(?<!(?:const|let|var)\s+)(?<![\w$.])location\s*(?:=(?!=)|\.\s*(?:href|assign|replace|reload|origin|search|hash|pathname)\b|\[)/, 'changes the address of the page (location), and a work stays where it is'],
]

const short = (value: string) => value.replace(/[<>]/g, '').slice(0, 60)

/** The tags of the page, each with its attributes, found by a tolerant scan (this is not a full HTML parser, and need not be). */
function* tags(html: string): Generator<{ name: string; attrs: Map<string, string> }> {
  for (const tag of html.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const attrs = new Map<string, string>()
    for (const a of (tag[2] ?? '').matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs.set((a[1] ?? '').toLowerCase(), (a[2] ?? a[3] ?? a[4] ?? '').trim())
    }
    yield { name: (tag[1] ?? '').toLowerCase(), attrs }
  }
}

function leaves(tag: string, attr: string, value: string): boolean {
  if (value.startsWith('#') || DATA_URI.test(value)) return false
  if (tag === 'script' && attr === 'src') return !SCRIPT_SRC.test(value)
  return true
}

/**
 * Step 1 of the check (spec 7.3): the page itself, before any browser. Size, the policy tag first in the head, what it loads
 * (only the vendored libraries), and the forbidden list. It is pure. A page that passes can still be refused by the browser
 * check, and one that this check misses (`window['fe' + 'tch']`) is still stopped by the sandbox and the policy, which are
 * the real boundary; this is what gives the repair call a reason in plain words.
 */
export function staticCheck(html: string, opts: { size: 'full' | 'sketch' }): CheckResult {
  const reasons = new Set<string>()

  const limit = opts.size === 'sketch' ? MAX_SKETCH_BYTES : MAX_WORK_BYTES
  const bytes = Buffer.byteLength(html, 'utf8')
  if (bytes > limit) reasons.add(`the page is ${Math.ceil(bytes / 1024)} KB, over the ${limit / 1024} KB limit for a ${opts.size === 'sketch' ? 'sketch' : 'work'}`)

  if (!hasPolicy(html)) reasons.add('the page does not start with the policy tag, which the build puts first in the head')

  for (const { name, attrs } of tags(html)) {
    const banned = Object.hasOwn(BANNED_TAGS, name) ? BANNED_TAGS[name] : undefined
    if (banned) reasons.add(`the page has ${banned}`)
    if (name === 'meta' && /^refresh$/i.test(attrs.get('http-equiv') ?? '')) reasons.add('the page has a meta refresh, which sends the visitor elsewhere')
    for (const [attr, value] of attrs) {
      if (!URL_ATTRIBUTES.has(attr) || !value) continue
      if (banned) continue
      if (leaves(name, attr, value)) reasons.add(`it loads "${short(value)}" from outside the page, and a work may load only the libraries in lib/ (p5.min.js, Tone.js, three/three.module.js)`)
    }
  }

  for (const [pattern, reason] of BANNED_CODE) if (pattern.test(html)) reasons.add(`the code ${reason}`)

  if (/\bimport\s*\(/.test(html)) reasons.add('the code imports a module while it runs, and a work may import only three.js by its fixed path')
  for (const m of html.matchAll(/\bimport\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g)) {
    const specifier = m[1] ?? m[2] ?? ''
    if (specifier !== MODULE_IMPORT) reasons.add(`the code imports "${short(specifier)}", and a work may import only ${MODULE_IMPORT}`)
  }

  if (/@import\b/i.test(html)) reasons.add('the CSS imports another file, and a work has inline CSS only')
  for (const m of html.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    const value = (m[2] ?? '').trim()
    if (value && !value.startsWith('#') && !DATA_URI.test(value)) reasons.add(`the CSS loads "${short(value)}", and a work may use only data: images in CSS`)
  }

  const list = [...reasons]
  return { ok: list.length === 0, reasons: list.slice(0, MAX_REASONS) }
}
