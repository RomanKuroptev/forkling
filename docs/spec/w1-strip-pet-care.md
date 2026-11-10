# W1: Strip pet care, new verbs

A plan, not yet started. From spec sections 2.3, 2.4, 2.6, 3.2, 9.1, 9.8, 15.1, 15.2, 15.4 and 16. The whole spec is in [`spec.md`](spec.md). W1 starts only after Roman has read the W0 report and said the voice is worth building around.

**Builds:** removes the care parts in spec 15.1. Adds mood and energy, the nine verbs with the daily allowance (all but `write` and `rest` stubbed to `rest`), the new triggers, and plan validation with the cold start. Adds the seed and the archive. Still runs on the GitHub Actions tick.

**Done when:** a simulated day with no needs anywhere and at most 12 decide calls. Every rejected plan shows its reason. `pnpm test` and `pnpm typecheck` pass. 3 live days with no health warnings.

## How big it is

A search for the pet words across the code shows the reach. These are file counts, so one file may count for several words.

| Word | Files that mention it |
|---|---|
| needs | 89 |
| temperament | 39 |
| photos | 36 |
| contraption | 37 |
| hunger | 29 |
| objects/ | 29 |
| bowl | 23 |
| portions | 14 |
| eyecam | 10 |

That is too much for one PR to review, so W1 is five slices. Each is its own branch and PR, started from the one before, tests first, merged by Roman. `main` stays deployable after each, and the live Merge keeps running engine v0.8.0 until slice 5.

## Slices

### 1. Schema and sim: mood and energy replace needs (done, PRs #31 to #34)
- **Tests first** for the spec 3.2 table: each event's mood and energy change, the clamp to -1..1, and the wake rule (mood moves 20% toward 0, energy set to +0.5). Also the energy-under -0.5 effect: at most 4 steps and no expand, found or tinker. The words shown to the model ("low, tired") come from a pure function.
- `packages/schema`: `forkling.json` loses `needs`, `inventory` and portions (spec 14.2) and gains `mood` and `energy`. A pet-era `forkling.json` still parses, so live Merge does not break before slice 5: unknown pet fields are dropped, never rejected (the same approach as `fix/tolerate-dropped-needs`).
- `packages/sim`: remove `needs.ts`, `fixableNeeds` and the need trigger inputs, sleep decay, `temperament.ts` and the quirk weights, and the critical-need break in `forkling.ts` and `utility.ts`. The body is left with idle and verb animations only. `appraisal.ts` is replaced by the event table.
- `species/cat`: `species.json` keeps the body, animations and locomotion. It loses `needs`, the care and cat actions (`eat`, `nap`, `curl_up`, `pounce`, `zoomies`, `sniff`, `vocalize`, `cook`, `plant`, `water`, `harvest`), `persona.md` and `temperament.json` (spec 15.1).

### 2. Verbs, allowance and plan validation (done, PRs #35 and the wiring PR)
- **Tests first** for `validatePlan` as specced in 2.6: verb and target exist, the allowance and quotas, the same verb 3 times in a row, a reason of at most 140 characters, and the link to a want or a care step. Each rejection carries its reason text, which is what the next decide call is shown. The cold-start rule is tested in both directions: the link check is off with fewer than 3 wants, and on from 3.
- The nine verbs are `wander`, `tend`, `revisit`, `expand`, `found`, `tinker`, `write`, `reply` and `rest`, with the durations in spec 2.4 (clamped by code). Everything but `write` and `rest` is accepted by the validator but runs as `rest` in W1 (a stub that says so in the step's result).
- The allowance (9.8): 150 points at each wake, a price list, carry-over up to 450, and deep steps. Its prices are constants with a test that they match the spec table. A plan that costs more than the points in hand is rejected with that reason.
- `write` in W1 makes a plaque into the pile (a file in a new `souvenirs`-style folder is W2; W1 writes it to `notebook/` so it leaves an artifact). One Haiku step call, up to 300 words, checked for claims to be human.
- `packages/sim/src/novelty.ts` (already built in W0) gains the plan-level nudges from 12.3 (stuck in one place, repeated work, weekend revisit), which are measured and logged only.

### 3. The mind: triggers, tick and removals
- Triggers: `newDay` and `replan` stay. `sparked`, `note`, `buildResult` and `reflected` are added but can only fire from W2 and later, so in W1 they exist as types with tests and no source. Removed: `need`, `blocked`, `bedtime` and the surprise triggers tied to needs and objects. Surprise now feeds importance (9.3), which waits for W7, so W1 just logs it.
- Limits (2.3): at most 12 decide calls a day, 4 thought-tick replans a day, 60 minutes after an empty or rejected plan, 30 minutes after a failed call.
- Removed from `apps/mind`: `tick/portions.ts`, `art.ts` and the art tick step, `photos.ts` and the vision step, `design.ts` and `project.ts` with `code.ts`, the Claude Code Action job, the `need`-driven `apply-step` paths and the draw. The `read` and `study` reading step goes too, since wandering replaces it in W2. The morning feed skim stays and keeps feeding interests.
- The bedtime reflection and nightly Batch rewrite stay running as they are for now. The sleep rewrite replaces them in W7, and removing them now would leave a world with no memory for weeks.
- Prompts are rewritten around the seed, the nine verbs, the allowance and mood in words. The golden files in `apps/mind/test/golden/` are regenerated, and the diff is for Roman's review (the seed is `self/seed.md`, which needs review).
- The day test (`apps/mind/test/day.test.ts`) is rewritten for the new rules: a simulated day with no needs, a step running most of the awake day, at most 12 decide calls, none while asleep, and every rejected plan carrying its reason.
- Health: `buildHealth` drops the need warnings and gains the warnings that still apply (no step for an hour, same verb 3 times, over 12 decide calls, failures, rejections, spend ahead of pace).

### 4. Viewer and site: only what the new files need
- The viewer keeps showing the island (the land and places arrive in W5). It stops drawing objects, contraptions, eye-cam, the gallery wall and need bars in the F3 overlay. Merge plays `write` at the desk and `rest` at home, as spec 2.7 says. Its thought line comes from the step's reason.
- The site drops the pages that read removed folders (gallery, projects, obsessions). It keeps the journal, the why timeline and the home page.
- No new viewer features. W5 rewrites this area.

### 5. Seed, archive and release
- `self/seed.md` with the 9.1 text, reviewed by Roman, in the template and in Merge's repo. Merge's `brain/persona.md` and `temperament.json` are archived.
- **Decision 3 (fresh mind):** Merge's `objects/`, `art/`, `notebook/` and old `journal/` move to `archive/` in a single commit. Its beliefs, `memory/summary.md` and stream are archived too, so the mind starts empty. The site's `/archive/` page shows the old journal and art read-only.
- The template world, its `CLAUDE.md`, its workflows (`build.yml` loses the project job) and `validate.yml`'s allowed paths (`places/`, `works/`, `wishes/` and the archive moves) are updated.
- Release: tag, bump `FORKLING_REF` in the template and in Merge's workflows, merge PR #29 or close it first. Then 3 live days, watched through `mind/health.json` and the tick log.

## Decisions I need from Roman before starting

1. **The nightly memory rewrite and bedtime reflection in W1.** Keep them running unchanged until W7 (recommended: Merge stays able to remember across days), or stop them in W1 and run with only the day's stream.
2. **`write` in W1.** Recommended: a plaque-style note in `notebook/` so the one working verb leaves a file. The alternative is to leave `write` stubbed too and have W1 test only `rest`, but then Merge makes nothing for the 3 live days.
3. **PR #29 (release v0.8.0).** It is still open. Merge or close it before slice 5, so the release tag is cut from `main`.

## Risks

- Slice 1 changes the schema that the live Merge reads. The pet-era file must keep parsing until slice 5 releases, so the tolerance tests come first.
- The viewer reads a world at a commit and replays the sim. If the sim and the viewer disagree on the body for a step, the cat jumps. The playback anchor tests stay as they are.
- W1's live days test the loop with 2 working verbs. Most plans will be mostly `rest`, which is the point: it proves the loop, the allowance and the validation before anything interesting is built on them.
