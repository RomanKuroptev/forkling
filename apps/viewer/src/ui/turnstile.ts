interface TurnstileApi {
  render(el: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }): string
  remove(id: string): void
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | null = null

/** Loads Cloudflare's Turnstile script once, the first time a visitor opens the note form. */
function loadTurnstile(): Promise<TurnstileApi> {
  const have = (window as unknown as { turnstile?: TurnstileApi }).turnstile
  if (have) return Promise.resolve(have)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SCRIPT
    el.async = true
    el.onload = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile
      if (api) resolve(api)
      else reject(new Error('no turnstile'))
    }
    el.onerror = () => reject(new Error('turnstile did not load'))
    document.head.appendChild(el)
  })
  loading.catch(() => {
    loading = null
  })
  return loading
}

/** Shows the human check in `el`. `onToken` gets the token when it passes and an empty string when it expires or fails. Returns a function that removes it. */
export function mountTurnstile(el: HTMLElement, siteKey: string, onToken: (token: string) => void, onFailed: () => void): () => void {
  let id: string | null = null
  let gone = false
  loadTurnstile().then(
    (api) => {
      if (gone) return
      id = api.render(el, { sitekey: siteKey, callback: onToken, 'expired-callback': () => onToken(''), 'error-callback': () => onToken('') })
    },
    () => {
      if (!gone) onFailed()
    },
  )
  return () => {
    gone = true
    if (id) (window as unknown as { turnstile?: TurnstileApi }).turnstile?.remove(id)
  }
}
