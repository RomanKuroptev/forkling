import { describe, expect, it } from 'vitest'
import { withPolicy } from '../src/builds/sandbox.ts'
import { MAX_REASONS, staticCheck } from '../src/builds/work-check.ts'

const page = (body: string, head = '') => withPolicy(`<!doctype html><html><head><meta charset="utf-8"><title>w</title>${head}</head><body>${body}</body></html>`)
const script = (code: string) => page(`<script>${code}</script>`)
const check = (html: string, size: 'full' | 'sketch' = 'full') => staticCheck(html, { size })
const reasons = (html: string, size: 'full' | 'sketch' = 'full') => check(html, size).reasons.join(' | ')

const clean = page(
  `<script src="../../lib/p5.min.js"></script><script>function setup() { createCanvas(200, 200) } function draw() { background(30); circle(mouseX, mouseY, 20) }</script>`,
)

describe('staticCheck: a good work (spec 7.3, step 1)', () => {
  it('passes a p5 sketch on the page the build makes', () => {
    expect(check(clean)).toEqual({ ok: true, reasons: [] })
  })

  it('passes the three vendored libraries: p5, Tone and three (a module import)', () => {
    expect(check(page('<script src="../../lib/Tone.js"></script><script>const s = new Tone.Synth()</script>')).ok).toBe(true)
    expect(check(page(`<script type="module">import * as THREE from '../../lib/three/three.module.js'; new THREE.Scene()</script>`)).ok).toBe(true)
  })

  it('passes an image drawn into the page as data, and inline CSS', () => {
    expect(check(page('<style>body{margin:0;background:#112}</style><img src="data:image/png;base64,iVBORw0KGgo=" alt="">')).ok).toBe(true)
  })

  it('does not trip over a tag named like an object property', () => {
    expect(check(page('<constructor></constructor><toString></toString><hasOwnProperty>x</hasOwnProperty>')).ok).toBe(true)
  })

  it('does not mind the word fetch in prose, or a vector called location', () => {
    expect(check(script("const label = 'fetch the ball'; const location = { x: 1, y: 2 }; console.log(location.x, label)")).ok).toBe(true)
  })
})

describe('staticCheck: size (spec 7.1, 7.6)', () => {
  const pad = (bytes: number) => page(`<script>/* ${'x'.repeat(bytes)} */</script>`)

  it('allows a work up to 150 KB and refuses more', () => {
    expect(check(pad(100 * 1024)).ok).toBe(true)
    const big = check(pad(151 * 1024))
    expect(big.ok).toBe(false)
    expect(big.reasons.join(' ')).toMatch(/150 KB/)
  })

  it('allows a sketch up to 4 KB and refuses more', () => {
    expect(check(page('<script>draw()</script>'), 'sketch').ok).toBe(true)
    const big = check(pad(5 * 1024), 'sketch')
    expect(big.ok).toBe(false)
    expect(big.reasons.join(' ')).toMatch(/4 KB/)
  })

  it('counts bytes, not characters', () => {
    expect(check(page(`<script>/* ${'é'.repeat(3000)} */</script>`), 'sketch').ok).toBe(false)
  })
})

describe('staticCheck: the page must carry the policy first (spec 7.4)', () => {
  it('refuses a page with no policy tag', () => {
    const r = check('<!doctype html><html><head><title>w</title></head><body></body></html>')
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/policy/i)
  })

  it('refuses a page where the tag is not the first thing in the head', () => {
    const late = withPolicy('<html><head></head><body></body></html>').replace(/<head>(<meta[^>]*>)/, '<head><title>x</title>$1')
    expect(check(late).ok).toBe(false)
  })
})

describe('staticCheck: the forbidden list (spec 7.3, step 1)', () => {
  const forbidden: [string, string][] = [
    ['fetch', "fetch('https://example.org/a')"],
    ['fetch, called on window', "window.fetch('x')"],
    ['XMLHttpRequest', 'const x = new XMLHttpRequest()'],
    ['WebSocket', "const w = new WebSocket('wss://example.org')"],
    ['EventSource', "new EventSource('/events')"],
    ['sendBeacon', "navigator.sendBeacon('/b', 'x')"],
    ['localStorage', "localStorage.setItem('a', 'b')"],
    ['sessionStorage', "sessionStorage.getItem('a')"],
    ['indexedDB', "indexedDB.open('db')"],
    ['document.cookie', "document.cookie = 'a=b'"],
    ['window.open', "window.open('https://example.org')"],
    ['window.open, called bare', "open('https://example.org')"],
    ['getUserMedia', 'navigator.mediaDevices.getUserMedia({ video: true })'],
    ['geolocation', 'navigator.geolocation.getCurrentPosition(() => {})'],
    ['createCapture (the camera)', 'createCapture(VIDEO)'],
    ['a worker', "new Worker('w.js')"],
    ['importScripts', "importScripts('x.js')"],
    ['a dynamic import', "import('https://example.org/x.js')"],
  ]
  it.each(forbidden)('refuses %s', (_name, code) => {
    const r = check(script(code))
    expect(r.ok, code).toBe(false)
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  it('refuses a form', () => {
    expect(reasons(page('<form action="/x"><input name="a"></form>'))).toMatch(/form/i)
  })

  it('refuses a test work that calls fetch (the done-when case)', () => {
    const r = check(page(`<script>fetch('https://example.org/steal').then((r) => r.text())</script>`))
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/fetch/)
  })
})

describe('staticCheck: navigation, which a policy cannot stop (proved in the sandbox proof)', () => {
  const navigates: [string, string][] = [
    ['location.href', "location.href = 'https://example.org'"],
    ['window.location', "window.location = 'https://example.org'"],
    ['location.assign', "location.assign('https://example.org')"],
    ['location.replace', "location.replace('https://example.org')"],
    ['top.location', "top.location = 'https://example.org'"],
    ['document.location', "document.location = 'https://example.org'"],
    ['a bracketed location', "window['location'] = 'https://example.org'"],
  ]
  it.each(navigates)('refuses %s', (_name, code) => {
    expect(check(script(code)).ok, code).toBe(false)
  })

  it('refuses a meta refresh', () => {
    expect(reasons(page('', '<meta http-equiv="refresh" content="0;url=https://example.org">'))).toMatch(/refresh/i)
  })
})

describe('staticCheck: it may load only the vendored libraries (spec 7.1)', () => {
  const external: [string, string][] = [
    ['a script from a CDN', '<script src="https://cdn.example.org/p5.js"></script>'],
    ['a script from a protocol-relative address', '<script src="//cdn.example.org/p5.js"></script>'],
    ['a library that is not vendored', '<script src="../../lib/jquery.js"></script>'],
    ['a script from outside lib/', '<script src="other.js"></script>'],
    ['a stylesheet link', '<link rel="stylesheet" href="https://example.org/a.css">'],
    ['an image from the web', '<img src="https://example.org/a.png">'],
    ['an image by relative path', '<img src="a.png">'],
    ['an iframe', '<iframe src="https://example.org"></iframe>'],
    ['an object', '<object data="x.swf"></object>'],
    ['an embed', '<embed src="x.swf">'],
    ['a base tag', '<base href="https://example.org/">'],
    ['a css import', '<style>@import url("https://example.org/a.css");</style>'],
    ['a css url from the web', '<style>body{background:url(https://example.org/a.png)}</style>'],
    ['a link to another page', '<a href="https://example.org">go</a>'],
  ]
  it.each(external)('refuses %s', (_name, body) => {
    expect(check(page(body)).ok, body).toBe(false)
  })

  it('refuses an import of anything but a vendored module', () => {
    expect(check(page(`<script type="module">import x from 'https://example.org/x.js'</script>`)).ok).toBe(false)
    expect(check(page(`<script type="module">import x from './x.js'</script>`)).ok).toBe(false)
  })

  it('allows an in-page link and a data image in CSS', () => {
    expect(check(page('<a href="#top">top</a><style>body{background:url(data:image/png;base64,iVBORw0KGgo=)}</style>')).ok).toBe(true)
  })
})

describe('staticCheck: the reasons', () => {
  it('lists every problem at once, so one repair call can fix them all', () => {
    const r = check(page(`<script src="https://cdn.example.org/x.js"></script><script>fetch('/a'); localStorage.x = 1; location.href = '/'</script>`))
    expect(r.ok).toBe(false)
    expect(r.reasons.length).toBeGreaterThanOrEqual(4)
    expect(new Set(r.reasons).size).toBe(r.reasons.length)
  })

  it('stops at a handful, so the repair prompt stays short', () => {
    const many = Array.from({ length: 30 }, (_, i) => `<script src="https://cdn.example.org/${i}.js"></script>`).join('')
    expect(check(page(many)).reasons.length).toBeLessThanOrEqual(MAX_REASONS)
  })

  it('says what is wrong in plain words, with no HTML in it that could be mistaken for the work', () => {
    expect(reasons(script("fetch('/a')"))).not.toMatch(/[<>]/)
  })
})
