import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXPLORE_SHOT_STYLE } from '../src/review/explore/session.ts'
import { repoRoot } from '../src/paths.ts'

describe("the explorer's pictures", () => {
  it("hide the visitor's centre arrow, which otherwise sits on whatever the picture is of (Merge's face on merge-close)", () => {
    expect(EXPLORE_SHOT_STYLE).toMatch(/\.cursor\s*\{[^}]*visibility:\s*hidden/)
    // The selector must still be the viewer's own: a renamed class would quietly bring the arrow back.
    expect(readFileSync(join(repoRoot(), 'apps/viewer/src/ui/Cursor.tsx'), 'utf8')).toContain('className="cursor"')
  })
})
