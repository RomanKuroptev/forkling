# The audit harness: build steps

Read [`spec.md`](spec.md) first. Each step is one or more small PRs, tests first, each merged after green CI (standing rule). Section numbers point into the spec.

## No schedules yet (Roman, 19 November 2026)

Roman wants the harness built and run by hand first. So in Phase 1 **nothing runs on a schedule**: the GitHub workflows (`qa-live.yml`, the fake 30-day run, the weekly web-snapshot refresh) are built with `workflow_dispatch` only (a "Run workflow" button, and `gh workflow run` for Claude Code), and `/qa` runs only when someone types it. The `schedule:` lines and the Windows scheduled task (D4) are written in the PR description and `qa/nightly.ps1` but not switched on. Roman switches schedules on later, when he says so. The PR checks in `qa.yml` are not a schedule and stay on.

## Facts and choices for the builder (read before Q0)

These close the gaps a builder would otherwise guess at.

1. **What to build now comes from this file; how comes from `spec.md`.** Where they disagree (the spec describes the full harness, with tiers and schedules), this file wins: Phase 1 only, nothing on a schedule.
2. **Addresses.** Site: `https://romankuroptev.github.io/merge/`. The 3D world is built into the site at `/world/` (`apps/site` builds it there when `--base-url` is given); confirm the live address by following the site's ENTER WORLD link rather than guessing. Server: `https://merge-mind.duckdns.org` (`/health`, `/now.json`, `/places.json`, `/notes.json`). Merge's repo: `RomanKuroptev/merge`. The engine tag that is live: the newest release tag (v0.18.0 on 19 November).
3. **The fast-forward does not keep prompts today.** QB needs them for the meme steps. Add `--capture-prompts` to the fast-forward: one line per call (time, kind, model, the prompt text, whether it parsed) in `<outDir>/prompts.jsonl`, never inside the world. Live runs have no prompts: the meme step "seen by the planner" uses the tick log's call kinds and notes there, and says `unknown`, never 0, when the log cannot tell.
4. **The R2 run's output.** Its world copy and summary were on Roman's PC; the folder is not written down. Look for a fast-forward `summary.md` from 19 November outside the repo (for example next to the repo or in the temp folder). If it is not found in a few minutes, make a new real 7-day run with `--sessions` for `day-7` instead, under the harness budget.
5. **`day-0`** is what the fresh start will give: read `docs/spec/v4/merge-fresh-start.md` ("What stays" and "What starts fresh"). Until the `migrate-fresh` command exists, build `day-0` from the template plus Merge's `forkling.json` and `self/seed.md`, no visitors.
6. **First versions are normal PRs.** `qa/behaviour.json`, `qa/sources.json` and the planted tests are created and merged like any code PR. Until QR is finished, levels may be tuned with the reason written in `docs/decisions.md`. After QR, a PR that loosens a level or removes a planted test is labelled `qa-rules` and waits for Roman.
7. **The agents** (behaviour reviewer, look reviewer, world explorer, fixer) are Claude Code subagents defined in `.claude/agents/`. They run inside Roman's Claude Code session and use no API key and no harness budget. The explorer drives the browser through small scripts in `apps/qa/src/review/explore/` that print a screenshot path; the agent opens the PNG with its Read tool. Agents cannot run in CI: their planted-flaw tests are acceptance runs done in `/qa`, recorded in `docs/spec/audit/lanes/qw.md`, not Vitest tests.
8. **Two kinds of computer.** CI is Linux (SwiftShader, no GPU). Roman's PC is Windows: every command must work in PowerShell, paths with `node:path`, and `pnpm qa fps` uses the real GPU there (headed Chromium).
9. **Measures go into `packages/sim` only when pure** (numbers in, numbers out). Reading files, folders and logs stays in `apps/qa`. The existing similarity code is in `packages/sim/src/thought.ts` and `novelty.ts`, and topics in `topic-cluster.ts`: reuse them, do not write a second version.
10. **The fake model.** `apps/mind/src/fast-forward-fakes.ts` is extended so a test can give the answer per call kind (for example "the next decide plans a meme") and read every prompt it was sent. The `--dry-run` behaviour stays as it is.
11. **Levels in the spec tables are first guesses.** A level that every real run breaks on day one is a sign the level is wrong as much as Merge; the behaviour reviewer says which, and QR tunes it with a reason.
12. **When something is still unclear:** pick the simpler choice, write it in `docs/decisions.md` with one line why, and go on. Stop and ask Roman only for something on the "never" list in `spec.md` section 10, or money above the harness budget.

## Roman's focus (19 November 2026)

Roman wants the harness to focus most on three things:

1. **Behaviour works as intended** (spec 9.1 to 9.3, and memes in 9.5).
2. **Data sources work as intended** (spec 9.4).
3. **Visuals in the 3D world are found and fixed in an exploratory way** (spec 7.2, 7.4, 7.5; the world explorer agent is the main tool, code checks back it up).

So the build has two phases. **Phase 1 is only what those three need**, plus the smallest base they stand on. **Phase 2** (site page checks, picture baselines, the broad end-to-end flows, the site explorer) is built only after Phase 1 has run for a week and Roman says go.

```
P1:  Q0 base (one short PR, about 2 hours)
      ├─ lane W: Q1 viewer hooks + fixtures, then QW 3D world hunt
      ├─ lane B: QB behaviour + memes (starts with the pure measures, prompt capture and the real 7-day run for day-7)
      ├─ lane S: QS data sources (needs no fixture or viewer hook)
      └─ lane T: QT /qa skill, triage and agents (built against a sample findings.json, wired to the others as they merge)
     then QR run and fix (one coordinator, fixer agents in parallel, up to 5 at a time)
P2:  later: site pages, baselines, e2e flows, live site crawl, site explorer
```

Only Q0 comes first, because every lane writes findings in its format. After that the four lanes run at the same time as helper agents in their own worktrees. Where a lane needs something from another (QB needs the `day-7` fixture from lane W's Q1 for the world-side scores; QT needs real findings to triage), it builds against a stand-in first and switches when the other part is merged. The coordinator merges one PR at a time and rebases the others. Every PR updates `STATUS.md`.

---

# Phase 1

## Q0. Base

Spec 2, 3.

- New package `apps/qa` (`@forkling/qa`), root script `qa` (`pnpm qa <command>`). Playwright on the Chromium `apps/mind` already installs.
- The Finding schema (Zod), `findings.json`, `report.md` in plain words, contact sheets as PNG (pngjs or resvg; never SVG output).
- `qa-out/` gitignored. `qa.check-did-not-run` for any check that throws.
- `.github/workflows/qa.yml` runs `pnpm qa fast` on PRs (fast and free parts only) and uploads `qa-out/`.
- **File the known site gaps as GitHub issues now, by hand, labelled `qa` and `phase-2`**, so nothing is lost while the site checks wait: the merge.exe LIVE pane is a drawn picture, not the live 3D island; the missing-data features (cards' why box and source line, faces row, dated phases on the retired page, project progress bar, "since your last visit" pictures); the duplicated sketches on the workshop shelf.

Done when: `pnpm qa fast` runs in CI with an empty report, and a planted throwing check gives `qa.check-did-not-run`.

## Q1. Fixtures and viewer hooks (only what Phase 1 needs)

Spec 4, 7.1.

1. `apps/viewer`: `?qa=1&now=<iso>&seed=<n>`: frozen clock, seeded randomness for anything drawn, `window.__qa` with `ready`, `step(ms)`, `scene()`, `renderer()`, `cameras`, `setCamera()`, `fps()`, and walk helpers (press keys, move the phone stick, read the visitor's position). No look change in normal mode.
2. `apps/viewer`: `?world=local` reads the screen, gallery and work panel files from the local server, so panels can be looked at before they go live.
3. Fixtures: `day-0` (fresh-start state), `day-7` (from a real 7-day run, which lane B starts first thing so it is ready in about 2 hours; reuse the R2 copy if it still exists on Roman's PC), `day-30` (`day-7` plus 23 days on fakes), `night`, `building`, and `live` (a fresh clone of Merge's repo, made at run time, never committed). Each with `qa.json` holding its clock. A test parses every fixture with the schemas.

The other fixtures in spec 4 (asleep, at-cap, notes-busy, retired, long-text, broken, tools) wait for Phase 2.

Done when: the viewer opens each fixture with `?world=local&qa=1`, `__qa.ready` turns true, and `__qa.scene()` lists every place, room, work and Merge.

## QB. Behaviour and memes

Spec 9.1, 9.2, 9.3, 9.5.

1. Pure measures in `packages/sim`, tests first, no clock, seeded PRNG only: topic runs, repeated words, repetition share, rest trend, "something new between two times", kinds made and their shares.
2. `src/behaviour/score.ts`: reads a fast-forward output folder or a world clone (live) and writes the scores of 9.2 and findings, levels in `qa/behaviour.json`.
3. `pnpm qa behaviour --fake|--real --days N --seeds K --cap X`: K runs with different seeds and start times, one after another; a combined report with the spread between seeds.
4. `qa/web-snapshot/` and `pnpm qa web-snapshot`: a recorded copy of the allowed sources (real fetch code, robots.txt respected, allowlist only) so real runs see the same web and always have meme formats to find. (QS checks that it is fresh and complete.)
5. **Memes, the eight steps (9.5):** `src/behaviour/memes.ts` counts offered, read, seen by the planner, chosen, allowed, made, passed the work check, shown, from trails, captured prompts (sim) or tick logs (live), plans, plan-check notes, call results, work checks and the site files. It names the first step at zero with the numbers. Plus one end-to-end test that makes a meme through all eight steps with the fake model, so the machinery is known to work. The work check also asks the look reviewer whether a finished meme reads as a meme (memes are redrawn in code, never the template picture, by design; the question is whether a visitor sees it as a meme).
6. `.claude/agents/behaviour-reviewer.md` (Opus): reads a run as in 9.3, says what Merge is stuck on and why, with file and log lines; never proposes a rule on Merge.
7. Planted: a fake model that always picks the same topic, never makes memes, rests 40%; each must raise its alarm.
8. Score three things and compare them: the R2 run's output (if it still exists), a fresh real 7-day run on `day-0` with 2 seeds, and the live last 7 days from the `live` clone. The report says for each problem whether it comes from the fake web, the real web or Merge's choices.
9. An Actions job for `--fake --days 30 --seeds 3` (engine logic: crashes, rails, money, growth), started by hand for now (no schedule).

Done when: the "loop" drift, no memes (with the step where they stop) and the rising rest are found on their own, and the planted cases fail.

## QS. Data sources

Spec 9.4.

1. `qa/sources.json`: every source the spec and Roman's direction name (maker: Esolang, Show HN, Lobsters, creative-coding GitHub, the library manuals; pulse: Imgflip, Lemmy memes, Mastodon trends; plus Wikipedia, Commons, the Art Institute), each with its state: `on the list`, `trial passed, not added`, `trial failed`, `blocked by robots.txt`, `dropped by Roman`, with the reason and the trial report's path (`docs/spec/w2-trials/`). A check reports every promised source that is not on the list.
2. `src/live/sources.ts` (on Actions, started by hand for now, real fetch code, robots.txt respected, normal request gaps, allowlist only): each host answers; robots.txt still allows what we read (a change is a `blocker`); the source code still finds its items (Wikipedia Main Page sections, Esolang, GitHub topic repos, the Imgflip formats); a sample page cleans to over 120 words; links are found. Imgflip freshness: how many formats are new since last week.
3. `src/behaviour/sources.ts`: what Merge actually read, in sim and live: trips per host, top host share, starts per source, trips that read nothing or hit 404, invented titles, pages read twice, which sources fed something that was made, and sources that are never offered.
4. The web snapshot of QB.4 has items from every source on the list and is under 14 days old.
5. `.github/workflows/qa-live.yml`: the source health, and the web-snapshot refresh as a PR, both `workflow_dispatch` only. The planned times (06:30 Stockholm daily, the snapshot weekly) are noted in the file as comments, not switched on.
6. Planted: a parser that returns 0 items, a robots.txt that now disallows, a snapshot 20 days old.
7. **Fix path for sources** (for triage): wiring a source whose trial passed and whose robots.txt allows it is a `code` fix under the v4 rule for new hosts (robots allows and the trial passes; never Reddit or Know Your Meme). A source that is blocked (Mastodon blocks ClaudeBot by name) or needs a choice is `needs-roman` with a recommended answer. Nothing is added to the allowlist without its trial report.

Done when: the source run has run twice on Actions (started by hand), and the report shows the missing pulse sources, Imgflip's freshness and the live Wikipedia share.

## QW. The 3D world, found and fixed by exploring

Spec 7.2, 7.3 (not-blank and palette only), 7.4, 7.5. Opus lane.

1. **The world explorer agent first** (`.claude/agents/world-explorer.md`, Opus, local): walks each world fixture and the live world in first person with the real keys and the phone stick, using helper scripts in `src/review/explore/` (open, walk to, turn, look up, look at, screenshot, phone mode). Goals from spec 7.4. It reports per picture what is wrong, what is missing, what is ugly or does not feel like "an AI lives here", in the finding format with the screenshot. Its finding starts `minor` and becomes `major` when the look reviewer confirms it on the picture or a code check confirms it.
2. **Every confirmed explorer finding gets a code check** in the fix PR, so the same flaw is caught by code from then on. The automatic checks grow from what the explorer finds.
3. The starting code checks (spec 7.4 and 7.2), each with a planted bug: 40 seeded camera poses per fixture and their sheet; not blank; palette; flicker; missing or stretched textures; holes; things inside things; floating parts; invisible walls and walk-through walls; walking from the start to every door; readable labels and signs; too dark or too bright; camera inside a mesh; phone overlay covering Merge; every place, room and work in the files is in the scene once; every finished work is shown somewhere; nothing floating or sunk; no overlaps.
4. **Claims against the world:** everything the site and the diary say is in the world is in `__qa.scene()`.
5. **Frame rate:** the draw call and triangle budget in CI; `pnpm qa fps` on Roman's PC with the GPU (floors in 7.5).
6. `.claude/agents/look-reviewer.md` (Opus): confirms or rejects explorer findings on the picture, and judges fix PRs against look.md and the world mockups (`docs/spec/v4/look/world.png`, `world-night.png`, `buildings-merge-visitor.png`, `site/world-overlay.png`).
7. Planted: a fixture with a work the site says is in the Workshop but is not, a wall pushed through another, a floating sign, a missing texture. The explorer and the code checks must report them.

No picture baselines in Phase 1: the world changes every day as Merge builds, and baselines would break on every change. The look reviewer against the mockups replaces them.

Done when: the explorer and the code checks find all planted flaws, the world sheets are in the report, and `pnpm qa fps` prints numbers on Roman's PC.

## QT. `/qa` and triage

Spec 10, 12 D4.

1. `.claude/skills/qa/SKILL.md`: `/qa` (and `/qa nightly`, `/qa weekly`, `/qa release`): runs what is due (fast checks; downloads the nightly source and fake-run artefacts with `gh run download`; the world explorer on a fresh `live` clone; weekly and before releases a real behaviour run under the harness budget), calls the reviewers, merges their findings.
2. `pnpm qa triage`: findings to GitHub issues labelled `qa` by fingerprint (open, comment when evidence changed, close after 2 clean runs), pictures attached.
3. Fixer agents (`.claude/agents/fixer.md`): up to 5 issues a run, one worktree each, by the table and the "never" list in spec 10. World look fixes merge when green and the look reviewer passes the before and after pictures. Prompt fixes merge after the written checks, a 3-day real run showing the score moved the right way, and a reviewer agent (D2). After 2 failed tries: `fix-failed`.
4. The digest: one comment on the pinned "QA digest" issue per run, plain words, with the world sheet and the behaviour and source summary.
5. `qa/nightly.ps1` and the one PowerShell line for Roman's scheduled task (D4), written but not created: Roman switches schedules on later.

Done when: one `/qa` run opens issues, fixes at least one, merges it after green CI, and writes the digest.

## QR. Run it and fix

1. `/qa release`, started by hand, with the GitHub parts started by `gh workflow run`: everything Phase 1 has, including a real behaviour run on `day-0` and `day-7`.
2. It must find by itself: the "loop" drift, no memes and the step where they stop, the rising rest, the missing pulse sources, Imgflip's stale list, and the planted world flaws. If not, fix the harness first.
3. The triage loop works through the findings until no blocker or major is open except `needs-roman`. Behaviour fixes come with the run that shows they worked.
4. Release when Phase 1 is green (D3), then the pin-only commit in Merge's repo.
5. Tell Roman in plain words: what was found, fixed and merged, what waits for him (with a recommended answer each), with the world sheet as PNG.
6. Then the Merge fresh start: run `/qa` on a copy of the reset world before it is pushed (`day-0` is that state already).

---

# Phase 2 (only after a week of Phase 1 and Roman's go)

- **Site page checks** (spec 6.1 to 6.3): every page at 390 and 1440, day, night, asleep; the rule checks (sideways scroll, touch targets, links, console errors, mockup words, engine words, length rules, share tags, accessibility, fonts, weight); the measured mockup comparison and the look reviewer.
- **Mockup coverage** (6.4): `qa/coverage.json` and the check; the Q0 `phase-2` issues move into it.
- **The site explorer** (6.5) and claims against facts on the site.
- **Picture baselines** for site pages only (pages change less than the world), approved with the look reviewer.
- **The rest of the fixtures** (asleep, at-cap, notes-busy, retired, long-text, broken, tools).
- **End-to-end flows** (8.2) for notes and threads, wallet, build sessions, sandbox, tool requests, world growth, honesty, Merge's repo workflows, deploy; `/health` gains `engine`.
- **The live site crawl** and server checks in section 11 beyond the sources.
