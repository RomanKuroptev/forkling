# Status

Read this first. Update it before every commit and before you stop.

## Where the project is
- M1 to M3 done. M4 to M7 are built and released as v0.4.0 to v0.7.3 (latest tag v0.7.3), but their live runs are still pending on Merge ([RomanKuroptev/merge](https://github.com/RomanKuroptev/merge)).
- M7 slices: A eye cam (v0.7.0), B object builds (v0.7.1), C contraptions (v0.7.2), D coded projects (v0.7.3). A has run live; B to D need their live run.
- M8 (two-week run and launch) is next, once the live runs are clean.

## Current work
- Branch: `claude-setup`, implementing [`docs/plans/claude-setup.md`](docs/plans/claude-setup.md) part 1 (docs and config only, no runtime code changes). One commit per step.
- Done: all 10 steps of part 1 (docs/ split, nested CLAUDE.md files, root CLAUDE.md at 72 lines, settings.json, two hooks, two subagents, five skills, docs path test). Hooks and the docs test were each seen firing on a throwaway edit, then reverted.
- Root CLAUDE.md is 6,209 characters, about 1,550 tokens (chars / 4). Confirm with `/context` in a fresh session.
- Part 2 on branch `split-tick` ([`docs/plans/split-tick.md`](docs/plans/split-tick.md)): done. `tick.ts` is 39 lines and calls one module per step in `src/tick/`; `prompts.ts` re-exports `src/prompts/`. No behaviour change: existing tests untouched, new golden prompt files pass, `--dry-run` output on a template world is identical before and after.
- Next: review the `claude-setup` and `split-tick` PRs (`split-tick` is branched from `claude-setup`). Prune the branches already merged into main, once Roman says which.

## Open questions
- None.

## Last verified
- 2026-11-01: after the `split-tick` slice, `pnpm typecheck` clean and `pnpm test` 1038 passed (79 files). `pnpm build` not rerun (viewer untouched; last ok after step 10 of claude-setup).

## Tooling note
- `pnpm` is not on the Git Bash PATH here; run pnpm commands from PowerShell.
