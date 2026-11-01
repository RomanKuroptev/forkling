---
name: release
description: Cut an engine release: checks, tag, push, and bump the pinned tag in the world workflows. Use only when the user asks to release.
disable-model-invocation: true
---

Key steps:
1. Confirm with the user which version to tag. Working tree must be clean and on `main`.
2. Run `pnpm typecheck && pnpm test && pnpm build`. Stop on any failure.
3. Tag `vX.Y.Z` and push `main` and the tag (confirm before pushing).
4. Bump `FORKLING_REF` in `templates/forkling-world/.github/workflows/*.yml` (build, mind, pages, validate) to the new tag, and in the same files of the `merge` repo (`github.com/RomanKuroptev/merge`). Commit each repo separately.
5. Update `STATUS.md` with the new tag and what needs its live run.
