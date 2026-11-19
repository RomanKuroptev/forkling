# The one prompt: build the audit harness, run it, fix what it finds

Paste everything between the two lines into Claude Code in `C:\Code\forkling` (Opus). Paste it again after a restart; it picks up from `STATUS.md` and `docs/spec/audit/lanes/`.

---

You are the coordinator for building forkling's audit harness. Read, in this order: `CLAUDE.md`, `STATUS.md`, `docs/spec/audit/README.md`, `docs/spec/audit/spec.md`, `docs/spec/audit/steps.md`. Then read only the parts of `docs/spec/v4/` that a step points to (look.md and `docs/spec/v4/look/site/README.md` for the look; spec-v4 sections 2 to 10 for the flows).

**Goal.** Build the harness in steps Q0 to Q8, then do Q9: run it, fix what it finds, release. Roman should not have to spot or prompt small issues again. Work until Q9 is done or you are blocked on something only Roman can decide.

**How to work.**
1. First commit `docs/spec/audit/` itself on a branch, one PR, merge after green CI.
2. Do Q0 and Q1 yourself, one PR per numbered item where it makes sense, tests first, merge each after green CI.
3. After Q1, run Q2, Q3, Q4, Q5 and Q6 as helper agents in their own worktrees (Agent tool, `isolation: worktree`), one lane each; Sonnet for Q2, Q3, Q6, Opus for Q4 and Q5. You approve each lane's plan before it builds. Each lane writes its progress to `docs/spec/audit/lanes/<step>.md` and reports to you. You merge their PRs after green CI, one at a time, rebasing the others. If usage runs low, pause Q6 first, then Q3.
4. Then Q7 and Q8 yourself, then Q9.
5. Keep `STATUS.md` up to date before every commit and before you stop.

**Rules that always hold.**
- `packages/sim` stays pure and deterministic: no DOM, no network, no clock, seeded PRNG only. New measures go there with a test first.
- Every check has a planted-bug test that makes it fail. A check that cannot run writes `qa.check-did-not-run`, never a silent pass.
- Merge never sees the harness: no score, finding or threshold goes into a prompt, a plan check or Merge's repo. Never add a plan check, quota or variety rule on Merge; label such findings `needs-roman`.
- Against production you only read: GET requests to the site, `/health`, `/now.json`, `/places.json`, `/notes.json` and the GitHub API. Never post a note, never push to `RomanKuroptev/merge`, never touch the server.
- Never change `self/seed.md`, any cap, `brain/`, `mind/config.json`, the allowlist (it has its own source-trial rule) or the deploy, and never skip, disable or loosen a check or a test to get green. `qa/` thresholds and `test/planted/` change only in PRs labelled `qa-rules`, which you never merge yourself: list them for Roman.
- Money: Merge's $23 a month is not touched. Real model runs (fixtures in Q1, behaviour in Q5 and Q9) use the harness budget of **$10 a month** with a run cap on every run; keep a running total in `docs/spec/audit/lanes/spend.md` and stop real runs when it is reached. Before a real run, check whether the R2 fast-forward copy still exists and reuse it.
- Merge rules: code PRs after green CI (including `qa.yml`); look PRs after green CI and a separate look reviewer agent finds the pictures close to the mockups; prompt PRs after the written checks, a 3-day real behaviour run that shows the score moved the right way, and a separate reviewer agent agrees. Engine releases with the `release` skill when the full harness is green (as for R1 and R2), then the pin-only commit in Merge's repo as before.
- Pictures for Roman are PNG, never SVG. Write for Roman in plain words: what is wrong, what it causes, what you did.

**Defaults Roman can change** (spec section 12): D1 $10 a month for real runs; D2 prompt fixes merge with checks + reviewer; D3 releases are automatic when green; D4 nightly `/qa` from a Windows scheduled task (write `qa/nightly.ps1` and the steps; do not create the task unless Roman says so); D5 laptop fps is Roman's optional one command; D6 no SSH for the harness.

**Q9 must show.** The first full run finds by itself: the merge.exe LIVE pane is a drawn picture and not the live 3D island; the mockup features with no data (cards' why box and source line, faces row, dated phases on the retired page, project progress bar); the topic drift back to "loop"; no memes; rest rising at the end of a run. If one of these is not found, fix the harness first. Then let the triage loop work until no blocker or major is open except `needs-roman` ones. The LIVE pane and the missing-data features each get a small written plan in their issue before they are built.

**When you stop**, post one comment on the pinned "QA digest" issue and write `docs/spec/audit/lanes/done.md`: what the harness checks now (one line each), what it found, what was fixed and merged (PR links), what is waiting for Roman (one line each with your recommended answer), and the contact sheets of the front page and the world as PNGs. After that the next job is the Merge fresh start (`/mnt/project-files/forkling-v4/merge-fresh-start.md` copy in the repo, if present): run `/qa` on a copy of the reset world before it is pushed.

---
