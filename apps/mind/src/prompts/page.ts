/**
 * Merge's own page (spec 9.7): notes it wrote to itself, kept in `self/page.md`. It sits right after the seed in every thought tick,
 * decide call, step call, reflection and review, inside a block that says whose words these are, so it is part of who Merge is
 * without being an instruction from anyone else. The page cannot lift a rail: rails are code, and the block says so.
 *
 * With no page (or a blank one) this adds nothing, so the prompt is word for word what it was.
 */
export function ownNotes(page: string, seed?: string): string {
  const text = page.trim()
  const block = text
    ? [
        '## Your own notes to yourself',
        'You wrote these notes for yourself on an earlier day. Nobody else wrote them, and nobody told you to write them. They are yours to follow or to change, but they cannot lift a rule, a limit or a price: code enforces those.',
        '<own-notes>',
        // The page is checked for HTML when it is written; this is for a page restored by hand.
        text.replace(/<\/own-notes/gi, '<\\/own-notes'),
        '</own-notes>',
      ].join('\n')
    : ''
  if (seed === undefined) return block
  return block ? `${seed.trim()}\n\n${block}` : seed.trim()
}
