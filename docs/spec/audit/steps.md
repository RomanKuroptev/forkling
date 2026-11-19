# The audit harness: build steps

Read [`spec.md`](spec.md) first. Each step is one or more small PRs, tests first, each merged after green CI (standing rule). The section numbers point into the spec.

Order and what can run side by side:

```
Q0 skeleton ─┬─ Q1 fixtures ─┬─ Q2 pages ────────┐
             │               ├─ Q3 world ────────┤
             │               ├─ Q4 end-to-end ───┼─ Q7 AI review ─ Q8 triage ─ Q9 first full run and fixes
             │               └─ Q5 behaviour ────┤
             └─ Q6 live (needs only Q0) ─────────┘
```

Q2 to Q6 are independent once Q1 is merged, so a coordinator session can run them as helper agents in worktrees, as for the v4 build. Every step's PR updates `STATUS.md`.

---

## Q0. Skeleton and the findings format

Spec 2, 3.

- New workspace package `apps/qa` (`@forkling/qa`): Playwright (use the Chromium already installed by `apps/mind`'s browser tests, same version), pixelmatch, pngjs, axe-core. Root script `qa` (`pnpm qa <command>`).
- `src/report/finding.ts`: the Finding type as a Zod schema; `writeFindings`, `readFindings`, fingerprint helper.
- `src/report/report.ts`: `report.md` (counts per area, then findings by severity in plain words, picture links), `sheets/` contact sheets (a PNG grid: mockup | baseline | today, red boxes on changed areas; drawn with pngjs or resvg, no SVG in the output).
- `qa-out/` in `.gitignore`.
- `.github/workflows/qa.yml`: installs, runs `pnpm qa fast` (empty for now), uploads `qa-out/` as an artefact, fails on new blocker or major findings.
- A `qa.check-did-not-run` finding for any check that throws.

Done when: `pnpm qa fast` runs in CI, writes an empty findings file and a report, and a planted check that throws gives `qa.check-did-not-run`.

## Q1. Fixture worlds and the frozen clock

Spec 4, 6.1 (`--now`), 7.1 (`?qa=1` clock part).

1. `apps/site`: `--now <iso>` on the build; every clock read in `src/` and in the client scripts takes it (`data-now` on `<html>`). Test: two builds at the same `--now` are byte for byte the same.
2. `apps/viewer`: `?qa=1&now=<iso>&seed=<n>`: frozen clock, seeded randomness for anything drawn, `window.__qa.ready`, `step(ms)`. Test with Vitest on the helpers; no look change in normal mode.
3. `apps/viewer`: `?world=local` reads screen, gallery and work panel files from the local server, not raw.githubusercontent.
4. `test/fixtures/worlds/day-0` (from the template), `day-3` and `day-7` (one real 7-day fast-forward with `--sessions` at `--cap 3`, under the harness budget; trim journals and tick logs to keep each under about 2 MB). If the R2 run's copy still exists on Roman's PC, use it and save the money.
5. `src/fixtures/derive.ts` + `pnpm qa fixtures`: makes `day-30` (fake fast-forward from `day-7`, 23 days), `asleep`, `night`, `at-cap`, `building`, `notes-busy`, `retired`, `long-text`, `broken`, `tools` from `day-7` with pure edits. Each has `qa.json` with its clock.
6. A Vitest test parses every fixture with the schemas in `packages/schema` (so a schema change that breaks a fixture fails CI in the PR that made it).

Done when: all twelve fixtures exist, parse, and build a site; the viewer opens each one with `?world=local&qa=1` and says `ready`.

## Q2. Site page checks

Spec 6.

1. `src/pages/serve.ts`: build each fixture's site into `qa-out/site/<fixture>`, serve it with a fake mind for `/now.json` and `/notes.json` (with a "no answer" mode).
2. `src/pages/crawl.ts`: start at `/`, follow every internal link, list every page; a page that is built but never linked is a finding.
3. `src/pages/checks.ts`: every check in 6.2, each a small function `(page, ctx) => Finding[]`, each with a planted-bug test in `test/planted/pages/` (a tiny HTML page that breaks exactly that rule).
4. The mockup word list taken from the mockup HTML files in `docs/spec/v4/look/site/` (text nodes that are example content), checked in as `qa/mockup-words.json`, reviewed by hand once.
5. The engine word list in `qa/engine-words.json`.
6. Opened states: start menu, card opened, notes chat with typing, boot, asleep dialog (driven with clicks, as a visitor would).
7. `src/pages/shots.ts`: screenshots for every fixture x page x 390/1440 x day/night (+ asleep for the front page), baseline diff (`qa/baselines/pages/`), palette check against the look.md table (read from `apps/viewer`'s `theme.ts` or the site's `style.ts`, whichever is the single source; if they disagree that is a finding too).
8. `src/pages/measure.ts`: the measured mockup comparison (computed styles of the named `m95-*` elements in the mockup HTML vs the built page).
9. `qa/coverage.json` (spec 6.4) written from the site README table, look.md and `docs/spec/v4/lanes/d.md`, with a check that reports every `missing-data` and `not-built` line.
10. First baselines: made from today's pages, then reviewed in Q7 before they are trusted; until then baseline diffs are `info`.

Done when: `pnpm qa fast` runs the page checks on all fixtures in under 8 minutes, every check has a planted-bug test, and the known gaps in spec 0 and 6.4 show up as findings.

## Q3. 3D world checks

Spec 7.

1. `window.__qa.scene()`, `renderer()`, `cameras`, `setCamera()`, `fps()` in the viewer, only with `?qa=1`. Vitest tests for the scene listing on a fixture world without a browser where possible (the geometry helpers already have tests).
2. `src/world/open.ts`: `vite build` once, serve, open each fixture in SwiftShader, wait for `ready`.
3. `src/world/geometry.ts`: every check in 7.2, each with a planted-bug test (a fixture edit that floats a place, overlaps two footprints, hides a work, removes Merge from view, makes a finished thing wireframe).
4. `src/world/shots.ts`: the camera poses in 7.3, not-blank check, baseline diff (`qa/baselines/world/`), palette check.
5. The 2D overlay as a page check at 390 and 1440.
6. `src/world/budget.ts`: draw calls, triangles, textures against the limits; write the tuned limits into look.md.
7. `pnpm qa fps` (local only, headed, GPU): the walk path, the floors in 7.4. Not in CI.

Done when: the world checks run in CI in under 5 minutes over `day-0`, `day-7`, `day-30`, `night` and `building`, every check fails on its planted bug, and `pnpm qa fps` prints numbers on Roman's PC.

## Q4. End-to-end flows

Spec 8.

1. `src/e2e/stack.ts`: the local stack in 8.1 (copy of a fixture, real `serve`, scripted fake model, fake fetch that throws on real hosts, Turnstile test keys, site + viewer served, test clock).
2. Extend `apps/mind/src/fast-forward-fakes.ts` so a test can script the fake model's answers per call kind and read every prompt sent (prompts are captured, never sent anywhere).
3. One test file per area in 8.2: `notes.e2e.ts`, `wallet.e2e.ts`, `builds.e2e.ts`, `sandbox.e2e.ts` (in the existing `browser` CI job), `tools.e2e.ts`, `growth.e2e.ts`, `honesty.e2e.ts`, `workflows.e2e.ts`, `server.e2e.ts`.
4. `/health` gains `engine` (the tag from the deploy's checkout, or `dev`), with its test; the watchdog ignores it.
5. shellcheck on `deploy/*.sh` in CI.

Done when: every flow in 8.2 is a passing test, and each has at least one planted bug (for example: the server accepts a 4th reply; the note text is outside the data block; a session runs a 26th turn) that makes it fail.

## Q5. Behaviour scoring

Spec 9.

1. Pure measures in `packages/sim` (tests first, no clock, no randomness): topic runs, repeated words, repetition share, rest trend, "something new between two times". Reuse `topic-cluster.ts` and the 3-gram similarity already there.
2. `src/behaviour/score.ts`: reads a fast-forward output folder (summary, run report, the world copy) and writes the scores and findings, levels from `qa/behaviour.json`.
3. `src/behaviour/run.ts` + `pnpm qa behaviour --fake|--real --days N --seeds K --cap X`: runs K fast-forwards with different seeds and start times (in turn, not at once, to keep the real-call rate low), scores each, and writes a combined report with the spread between seeds.
4. `qa/web-snapshot/`: a recorded copy of the allowed sources (the real fetch code, robots.txt respected, the allowlist only) and a fake fetch that serves it; `pnpm qa web-snapshot` refreshes it (run weekly by the live tier, committed by a PR).
5. Planted: a fake model that always picks the same topic (topic-run alarm), never makes memes (meme alarm), rests 40% (rest alarm).
6. A nightly Actions job for `--fake --days 30 --seeds 3`.
7. Score the R2 run's output if it still exists: it must show the "loop" drift, no memes and the rest rise.

Done when: the fake nightly runs green or with issues, a real 7-day 2-seed run on `day-0` gives a report under the run cap, and the R2 output (or a fresh real run) raises the topic, meme and rest alarms on its own.

## Q6. The live run

Spec 11. Needs only Q0 (and Q4.4 for the version check, which waits until that is deployed).

1. `src/live/server.ts`, `src/live/repo.ts`, `src/live/site.ts`: the checks in 11, reusing the page checks of Q2 and the world opening of Q3 when those are merged (until then only server and repo).
2. `.github/workflows/qa-live.yml`: 05:30 and 17:30 UTC (06:30 and 18:30 Stockholm in winter), `contents: read` and `issues: read` only, artefacts kept 30 days.
3. A weekly job in the same file refreshes `qa/web-snapshot/` and opens a PR with it.

Done when: two nightly runs have run on Actions and their findings files are readable by `pnpm qa triage --dry-run`.

## Q7. The AI review (local Claude Code)

Spec 6.3, 7.3, 9.3, 12 D4.

1. `.claude/agents/look-reviewer.md` (Opus): gets contact sheets of mockup and screenshot pairs plus the measured differences; answers in a fixed JSON shape (scores, differences, "matters" flags) that `src/review/ingest.ts` turns into findings. Rules: ignore fake words and data; judge layout, colour, type, the Merge 95 feel, phone first.
2. `.claude/agents/behaviour-reviewer.md` (Opus): reads a behaviour run as in 9.3; never proposes a new rule on Merge.
3. `.claude/skills/qa/SKILL.md`: `/qa` (and `/qa nightly`, `/qa release`): runs `pnpm qa fast`, downloads the newest live artefact (`gh run download`), runs the real behaviour run when due (before a release, weekly, or after a prompt change) under the harness budget, makes the contact sheets, calls the two reviewers, merges their findings, then hands over to triage (Q8).
4. Review the first baselines (Q2.10, Q3.4) with the look reviewer; accept those that pass; the rest become findings. From then on baseline diffs are `major`.
5. D4: `qa/nightly.ps1` and plain steps in `docs/spec/audit/README.md` for Roman to add the Windows scheduled task once (or the coordinator adds it, if Roman says so).

Done when: `/qa` runs end to end on Roman's PC and its report has the reviewers' findings next to the automatic ones.

## Q8. The triage loop

Spec 10.

1. `src/triage/issues.ts` + `pnpm qa triage`: fingerprints to GitHub issues labelled `qa` (create, comment when evidence changed, close after 2 clean runs), pictures attached; `--dry-run` prints what it would do.
2. `.claude/agents/fixer.md` (Sonnet for `code` and `look`, Opus for `prompt` and `data`): one issue, one worktree, tests first, the rules in spec 10 point 4 and 5 word for word.
3. The `/qa` skill's last part: pick up to 5 issues, start one fixer each, watch their PRs, merge by the table in spec 10, label `fix-failed` after 2 tries, then the release check (D3), then the digest (one comment on the pinned "QA digest" issue).
4. Planted: a finding that asks for a new quota on Merge is labelled `needs-roman`, not fixed; a fixer that loosens a check is refused by a check in CI (`qa/` thresholds and `test/planted/` may only change in a PR labelled `qa-rules`, which the triage loop never merges itself).

Done when: a `--dry-run` over the first real findings looks right, then one real run opens issues, fixes at least one, merges it after green CI, and writes the digest.

## Q9. First full run and fixing the findings

The agreed order after the harness: run it, fix what it finds, then the Merge fresh start, then GoatCounter and the soft launch.

1. Run `/qa release` (everything, including a real behaviour run on `day-0` and `day-7`).
2. Check that it found the known problems in spec 0 by itself. If one is missing, the harness gets a fix first.
3. Let the triage loop work through the findings, round after round, until no blocker or major is open except those labelled `needs-roman`.
4. The LIVE pane as the real 3D island and the missing-data features are bigger than one fix: each becomes its own small plan in the issue (what the mind or the build must write, which prompt changes, the look), then built by the fixer rules.
5. Release when the full harness is green (D3).
6. Tell Roman in plain words: what was found, what was fixed, what is waiting for him (with a recommended answer each), and the front page and world contact sheets as PNGs.
7. Then the fresh start: `day-0` is already the fresh-start state, so the harness checks the reset world before it goes live (run `/qa` on a copy of the reset repo before pushing it).
