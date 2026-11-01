# Split tick.ts and prompts.ts (claude-setup part 2)

## Context
`apps/mind/src/tick.ts` is one 1,000-line `runTick` closure, and `prompts.ts` mixes the cached system prompt with the per-call user prompt for three call types. Both are hard to change and hard to review. `docs/plans/claude-setup.md` defers this split to a separate `/slice`. The goal is a pure refactor: no behaviour change, prompts stay byte-identical, and every existing test passes **unchanged**. After that, prune the branches already merged into main, but only once Roman confirms.

## Branch
- `split-tick`, branched from `claude-setup` (that branch has 11 unmerged commits holding the STATUS.md and plan docs this slice updates). Do not push or merge.

## Constraints that shape the design
- Tests import `runTick`, `TickDeps` from `../src/tick.ts` and `buildSystem` from `../src/prompts.ts`. `cli.ts`, `design.ts`, `photos.ts`, `reading.ts` and `reflect.ts` import from `./prompts.ts`. **Both files stay as entry points**: `tick.ts` becomes the short orchestrator, and `prompts.ts` becomes a barrel that re-exports everything it exports today (`ThinkKind`, `describeInterests`, `describeBelief`, `SystemInput`, `buildSystem`, `UserInput`, `buildUser`).
- The order of operations in `runTick` must not change. Snapshots that the current code takes once and never refreshes have to stay snapshots, not live reads:
  - `objectIds` is taken after the finishing step is applied. A later contraption run changes `objects` but not `objectIds`.
  - `nextIndex` and `moreSteps` are taken before any `startStep`. The decision step reuses those stale values.
  - `beliefIds` comes from `w.beliefs` before bedtime changes the beliefs. `checkPlan` in the decision step still uses the old ids.
  - `system` is built once. `prompt ??=` keeps the *first* prompt (shared by `ask` and the memory batch).
  - `failed` is set by the apply step and read by the decision step's appraisals.
- Keep the code style of the area: flat helper functions, short doc comments, no classes.

## tick.ts → `apps/mind/src/tick/`
One mutable context object replaces the closure's `let`s. Every step is `async function xStep(t: Tick): Promise<void>` (or sync) that reads and writes `t.*` in the same order as today.

| File | Moves from tick.ts |
|---|---|
| `tick/context.ts` | `TickDeps`, `TickResult`, the `Tick` context type, `createTick(dir, deps)` (lines 184–253: read the world, sleep, budget roll, temperament roll, playback, initial state), the constants, and the `pad`/`clock`/`weekday`/`round`/`epochOf`/`same`/`intentionSeed` helpers |
| `tick/describe.ts` | `PAST`, `describeEvent`, `describeFeelings` |
| `tick/ask.ts` | `makeAsk(t)`: the guarded model call (lines 403–429) |
| `tick/plan.ts` | `checkPlan(t, plan)`, `startStep(t, index, reason?)`, `thinkKindFor` |
| `tick/settle-build.ts` | lines 255–265 |
| `tick/apply-step.ts` | lines 267–325, ending with the `objectIds` snapshot |
| `tick/route.ts` | lines 357–368: start the next step on routine, or choose `thinkKind`, and snapshot `nextIndex`/`moreSteps` |
| `tick/reading.ts` | `readSession` plus the morning skim and the shelf visit (lines 431–498) |
| `tick/art.ts` | lines 500–560, including the contraption run |
| `tick/code.ts` | lines 562–604 |
| `tick/photos.ts` | `queueShot` plus the photograph and the noticed shot (606–649) |
| `tick/think.ts` | the decide/morning/weekly call with one retry (652–706) |
| `tick/bedtime.ts` | reflection (708–757) |
| `tick/memory.ts` | the batch collect and submit (759–809) |
| `tick/apply-decision.ts` | goals, design request, late night, stream, plan (811–898) |
| `tick/feel.ts` | the appraisal into mood (900–906) |
| `tick/write.ts` | change detection, file writes, building the `TickResult` (908–1002) |

`src/tick.ts` then has only the imports, `export type { TickDeps, TickResult }`, the `runTick` doc comment, and the step calls in order. That comes to about 40 lines.

Do not rename these files to clash with the existing `src/art.ts`, `src/reading.ts` and `src/photos.ts`. The `tick/` folder keeps them apart, and imports stay explicit (`../art.ts`, as written today).

## prompts.ts → `apps/mind/src/prompts/`
| File | Contents |
|---|---|
| `prompts/shared.ts` | `ThinkKind`, `describeInterests`, `describeBelief`, `json` |
| `prompts/system.ts` | `SystemInput`, `buildSystem`, plus `PHRASES`, `describeFilter`, `EFFECTS`, `GROUPS`, `describeObjectTarget`, `describeAction` |
| `prompts/morning.ts`, `prompts/decide.ts`, `prompts/weekly.ts` | each exports its task text, `(i: UserInput) => string`, unchanged |
| `prompts/user.ts` | `UserInput`, `describeObject`, `buildUser` (the shared situation block plus `TASKS` built from the three task modules) |
| `src/prompts.ts` | a barrel that re-exports the public names above |

The other call types already have their own builders (`reflect.ts` for bedtime and memory, `reading.ts` for read, `art.ts` for art, `photos.ts` for vision, `design.ts` for design). They stay where they are, so this slice does not grow. Moving them into `prompts/` can come later if wanted.

## Steps (commit after each)
1. **Golden test first**: `apps/mind/test/prompts-golden.test.ts` renders `buildSystem` for the cat and `buildUser` for morning/decide/weekly from a fixed fixture, and checks them with `expect(...).toMatchFileSnapshot('golden/<kind>.txt')`. Run it once on the current code to write the golden files, and commit them. It is a new file, so no existing test changes.
2. Split `prompts.ts` into `prompts/`. Run typecheck, the full test suite and the golden test.
3. Split `tick.ts`: context, describe and ask first, then the steps one or two at a time, running `pnpm vitest run apps/mind` after each move. Commit at green points.
4. Update `apps/mind/CLAUDE.md` with a line on where the tick steps and prompt builders live. Update STATUS.md (done, next, last verified), and remove "split" from part 2 in `docs/plans/claude-setup.md`. Save this plan as `docs/plans/split-tick.md`. The docs path test checks that every path named exists.

## Verification
- PowerShell (pnpm is not on the Git Bash PATH): `pnpm typecheck; if ($?) { pnpm test }`. Expect 1034 or more passing (78 or more files). The existing test files show no diff: `git diff claude-setup --stat -- apps/mind/test` lists only the new golden test and its fixtures.
- `pnpm mind:local --dry-run` against a template world, before and after. The printed prompt and notes must be identical (diff the two outputs saved in the scratchpad).
- `pnpm build` is not needed (the viewer is untouched).

## Then: merged branches (read-only listing done, deletion only on Roman's yes)
Merged into main, local (21): fix-stick-glide, hide-bubble, m1-island, m2-merge, m3-repo-world, m4-bubble, m4-heartbeat, m4-mind, m4-retry, m4-wif, m5-body, m5-goals, m6-art, m6-curiosity, m6-memory, m7-builds, m7-code, m7-contraptions, m7-eyecam, mobile-friendly, smaller-bubble.
Merged into origin/main, remote (19): the same list without m1-island, m2-merge and m3-repo-world (those have no remote).
Not merged: claude-setup (kept), and split-tick once created.
After the refactor, ask Roman with AskUserQuestion: delete local only, local and remote, or none. Then `git branch -d …` (safe delete) and, if approved, `git push origin --delete …`.
