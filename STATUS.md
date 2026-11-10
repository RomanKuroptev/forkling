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
- **Still to do in slice 1, in this order, each commit green:**
  1. `forkling.json` gets numeric `mood` and `energy` from `mood.ts` and drops `needs`, `feelings` and the mood label, with the old file shape still parsing.
  2. The mind's tick feeds `mood.ts` instead of appraisal, the prompts say mood in words, and the need trigger, `fixableNeeds` and the need warnings in `health.ts` go.
  3. `needs.ts`, `appraisal.ts`, `temperament.ts` and their tests are deleted, with the care actions (`eat`, `nap`, `curl_up`, `pounce`, `zoomies`, `cook`, `plant`, `water`, `harvest`) out of the pack.
  The body's choice of pose for each of the nine mind verbs (spec 2.7) needs a small pack-format hook (a verb to place-and-clip table), added in step 3 rather than hardcoded in the sim.

## Next

1. Roman runs the voice test (or gives the go to run it from an Actions workflow), reads the report and says whether the voice is worth building a world around (or what to change in the seed or the models).
2. Correct the section 12 thresholds in the spec doc from the calibration numbers.
3. W1 (strip pet care, new verbs): the plan is [`docs/spec/w1-strip-pet-care.md`](docs/spec/w1-strip-pet-care.md), five slices. It waits on the W0 verdict and three small decisions at the end of that file.
