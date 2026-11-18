/**
 * The visit counter of the 3D world (sharing S7): GoatCounter, cookie-free. Switched off until `VITE_GOATCOUNTER_CODE` is given at build time;
 * with no code nothing is added to the page and no request is made. The code is the name of a GoatCounter site (letters, digits, dashes).
 */
const CODE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

export function counterAttrs(raw: string | undefined | null): { endpoint: string; src: string } | null {
  const code = (raw ?? '').trim().toLowerCase()
  return CODE.test(code) ? { endpoint: `https://${code}.goatcounter.com/count`, src: 'https://gc.zgo.at/count.js' } : null
}

/** Adds the counter's script to the page once, when there is a code. */
export function startCounter(raw: string | undefined | null, doc: Document = document): boolean {
  const attrs = counterAttrs(raw)
  if (!attrs || doc.querySelector('script[data-goatcounter]')) return false
  const script = doc.createElement('script')
  script.async = true
  script.dataset.goatcounter = attrs.endpoint
  script.src = attrs.src
  doc.head.appendChild(script)
  return true
}
