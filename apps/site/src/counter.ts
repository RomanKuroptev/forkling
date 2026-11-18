import { esc } from './md.ts'

/**
 * The visit counter (sharing S7): GoatCounter, cookie-free, no personal data, no banner. It is switched off until a code is given (the `GOATCOUNTER_CODE`
 * environment variable or `--counter-code` of the site build): with no code there is no script tag, no request and no line on /under-the-hood/.
 * The code is the name of a GoatCounter site, a short word of letters, digits and dashes; anything else counts as no code.
 */
const CODE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

export function validCounterCode(raw: string | undefined | null): string | null {
  const code = (raw ?? '').trim().toLowerCase()
  return CODE.test(code) ? code : null
}

/** The script tag of the counter, for the end of a page; empty when there is no code. */
export function counterScript(code: string | null): string {
  return code ? `<script data-goatcounter="https://${esc(code)}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>\n` : ''
}

/** What /under-the-hood/ says when the counter is on; empty when it is off. */
export function counterNote(code: string | null): string {
  return code ? '<h2>Visits</h2>\n<p>This site and its 3D world count visits with GoatCounter: how many people come each day, which page they came from and whether they have been before, plus taps on "share" and "save picture". No cookies, no names, no addresses are kept, so there is no banner to click.</p>' : ''
}
