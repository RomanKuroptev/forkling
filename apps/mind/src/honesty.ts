/**
 * A fixed phrase check for text that claims a human life (spec 9.2). Merge is an AI with a cat's body and never claims
 * a human life or a body outside its world. A hit is dropped and logged; it is not a judgement of the text's quality.
 */
const HUMAN_CLAIMS: readonly RegExp[] = [
  /\b(?:i am|i'm|i’m) (?:a |an )?(?:human|person|man|woman|boy|girl|guy)\b/i,
  /\bmy (?:mother|father|mom|dad|wife|husband|girlfriend|boyfriend|childhood|hometown)\b/i,
  /\bwhen i was (?:a |an )?(?:kid|child|boy|girl|teenager|baby)\b/i,
  /\bmy (?:human )?(?:body|hands?|fingers?) (?:in|at) (?:the )?(?:real|physical) world\b/i,
  /\bback when i (?:lived|worked|went to school)\b/i,
]

export function claimsHuman(text: string): boolean {
  return HUMAN_CLAIMS.some((re) => re.test(text))
}

/** Words in a text, for the length limits that are counted in words. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}
