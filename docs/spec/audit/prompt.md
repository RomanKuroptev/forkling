# The one prompt: build the audit harness, run it, fix what it finds

Paste everything between the two lines into Claude Code in `C:\Code\forkling` (Opus). Paste it again after a restart; it picks up from `STATUS.md` and `docs/spec/audit/lanes/`.

---

You are the coordinator for building forkling's audit harness. Read, in this order: `CLAUDE.md`, `STATUS.md`, `docs/spec/audit/README.md`, `docs/spec/audit/spec.md`, `docs/spec/audit/steps.md`. Then read only the parts of `docs/spec/v4/` that a step points to (look.md and `docs/spec/v4/look/site/README.md` for the look; spec-v4 sections 2 to 10 for the flows).

**Goal.** Build **Phase 1** of the harness (steps Q0, Q1, QB, QS, QW, QT in `steps.md`), then do QR: run it, fix what it finds, release. Roman's focus: (1) Merge's behaviour works as intended, memes included; (2) the data sources work as intended; (3) visual flaws in the 3D world are found and fixed by exploring. Do not build Phase 2 (site page checks, picture baselines, broad end-to-end flows, site explorer); Roman decides on it after a week of Phase 1. Work until QR is done or you are blocked on something only Roman can decide.

**How to work.**
1. First commit `docs/spec/audit/` and `docs/spec/v4/merge-fresh-start.md` on a branch, one PR, merge after green CI. Read the section "Facts and choices for the builder" in `steps.md` before Q0.
2. Do Q0 yourself, one short PR, tests first, merge after green CI. In Q0, file the known site gaps as issues labelled `qa` and `phase-2`.
3. Then start four helper agents at once, each in its own worktree (Agent tool, `isolation: worktree`), all Opus: **lane W** (Q1, then QW), **lane B** (QB; start the real 7-day run for `day-7` early, it takes about 2 hours), **lane S** (QS), **lane T** (QT, against a sample findings file until the others merge). The lane drawing in `steps.md` says what each waits for and how to work around it. You approve each lane's plan before it builds. Each lane writes its progress to `docs/spec/audit/lanes/<lane>.md` and reports to you. You merge their PRs after green CI, one at a time, rebasing the others. If usage runs low, pause lane T first, then lane S.
4. When all four are merged, do QR, with up to 5 fixer agents at a time.
5. Keep `STATUS.md` up to date before every commit and before you stop.

**No schedules.** Roman wants it built and run by hand first. Build every new workflow with `workflow_dispatch` only (start them yourself with `gh workflow run` when a step needs them); write the planned times as comments; never add a `schedule:` trigger or a Windows scheduled task. `qa.yml` on pull requests stays on. Roman switches schedules on later.

**Rules that always hold.**
- `packages/sim` stays pure and deterministic: no DOM, no network, no clock, seeded PRNG only. New measures go there with a test first.
- Every check has a planted-bug test that makes it fail. A check that cannot run writes `qa.check-did-not-run`, never a silent pass.
- Merge never sees the harness: no score, finding or threshold goes into a prompt, a plan check or Merge's repo. Never add a plan check, quota or variety rule on Merge; label such findings `needs-roman`.
- Against production you only read: GET requests to the site, `/health`, `/now.json`, `/places.json`, `/notes.json` and the GitHub API. Never post a note, never push to `RomanKuroptev/merge`, never touch the server.
- Never change `self/seed.md`, any cap, `brain/`, `mind/config.json`, the allowlist (it has its own source-trial rule) or the deploy, and never skip, disable or loosen a check or a test to get green. `qa/` thresholds and `test/planted/` change only in PRs labelled `qa-rules`, which you never merge yourself: list them for Roman.
- Money: Merge's $23 a month is not touched. Real model runs (the `day-7` fixture in Q1, behaviour in QB, QT and QR) use the harness budget of **$10 a month** with a run cap on every run; keep a running total in `docs/spec/audit/lanes/spend.md` and stop real runs when it is reached. Before a real run, check whether the R2 fast-forward copy still exists and reuse it.
- Merge rules: code PRs after green CI (including `qa.yml`); world look PRs after green CI and a separate look reviewer agent passes the before and after pictures against look.md and the world mockups; prompt PRs after the written checks, a 3-day real behaviour run that shows the score moved the right way, and a separate reviewer agent agrees. Engine releases with the `release` skill when the full harness is green (as for R1 and R2), then the pin-only commit in Merge's repo as before.
- Pictures for Roman are PNG, never SVG. Write for Roman in plain words: what is wrong, what it causes, what you did.

**Defaults Roman can change** (spec section 12): D1 $10 a month for real runs; D2 prompt fixes merge with checks + reviewer; D3 releases are automatic when green; D4 nightly `/qa` from a Windows scheduled task (write `qa/nightly.ps1` and the steps only; schedules stay off until Roman says so); D5 laptop fps is Roman's optional one command; D6 no SSH for the harness.

**QR must show.** The first full run finds by itself: the topic drift back to "loop"; no memes, and at which of the eight meme steps they stop; rest rising at the end of a run; the pulse sources that were promised but are not on the allowlist; Imgflip's list hardly changing; and every planted flaw in the world fixtures (the world explorer and the code checks). If one of these is not found, fix the harness first. Every explorer finding that is confirmed gets a code check in its fix PR. Then let the triage loop work until no blocker or major is open except `needs-roman` ones. A source that needs a choice (for example Mastodon, which blocks ClaudeBot by name) goes to Roman with a recommended answer.

**When you stop**, post one comment on the pinned "QA digest" issue and write `docs/spec/audit/lanes/done.md`: what the harness checks now (one line each), what it found, what was fixed and merged (PR links), what is waiting for Roman (one line each with your recommended answer), the world sheet as PNG, and a short behaviour and sources summary. After that the next job is the Merge fresh start (`docs/spec/v4/merge-fresh-start.md`); it waits for Roman's go, and when it runs, `/qa` checks a copy of the reset world before it is pushed.

---
