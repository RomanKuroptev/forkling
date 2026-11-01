# Status

Read this first. Update it before every commit and before you stop.

## Where the project is
- M1 to M3 done. M4 to M7 are built and released as v0.4.0 to v0.7.3 (latest tag v0.7.3), but their live runs are still pending on Merge ([RomanKuroptev/merge](https://github.com/RomanKuroptev/merge)).
- M7 slices: A eye cam (v0.7.0), B object builds (v0.7.1), C contraptions (v0.7.2), D coded projects (v0.7.3). A has run live; B to D need their live run.
- M8 (two-week run and launch) is next, once the live runs are clean.

## Current work
- Branch: `claude-setup`, implementing [`docs/plans/claude-setup.md`](docs/plans/claude-setup.md) part 1 (docs and config only, no runtime code changes). One commit per step.
- Done: steps 1 (STATUS.md), 2 (docs/ split), 3 (nested CLAUDE.md files), 4 (root CLAUDE.md slimmed to 72 lines; "Key data shapes" dropped, packages/schema is the source of truth), 5 (.claude/settings.json: allow and rtk twins, deny force push and .env), 6 (hooks sim-purity and typecheck-touched; both seen firing on throwaway edits to packages/sim/src/prng.ts, then reverted), 7 (subagents test-runner and explorer, both haiku).
- Next: step 8 (skills: slice, release, live-check, docs-sync, review).

## Open questions
- None.

## Last verified
- 2026-11-01: after step 7, `pnpm typecheck` clean and `pnpm test` 1026 passed (77 files).

## Tooling note
- `pnpm` is not on the Git Bash PATH here; run pnpm commands from PowerShell.
