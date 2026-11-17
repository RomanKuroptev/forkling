# Spec v4 in parallel

Written 17 November 2026 at Roman's request: full scope, no step cut, parallel development, a bigger Claude plan. This replaces "one step at a time, about 3 live days each" in `README.md`. Everything else in spec v4 and the step files stays as written.

Target: all 8 steps and the new look live as soon as they are built and tested, with no waiting between steps.

## The idea in one paragraph

Everything runs on Roman's PC (Roman, 17 November). One Claude Code session is the **coordinator** (lane 0). It starts four helper agents, one per lane, each in its own git worktree, and they are built at the same time, each on its own branches, merging small PRs to `main` as soon as CI is green. Inside a lane the steps run in order. Between lanes the only rule is file ownership (below). The three live days per step are replaced by a **fast-forward test**: 7 simulated days on a throwaway copy of Merge, with a fake clock and real model calls, run before each release. There are two releases: **R1** (most of it) and **R2** (projects, once the sandbox is proven on the server). The 14-day run becomes a **soft launch**: Merge goes to a few friends while the run report is read after 1, 3 and 7 days of real running (the only part that is about time, because it measures Merge living, not code being finished).

## The lanes

| Lane | Steps | What it touches |
|---|---|---|
| 0. Integration | spec in the repo, fast-forward test, run report, golden prompts, STATUS.md, releases | `docs/`, `STATUS.md`, `CLAUDE.md`, `apps/mind/test/golden/`, `apps/mind/scripts/`, release files |
| A. Grow and wallet | step 1, then step 2 | `packages/sim` (interest families, build rules, allowance), `mind-plan.ts` (expand, found), write step and diary, `brain/credits.json`, `budget.ts` |
| B. Sandbox and projects | step 3, then step 4 | `apps/mind/src/builds/` (sandbox, session, project files), `packages/schema/src/project.ts`, the `build` verb, the server runbook |
| C. Visitors and tools | step 5, then step 6 | notes, threads, `memory/visitors.json`, requests, `mind/tools.json`, the weekly prompt |
| D. Look and front page | look L3, L1, L1b, L2, L4, then step 7 | `apps/viewer/`, `apps/site/`, `species/cat` model |

## File ownership (so the lanes do not fight)

- **One owner per hot file.** `packages/sim/src/allowance.ts` and `budget.ts`: lane A. `mind-plan.ts`: lane A for expand and found; lane B adds the `build` verb only after lane A's step 1 slice B is merged, by rebasing. `apps/viewer/` and `apps/site/`: lane D; other lanes that need something on the site (step 4's project page, step 5's threads, `site/changes.json` lines) add only data fields and a plain fallback, and lane D styles them.
- **Schema changes are additive.** New optional fields only on `MindState`, a work's `meta.json` and the like. Lane A adds `caption` to `meta.json`, lane C adds `inspiredBy`; neither removes or renames anything.
- **STATUS.md belongs to lane 0.** Lanes write their progress to `docs/spec/v4/lanes/<lane>.md` instead, and lane 0 folds it into STATUS.md each time a slice is merged.
- **Golden prompt files belong to lane 0.** A lane that changes prompt text opens its PR with the golden files updated, labelled `prompt-review`. It merges by the prompt rule in "Decided ahead", not by waiting for Roman.
- **Rebase on `main` before every PR.** Small PRs merge within hours, so drift stays small.
- **Merge rules.** A lane merges its own PR once CI passes. Prompt text, the look and new web hosts merge by their rules in "Decided ahead". Only lane 0 touches Merge's repo: the workflow pins at each release, and the approved seed sentence in `self/seed.md` at the release that carries step 4.

## Order of work, driven by what is finished

There is no calendar. Every lane starts at once and goes on to its next slice the moment the last one is merged. The only waits are the ones below, and each one ends when the thing it waits for is done.

| What | Starts when | Ends when |
|---|---|---|
| All lanes | v0.16.0 is released | each lane's last slice is merged |
| Lane 0: commit `docs/spec/v4/` and `look.md` | at the start, before the helpers | merged (the helpers start after this) |
| Lane 0: fast-forward command and run report (step 8's PR) | at the start | merged |
| Lane A: step 2 | step 1 is merged | merged |
| Lane B: step 3 server runbook | step 3's code is merged | the coordinator has run it over SSH and `/health` says `sandbox: ok` |
| Lane B: step 4 | step 3's code is merged (step 4 is built against `sandboxed: false` off the server) | merged |
| Lane B: `build` verb in `mind-plan.ts` | lane A's step 1 slice B is merged | merged |
| Lane C: step 6 | step 5 is merged | merged |
| Lane D: step 7 | look L4 is merged | merged |
| A `prompt-review` PR | the lane opens it | it passes the prompt rule in "Decided ahead" and CI |
| **R1** release | lanes A and C are done, step 3's code and look L3 to L4 are merged, and a fast-forward run passes on `main` | released, Merge's pins moved, live check done |
| **R2** release | step 4 and step 7 are merged, `sandbox: ok` on the server, and a fast-forward run with them passes | released, live check done |
| Soft launch | R2 is live | the run report after 7 days live passes the launch checklist |

A lane that has to wait works on its next slice, or on fixes from the last fast-forward run, until the wait ends. R1 and R2 may also be one release if everything for R2 is ready by the time R1 is.

How long it takes is decided by how fast the code is written, and the usage limits. As a rough guide only, it could be under a week.

## The fast-forward test (replaces the 3 live days)

Lane 0 builds `pnpm --filter @forkling/mind fast-forward --world <clone> --days 7 --cap 3`, kept in the repo for later use. It is the W5 local test made reusable:

- A fresh clone of `RomanKuroptev/merge` with its remote removed, so nothing can be pushed.
- `createLoop` and the build worker on a fake clock, real Haiku and Sonnet calls, a hard cap of $3 for the run, the real web allowlist (read-only, with its rate limits).
- At the end it runs the run report on the copy and writes a short summary: rejections, failures, repeats, spend per day, what got made, screenshots of the works and projects.
- It passes when there are no crashes, no rails broken, spend is under the daily pace, and something visual was made every simulated day. Anything else goes back to the lane that owns it.

Expected cost: about $1 to $2 a run, two or three runs in all.

## Roman's part

1. **Nothing for the server.** Claude Code does the step 3 server setup itself over SSH (Roman, 17 November); see item 8 of "Decided ahead".
2. **A bigger plan** for the build (an org premium seat, 17 November), because five agents run at once. Models: the coordinator runs on Opus (pick it with `/model` before pasting), helpers A, C and D on Sonnet, helper B (the sandbox) and reviewer agents on Opus. No plan mode: helpers run in the background and the coordinator approves their plans. A 5-hour window will likely run out before it ends; nothing is lost, and after the reset the coordinator (or a re-pasted prompt) continues from STATUS.md and the lane files.
3. **The PC:** keep it awake and the coordinator window open until R2; paste the coordinator prompt once at the start (and again after a restart).
4. **After each release:** read the coordinator's list of what changed and revert anything he dislikes. Nothing waits for this.

## Decided ahead (Roman, 17 November, "yes to all")

These replace every review that used to stop a lane. The coordinator and the helpers apply them and do not ask.

1. **Prompt changes merge without Roman** when all of these hold: the seed's voice is kept (no line contradicts `self/seed.md`); no new rule, quota, plan check or variety rule is added (spec v4's standing rule); web text and notes stay wrapped as data, never instructions; the golden files are updated in the same PR; and a separate reviewer agent, given only spec-v4.md section 0, the seed and the diff, says the change passes. The PR body explains each change in plain words. This overrides CLAUDE.md's "brain changes need Roman's review" for this build only.
2. **Look changes merge without Roman** when a separate reviewer agent, given the mockup PNGs in `docs/spec/v4/look/` and the PR's screenshots at 390 px and 1280 px, finds them close (same palette, layout and parts) and the viewer still builds and runs. The screenshots stay in the PR.
3. **Front page:** build the "Merge 95" mockup (`docs/spec/v4/look/front-*.png`) as it is.
4. **New web hosts** are added automatically when their robots.txt allows the paths and their source trial passes the marks of v3.3 6.5. Never Reddit or Know Your Meme. Read-only GET requests only, as always.
5. **Seed sentence (step 4 slice E): yes.** Add after "…and you find your own limits funny.": "You like projects that are a bit too big for you, and you would rather fail at something interesting than finish something dull."
6. **First tool (step 6):** whatever Merge asks for first in its tool requests, built if it is a read tool and its source trial passes. No act tool.
7. **Points per day (step 2):** the formula's number from spec-v4 5.2, kept between 200 and 400, with no question to Roman.
8. **The step 3 server setup is done by Claude Code over SSH** (Roman, 17 November), as on 12 November for W3, with Roman's SSH key from his PC (root@merge-mind.duckdns.org). Lane B writes `step-3-runbook.md` first; then the coordinator (not a helper) runs it step by step, while Merge is asleep or between ticks, checks the expected output after each command, and stops on the first surprise. Rules: run only the runbook's commands; never print, copy or change keys, `.env` files, the Anthropic key or tokens; never touch the firewall, SSH settings or other users; never `rm -rf`; Chromium's own sandbox stays on (if the kernel blocks it, stop and ask Roman). Each command and its output goes into `docs/spec/v4/lanes/server-log.md`. Done when `sandbox-proof` passes and `/health` says `sandbox: ok`. If anything fails, undo by the runbook's own undo steps and tell Roman.

## The coordinator (lane 0) on Roman's PC

Roman chose the PC (17 November). One Claude Code window in `C:\Code\forkling` is the coordinator. It does lane 0's own work and runs the other four lanes as helper agents.

- **Helpers.** The coordinator starts one helper agent per lane (A to D) with the Agent tool, each with `isolation: "worktree"` (its own copy of the repo, so the lanes never share a working folder) and running in the background. Each helper gets the opening below plus its lane's part.
- **Talking between lanes.** Helpers do not talk to each other. Each writes `docs/spec/v4/lanes/<lane>.md` on its branch and reports back to the coordinator when a slice is merged, when it is blocked, or when it needs Roman. The coordinator passes the news on ("step 1 slice B is merged, lane B may rebase now") by continuing that helper with a message.
- **Merge order and conflicts.** The coordinator holds the merge order, settles any file both lanes need, and updates STATUS.md from the lanes files each time a slice is merged.
- **Roman's one voice.** Roman talks only to the coordinator window. After each release it gives him one list: every prompt change in plain words, the look screenshots next to the mockups, new web hosts added, and where each lane stands. During the build it only asks him when a rule in "Decided ahead" cannot decide something, or when the server setup hits a surprise.
- **When the session ends.** A long session gets summarised as it grows and carries on. If the window is closed or the PC restarts, Roman opens Claude Code again and pastes the same coordinator prompt: it reads STATUS.md, the lanes files and the open PRs, and restarts the helpers where they stopped. Nothing is lost that is not in git.
- **Keep the PC awake.** Windows sleep stops everything: set "Sleep" to "Never" while plugged in (Settings, System, Power) until R2, and leave the window open.

### The coordinator prompt (Roman pastes this once)

```
You are the coordinator (lane 0) of the parallel build of spec v4. First check that v0.16.0 is live: the deploy.yml run for tag v0.16.0 succeeded, /health shows up: true with no "push failing", and Merge's repo pins FORKLING_REF to v0.16.0; if not, stop and tell me. Then read docs/spec/v4/parallel-plan.md, CLAUDE.md, STATUS.md and docs/spec/v4/spec-v4.md section 0.
1. Do lane 0's first work yourself: commit docs/spec/v4/ (with look.md and look/), then start the fast-forward command and step 8's run report.
2. Start lanes A, B, C and D as background helper agents with the Agent tool, each with isolation "worktree", each given the helper opening and its lane part from the plan.
3. Keep the merge order, pass news between helpers, settle shared files, update STATUS.md from docs/spec/v4/lanes/ each time a slice is merged. There is no calendar: every lane moves on as soon as its last slice is merged, and the waits are only those in the plan's table.
4. Run the fast-forward tests and the releases R1 and R2 as soon as their conditions in the plan's table are met, including the commit in RomanKuroptev/merge: only FORKLING_REF in the four workflows, plus, at the release that carries step 4, the approved seed sentence in self/seed.md. Nothing else there.
5. Apply the rules in the plan's "Decided ahead" section instead of asking me. Run the step 3 server setup over SSH yourself, by rule 8 of "Decided ahead". Ask me only when those rules cannot decide something or the server setup hits a surprise. After each release, give me one list: every prompt change in plain words, look screenshots next to the mockups, new web hosts, each lane's state.
6. Start helpers A, C and D with model sonnet and helper B with model opus; reviewer agents use opus. Helpers do not use plan mode and do not wait for my approval; you approve their plans. If a usage limit stops work, pause lane D first, and when the limit resets, pick up from STATUS.md and docs/spec/v4/lanes/.
If you were restarted, read STATUS.md, docs/spec/v4/lanes/ and the open PRs, and pick up where the lanes stopped.
```

## Helper prompts

Each helper gets the same opening, then its own part.

```
You are lane <X> of the parallel build of spec v4, started by the coordinator. You work in your own worktree. Read docs/spec/v4/parallel-plan.md first, then CLAUDE.md, STATUS.md, docs/spec/v4/spec-v4.md section 0, and your step files. Follow the file ownership rules in the plan. Work in small PRs on branches claude/v4-<lane>-<slice>, tests first, rebase on main before each PR, merge your own PR when CI passes; prompt text (label prompt-review), the look and new web hosts merge only by their rules in the plan's "Decided ahead" section; never touch RomanKuroptev/merge. Write your progress to docs/spec/v4/lanes/<lane>.md, not STATUS.md. Do not wait for live days: the fast-forward test replaces them. Report to the coordinator when a slice is merged, when you are blocked, or when a rule in "Decided ahead" cannot decide something; when blocked on another lane, work on your next slice.
```

- **Lane A:** "Build step 1, then step 2. Step 2's 'start only after step 1 has run live for 3 days' is replaced by the fast-forward test. The audit's weekly price reset (PR #173) is replaced by step 2 slice B: keep its tests where they still hold."
- **Lane B:** "Build step 3, write its runbook, then step 4. Build step 4 against runInSandbox with sandboxed:false off the server; the server refuses sessions until /health says sandbox: ok, so R2 waits until the coordinator has run the runbook over SSH. Slice E adds the seed sentence Roman approved (see "Decided ahead") as its own PR, in the engine template and as part of lane 0's release commit to Merge's self/seed.md."
- **Lane C:** "Build step 5, then step 6 slices A and B. The first tool is the one Merge asks for first in its tool requests; build it if it is a read tool, after its source trial passes; an act tool is never built."
- **Lane D:** "Build the look slices in the order of look.md (L3, L1, L1b, L2, L4), then step 7 from the Merge 95 front page mockups in docs/spec/v4/look/. Merge a look PR when the look rule in "Decided ahead" passes; keep the screenshots in the PR for Roman to see after. Other lanes add data for the site; you style it."

## Risks, and what covers them

- **Everything changes at once, so a strange day is harder to explain.** The tick log, the run report and a one-command rollback (deploy the previous tag) cover it.
- **The fast-forward test misses things only real days show** (memory over many nights, visitors). The soft launch is the real test; the run report after 1, 3 and 7 days of real running watches it.
- **Usage limits.** Five agents at once can hit even a bigger plan's limits. If one lane stalls, the others carry on; lane D is the one to pause first, because the old look still works.
- **Decided ahead means checked after.** Roman sees every prompt change and look in plain words after each release and can undo any of them with a revert PR.
