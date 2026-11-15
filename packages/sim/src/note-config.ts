/** `URL` exists in the browser, Node and the site build; the sim has no DOM or Node types, so only what is used here is declared. */
interface ParsedUrl { protocol: string; hostname: string; username: string; password: string; search: string; hash: string; pathname: string; origin: string }
declare const URL: new (input: string) => ParsedUrl

/**
 * The address of `POST /notes` from the server's address (the `MIND_URL` repository variable), or null if it will not do: it must be
 * https (or a local try-out), the bare address with no user, path or query. The check keeps a wrong setting out of a page.
 */
export function notesEndpoint(mindUrl: string | undefined): string | null {
  const raw = mindUrl?.trim()
  if (!raw) return null
  let url: ParsedUrl
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && local))) return null
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null
  return `${url.origin}/notes`
}

/** A Turnstile site key (the `TURNSTILE_SITE_KEY` repository variable): letters, digits, dash and underscore, so nothing can break out of an attribute. */
export function validSiteKey(key: string | undefined): string | null {
  const k = key?.trim()
  return k && /^[0-9A-Za-z_-]{16,64}$/.test(k) ? k : null
}
