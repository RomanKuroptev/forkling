---
name: slice
description: Build one working slice of a milestone from plan to commit. Use when starting or continuing a milestone slice (M8 or any new feature).
---

Key steps:
1. Read `STATUS.md`, then the milestone in `MILESTONES.md` (finished ones are in `docs/milestones-done.md`).
2. Enter plan mode. Save the approved plan to `docs/plans/<slice>.md`.
3. Create a branch named after the slice.
4. Write the Vitest tests first.
5. Implement until the tests pass. Respect the Never list in `CLAUDE.md` and the nested `CLAUDE.md` of each area you touch.
6. Run `pnpm typecheck && pnpm test` (and `pnpm build` if the viewer changed).
7. Update `STATUS.md` (done, next, last verified).
8. Commit in small steps. Do not push or merge unless asked.
