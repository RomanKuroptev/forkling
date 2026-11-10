# Status

Read this first. Update it before every commit and before you stop.

## Where the project is

- **The world-builder pivot has started (2026-11-10).** The spec is [`docs/spec/spec.md`](docs/spec/spec.md) (v3.3). It replaces the pet, and the milestones are now W0 to W8 in [`MILESTONES.md`](MILESTONES.md). Roman chose the recommended option on all three open decisions: full-page reading, auto-published sandboxed works, and a fresh mind with the old journal archived.
- **The code is still the pet.** Live Merge runs engine v0.8.0 (pinned in its workflows). No more fixes go into the pet. Its hunger and planning warnings come from parts W1 deletes.
- The pet-era milestones M1 to M7 are in [`docs/milestones-done.md`](docs/milestones-done.md). The release PR #29 (v0.8.0) is still open, and Roman decides whether to merge or close it.

## Current work: docs rewrite and W0

Branch `claude/project-thread-403rmi`.

- **Docs (done):** `CLAUDE.md` and `MILESTONES.md` rewritten from the spec, this file reset, and the spec exported to `docs/spec/`.
- **W0 voice test (built, waiting for its live run):** `pnpm --filter @forkling/mind voice-test --merge <clone>`. See [`docs/spec/w0-voice-test.md`](docs/spec/w0-voice-test.md). It needs `ANTHROPIC_API_KEY` in Roman's terminal, because this machine has no key and the federation rule only works from the merge repo's Actions. The offline run fetches 20 items and measures the pet-era text; the numbers are in the W0 file. Estimated cost $0.13 at most, assuming no cache and full outputs.
- New code that W1 and W2 reuse: `packages/sim/src/novelty.ts` (3-gram similarity, worn phrases, calibration profile), `apps/mind/src/web/clean.ts` (HTML to text, cut to 3,000 tokens) and `apps/mind/src/web/souvenir.ts` (word-for-word check). The script itself lives in `apps/mind/scripts/` and is thrown away after W0.

## Next

1. Roman runs the voice test (or gives the go to run it from an Actions workflow), reads the report and says whether the voice is worth building a world around (or what to change in the seed or the models).
2. Correct the section 12 thresholds in the spec doc from the calibration numbers.
3. W1 (strip pet care, new verbs): the plan is [`docs/spec/w1-strip-pet-care.md`](docs/spec/w1-strip-pet-care.md), five slices. It waits on the W0 verdict and three small decisions at the end of that file.
