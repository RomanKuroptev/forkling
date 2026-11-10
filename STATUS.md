# Status

Read this first. Update it before every commit and before you stop.

## Where the project is

- **The world-builder pivot has started (2026-11-10).** The spec is [`docs/spec/spec.md`](docs/spec/spec.md) (v3.3). It replaces the pet, and the milestones are now W0 to W8 in [`MILESTONES.md`](MILESTONES.md). Roman chose the recommended option on all three open decisions: full-page reading, auto-published sandboxed works, and a fresh mind with the old journal archived.
- **The code is still the pet.** Live Merge runs engine v0.8.0 (pinned in its workflows). No more fixes go into the pet. Its hunger and planning warnings come from parts W1 deletes.
- The pet-era milestones M1 to M7 are in [`docs/milestones-done.md`](docs/milestones-done.md). The v0.8.0 release PR (#29) is merged; the tag is live and Merge's workflows pin it.

## Current work: docs rewrite and W0

Branch `claude/project-thread-403rmi`.

- **Docs (done):** `CLAUDE.md` and `MILESTONES.md` rewritten from the spec, this file reset, and the spec exported to `docs/spec/`.
- **W0 voice test (built, waiting for its live run):** `pnpm --filter @forkling/mind voice-test --merge <clone>`. See [`docs/spec/w0-voice-test.md`](docs/spec/w0-voice-test.md). It needs `ANTHROPIC_API_KEY` in Roman's terminal, because this machine has no key and the federation rule only works from the merge repo's Actions. The offline run fetches 20 items and measures the pet-era text; the numbers are in the W0 file. Estimated cost $0.13 at most, assuming no cache and full outputs.
- New code that W1 and W2 reuse: `packages/sim/src/novelty.ts` (3-gram similarity, worn phrases, calibration profile), `apps/mind/src/web/clean.ts` (HTML to text, cut to 3,000 tokens) and `apps/mind/src/web/souvenir.ts` (word-for-word check). The script itself lives in `apps/mind/scripts/` and is thrown away after W0.

## W1 progress (slice 1 of 5, started)

- **Decisions (Roman, 10 November, "go ahead" on my recommendations):** the bedtime reflection and nightly rewrite keep running until W7; `write` works in W1 as a plaque-style note in `notebook/`; PR #29 is merged. The W0 voice test ran live (see `docs/spec/w0-voice-test.md`).
- **Done:** `packages/sim/src/mood.ts` (spec 3.2: the event table, clamp, wake rule, tired limits, words, spiral check), tests first, 17 tests. Nothing uses it yet.
- **Step 1 done (the body stops reading needs):** the cat pack declares no needs and no action raises or costs one, and `SpeciesPack` accepts a pack with none (`needs` defaults to `{}`). The bowl is gone from the mind: `tick/portions.ts`, its test, the meal count in `tick/create.ts` and the "food to share out" prompt line. Pet-care tests that asserted need behaviour were removed or rewritten to wake the model on a new object instead: the need trigger, critical-need warnings, the replay's need rows, and the day test's bowl-and-cooking test. The system prompt golden file lost its "+8 curiosity" style figures (the only diff, for Roman's review). 1309 tests pass and every package typechecks.
- **Step 2 done (numeric mood and energy):** `forkling.json` has `mood` and `energy` from -1 to 1 and no `needs`, `feelings` or mood word. A pet-era file still parses: needs and feelings are dropped, the old valence becomes the mood, and energy starts at 0.5 (`fromPetEra` in `packages/schema/src/world.ts`). The need trigger and `fixableNeeds` input are gone from `scoreSurprise`. The mind's `feel` step now applies the spec 3.2 events from `mood.ts`: each step that lands costs 0.05 energy, an accepted build gives +0.2 mood, and waking sets energy to +0.5 and eases mood 20% toward 0. Prompts show mood in words (`low, tired`), and the site and viewer overlay show the same. The body's drift still takes a valence and arousal, now made from mood and energy in `playback.ts`. Not built yet: `nothingMadeToday` (it needs the files written in a day, which come with the W1 verbs in slice 2), `souvenirKept`, `noteFound` and `buildFailed` (W2 onward).
- **Step 3a done (needs are gone from the body):** deleted `needs.ts`, `appraisal.ts`, the sim report (`report.ts`, `report-format.ts`, the `sim-report` command) and their tests. The body has no needs: no decay, no need-driven draw, no `fixableNeeds`, and a plan is broken off only by a visitor. `scoreActions` takes `(pack, ctx)`, and mood bends the drift through `Feelings` (now in `mood.ts`). The tick log and health no longer write needs (old lines and files still parse), the prompts no longer print them, and the viewer overlay has no need bars. Utility, forkling, headless and day tests were rewritten for a body with no needs. The pack schema still accepts `needs` and `satisfies` and ignores them.
- **Step 3b done (no temperament):** deleted `temperament.ts`, quirk weights, `TemperamentRoll` and `TemperamentPools`, the cat's `temperament.json`, the "you" block of likes, dislikes and quirks in every prompt, the temperament roll in the tick (it no longer writes `brain/temperament.json`), and the viewer's temperament loading and overlay lines. 1219 tests pass. Merge's repo still has its old `brain/temperament.json`, which nothing reads; it is archived in slice 5.
- **Step 4 done (care actions and need fields gone from the pack):** the cat no longer has `sniff`, `vocalize`, `nap`, `curl_up`, `pounce`, `zoomies`, `eat`, `dine`, `cook`, `plant`, `water` or `harvest`, and `SpeciesPack` has no `needs`, `satisfies` or `spontaneous` (packs that still carry them parse, and the fields are ignored). The cat keeps its body verbs (`go_to`, `inspect`, `sit`, `watch`, `follow`, `hide`, `sleep`, `stretch`, `explore`), hands, making and mind verbs, which go in slice 3.
- **Slice 1 is done.** What remains of the pet is the object machinery (effects, objects, contraptions, the art, photo and code pipelines, the eye cam, the island), which slice 3 removes together with the old triggers. The pack-format hook that maps a mind verb to a place and clip (spec 2.7) comes with the nine verbs in slice 2.

## W1 slice 2 (done): the nine verbs are wired into the tick

- **The plan is the nine verbs now.** The decision schema, `planStepFrom` and `checkPlan` speak wander, tend, revisit, expand, found, tinker, write, reply and rest. `checkPlan` runs `validateMindPlan` (spec 2.6) with the places Home and Workshop, the mood, and the points in hand; every rejection names its step and goes to the second ask. The system prompt is rewritten around the seed (`self/seed.md`, with the engine's own copy in `apps/mind/src/seed.ts` until a world has one), the nine verbs and the rules of a plan. The user prompt shows mood in words, the points in hand and today's prices, and the places.
- **The allowance runs.** The first awake tick of each day tops it up (`pointsAtWake`), and a step spends its points when it starts (`MindState.allowance`).
- **`write` and `rest` run.** A finished write step makes one Haiku call and writes `notebook/writing/<date>-<time>-<title>.md`, up to 300 words, and drops writing that claims a human life (`apps/mind/src/honesty.ts`). Every step that lands costs 0.05 energy. The other seven verbs run as rest, and the stream says so. A mind verb has no body-time share to count, so it lands when its minutes are up.
- **The body shows a mind verb as one of its own actions** (the pack's new `mindPoses`; the cat sits for all nine until W5 gives it places). The intention's type is that pose, and the step keeps the target.
- **Removed from the tick:** the art, photo and code steps, the `blocked` trigger and skipped steps, `needs`, bowl and temperament prompts, and the `limits`, `designs`, `skills` and world-object blocks in the user prompt. Their tick-level tests are deleted (art, photo, code, contraption, build, making).
- **Still in the code, dormant:** the art, photo, design, project and reading modules, the object effects, contraptions and builds machinery, the novelty trigger, the object loading and the eye cam. Slice 3 removes them. A pet-era `mind/goals.json` still parses, and a step with a pack verb still runs the old way.
- **Assumptions to check against the spec:** expand's step time is 20 to 40 minutes; reply costs 0 points and keeps its rail of 5 a day; a tinker with no size is a full work; the first-ever day's allowance is 150 points.

## Next

1. Roman runs the voice test (or gives the go to run it from an Actions workflow), reads the report and says whether the voice is worth building a world around (or what to change in the seed or the models).
2. Correct the section 12 thresholds in the spec doc from the calibration numbers.
3. W1 (strip pet care, new verbs): the plan is [`docs/spec/w1-strip-pet-care.md`](docs/spec/w1-strip-pet-care.md), five slices. It waits on the W0 verdict and three small decisions at the end of that file.
