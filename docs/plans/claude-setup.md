# Plan: Claude Code setup for forkling

Source: review doc https://claude.ai/artifact/3oS7WRPMBir1D4ZtoY2zzB (2026-11-01).
Scope: part 1 only (docs and config). No changes to runtime code. One branch `claude-setup`, one commit per step, Roman reviews before merge.
Part 2 (separate slice via `/slice`): the `tick.ts` and `prompts.ts` split is in [`split-tick.md`](split-tick.md). Pruning merged branches is still open.

## Ground rules
- Do not change behaviour: no edits under `apps/*/src`, `packages/*/src`, `species/*/src`, `templates/`.
- Docs hold intent and rules; code holds details. Never copy schemas or file lists into docs.
- Every rule that must never break stays as one line in root `CLAUDE.md` (nested files are dropped at compaction).
- After each step: `pnpm typecheck && pnpm test` still pass; update `STATUS.md`.

## Steps

1. **STATUS.md** (root, under 40 lines): current milestone (M4 to M7 built as v0.4.0 to v0.7.3, live runs pending; M8 next), current branch, next step, open questions, last verified. README status line links to it. Drop "(built; ...)" notes from MILESTONES.md headings.
2. **docs/ split**
   - `docs/architecture.md`: mind/body/builder/site table, engine and world repo layouts (moved from CLAUDE.md).
   - `docs/milestones-done.md`: full specs of M1 to M7 moved out of MILESTONES.md; MILESTONES.md keeps the v1 goal, criteria, design rules, verbs, feeds, features, visitor day and M8.
   - `docs/future.md`: moved from FUTURE.md (fix links).
   - `docs/decisions.md`: dated decision log; seed with entries already made (v1 direction 2026-10-31, $10 cap, Haiku + Sonnet, human sleep hours, verbs not activities).
   - `docs/plans/`: this file lives here.
3. **Nested CLAUDE.md** (each 20 to 40 lines, rules not file lists):
   - `packages/sim/CLAUDE.md`: purity, determinism, seeded PRNG, headless runner, no species logic.
   - `species/CLAUDE.md`: pack format and rules (replaces stale species/README.md content).
   - `apps/mind/CLAUDE.md`: models, structured outputs, prompt caching order, cost caps, untrusted data wrapping, feeds fail soft, dry-run.
   - `apps/viewer/CLAUDE.md`: never call an LLM, deterministic playback, URL flags, F3 overlay.
4. **Slim root CLAUDE.md** to about 80 lines: what forkling is, "Read STATUS.md first; update it before every commit and before you stop", autonomy rules one line each, cost and guardrail nevers, conventions, full commands list (all mind scripts, single test file: `pnpm vitest run <path>`), pointers to docs/ and nested files.
5. **.claude/settings.json**: allow `pnpm test*`, `pnpm typecheck*`, `pnpm build`, `pnpm vitest run *`, `pnpm --filter * *`, `pnpm mind:local --dry-run*`, `git status|diff|log|branch|show*`; deny `git push --force*`, `Read(.env*)`, `Edit(.env*)`.
6. **Hooks** (scripts in `.claude/hooks/`, Node so they run on Windows):
   - PreToolUse Edit|Write: block (exit 2) writes under `packages/sim/` that add `Math.random`, `Date.now(`, or imports of `three`, `react`, `node:`.
   - PostToolUse Edit|Write: typecheck only the touched package, print errors only.
   - Verify each fires once with a throwaway edit, then revert.
7. **Subagents** in `.claude/agents/`: `test-runner` (model haiku, Bash; returns failing tests only), `explorer` (model haiku, read-only; answers where-is questions with file:line).
8. **Skills** in `.claude/skills/<name>/SKILL.md` (key steps at the top):
   - `slice`: read STATUS.md and milestone, plan mode, save plan to docs/plans, branch, tests first, implement, checks, update STATUS.md, commit.
   - `release`: checks, tag, push, bump pinned tag in merge and forkling-world workflows, update STATUS.md.
   - `live-check`: read merge repo budget, journal, goals, Actions runs; report cost/day, triggers, oddities.
   - `docs-sync`: compare CLAUDE.md files, docs/architecture.md, STATUS.md with code; list stale claims.
   - `review`: fresh Opus session; one explorer per area (sim, mind, viewer, species, templates); compare with v1 goals and decisions.md.
9. **CI doc check** (optional): Vitest test that every repo path named in a CLAUDE.md or docs/architecture.md exists.
10. Final: `pnpm typecheck && pnpm test && pnpm build`, run `/context` in a fresh session and note root CLAUDE.md token size in STATUS.md, open PR for Roman.
