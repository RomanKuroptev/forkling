/** What a read call may keep from a page (spec 6.3). Images come with W2. */
export type SouvenirClaim =
  | { kind: 'quote'; content: string }
  | { kind: 'fact'; content: string; evidence?: string }

export type SouvenirCheck = { ok: true } | { ok: false; reason: string }

export const MAX_QUOTE = 280
export const MAX_FACT = 200

/** Whitespace collapsed and curly quotes and apostrophes made straight, so a quote matches however the page set it. */
function normal(text: string): string {
  return text.replace(/[“”„‟″]/g, '"').replace(/[‘’‚‛′]/g, "'").replace(/\s+/g, ' ').trim()
}

function inSource(excerpt: string, source: string): boolean {
  return normal(source).includes(normal(excerpt))
}

/** Code's check, never the model's word: a quote or a fact's evidence must appear word for word in the cleaned text. */
export function checkSouvenir(claim: SouvenirClaim, source: string): SouvenirCheck {
  if (!claim.content.trim()) return { ok: false, reason: 'empty' }
  if (claim.kind === 'quote') {
    if (claim.content.length > MAX_QUOTE) return { ok: false, reason: 'quote over 280 characters' }
    return inSource(claim.content, source) ? { ok: true } : { ok: false, reason: 'quote not found word for word' }
  }
  if (claim.content.length > MAX_FACT) return { ok: false, reason: 'fact over 200 characters' }
  const evidence = claim.evidence?.trim()
  if (!evidence) return { ok: false, reason: 'fact without evidence' }
  if (evidence.length > MAX_QUOTE) return { ok: false, reason: 'evidence over 280 characters' }
  return inSource(evidence, source) ? { ok: true } : { ok: false, reason: 'evidence not found word for word' }
}
