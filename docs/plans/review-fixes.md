# Review fixes (before M8)

## Context
On v0.7.3, Merge's affection can never rise, so it sits at 0. That keeps a need "critical" forever, which wakes Haiku every 30 minutes, pins the mood at `upset`, and takes away the plan step's guaranteed turn. The day's plan (about 2 hours) is never replaced, so the rest of the day is drift. The plan describes what the files say; the utility AI decides what visitors see. On top of that, the builder can be cancelled by the tick, obsessions can feed themselves, beliefs can be strengthened by Merge's own thoughts, and most of what Merge writes never comes back into a prompt.

Goal: before the M8 two-week run, Merge plans and acts all day, does what it says it did, can build things, and learns from its past. No new LLM call types. Spend stays well under $10 a month.

Roman's decisions (review section 9, plus the answers given during planning):
- 9.1 A: remove affection; it returns with the visit gateway.
- 9.2 A: the plan owns the visible action.
- 9.3 A: code asks for a new plan when the last step ends.
- 9.4: measure first, propose numbers in the slice 2 PR.
- 9.5: mood weights the draw and appears in prompts.
- 9.6: reading titles and past obsessions go in the morning prompt; an obsession fades even if Merge keeps reading about it.
- 9.7: builds get their own concurrency group.
- 9.8: no 2-hour nudge.
- Tick log: every tick commits, with the prefix `tick:`. The viewer first anchors on state that only commits touching `forkling.json` can move.
- Bowl: a few portions a day, shown in the prompt; an empty bowl must never leave hunger critical for over an hour.
- `need` trigger: only for needs drift can't fix. Drift interruptions are logged and mentioned in the next decide or replan prompt.

## Ground rules for every slice
- **Branches and PRs:** each slice has its own branch and PR. Slice 1 branches from `docs/system-review`, and each later slice from the previous one. A PR's base is the previous slice's branch, so the diffs stay readable. I push branches and open PRs but **never merge**.
- **Tests first:** write the Vitest test first and see it fail, then write the code. Small commits.
- **Before every commit:** run `pnpm typecheck` and `pnpm test` from PowerShell (Git Bash has no pnpm).
- **End of each slice:** update STATUS.md, and fill in the "As built" note in this file for that slice.
- **Golden prompt files** (`apps/mind/test/golden/`) are regenerated deliberately, and each PR shows the diff.
- **Brain and persona:** I won't touch `brain/persona.md`. Prompt text changes are called out in each PR for Roman's review.
- **Stop and ask** if something needs a decision not made above, or would break a CLAUDE.md rule.

---

## Slice 1: stop the loop (branch `fix/stop-the-loop`)
**Closes:** 1.1–1.6 (the chain), 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, and 9.1. It does part of 2.5 (prompt text).

**Tests first**
- `species/cat/test/pack.test.ts`:
  - The needs are `curiosity`, `energy`, `hunger`.
  - The "follow is the only affection source" test becomes "`follow` raises no need".
  - Update the `runHeadless` needs argument at :332.
- `packages/sim/test/surprise.test.ts`, `replan` trigger:
  - It fires when the day is planned but there is no current step, and also when `stepDone` fires on the last step.
  - It does not fire before `mind.replanAfter`, within 45 minutes of bed, or while asleep.
  - `blocked` fires once per step (it tracks `mind.blockedStep === goals.now.startedAt`).
- `apps/mind/test/tick.test.ts`, changing the tests that pin today's behaviour (:144, :198, :203):
  - **3.1:** a morning plan rejected twice still sets `lastPlanDate`, so the feed skim isn't repeated, and it sets `replanAfter = now + 60 min`. After the cooldown, a decide call with `replan` asks again.
  - **3.2:** when a replacement plan is rejected, the current `goals.now`/`today` stay if they're still from today.
  - **3.3:** the last step ending leads to a decide call whose prompt says the plan is finished and how many hours remain until bed. If that call returns no plan, `replanAfter` is set (cooldown), and the next ask happens after 60 minutes, not on the next tick.
  - **3.4:** with no decision (budget refused, no key, call failed), a finished step still moves to the next step, and the `route` free path is taken when thinking is impossible. After a failed call, every trigger except `newDay`/`bedtime` is muted for 30 minutes (`mind.thinkFailedAt`).
  - **3.5:** `blocked` asks once. If the answer has no plan, code skips the blocked step (stream line "skipped X: target gone") and moves on.
  - **3.6:** a decision that has both a `design` and a plan containing a `code` step is checked against the quotas from *before* the design took the build slot.
  - **3.7:** a weekly tick does not mark new objects as known.
  - The need-trigger tests now use `hunger: 3` instead of affection.
- **New `apps/mind/test/day.test.ts`, a headless full template day with no visitors.**
  - Setup: copy `templates/forkling-world` to a temp dir and run `runTick` every 10 minutes for 24 hours, starting on a weekday at 00:03 local time, using the real cat pack and its decay rates. While asleep, only the :03 tick runs, like the gate.
  - The fake LLM writes valid 2–3 hour plans from the template objects and answers the art and reading calls. Feeds are stubbed.
  - Assertions:
    - (a) No need stays under 15 for more than 60 minutes in a row, measured at the tick samples in `forkling.json`.
    - (b) A plan step is in progress (`goals.now` set, not past `until` plus grace) for at least 80% of the waking ticks.
    - (c) Decide calls (morning plus decide) are **at most 12 a day**. That's 1 morning, about 6 replans (15.5 waking hours divided by plans of 2–3 hours), and room for about 5 novelty, blocked or unfixable-need calls. Today's loop alone makes about 30 a day.
  - Extra assertions: no LLM call while asleep except the memory batch, and the week's spend from the fake ledger stays under the pace for $10 a month.
  - Target time is about 30 seconds; the timeout is 120 seconds.

**Changes**
- `species/cat/species.json`: remove the `affection` need and set `follow` to `satisfies: {}`.
  - `createForkling` already drops needs the pack doesn't declare (`forkling.ts:139`), so Merge's stored `affection: 0` disappears on the first tick.
  - Update `templates/forkling-world/forkling.json` and `templates/merge/forkling.json`.
  - Add "affection returns with the visit gateway" to `docs/future.md`.
- **The `need` trigger only fires for needs drift can't fix** (`packages/sim/src/surprise.ts`). `SurpriseInput` gets `fixableNeeds`, worked out by the caller from the actions that are eligible now and satisfy that need (a new pure `fixableNeeds()` in `utility.ts`). The 30-minute cooldown stays.
- `packages/sim/src/surprise.ts`: new trigger kind `replan` (score 0.45) and a once-per-step rule for `blocked`. `MindState` (`packages/schema/src/mind.ts`) gets the optional fields `replanAfter`, `blockedStep` and `thinkFailedAt`.
- `apps/mind/src/tick/route.ts`:
  - Works out `canThink` (budget, key, failure cooldown).
  - If it can't think and `stepDone` has more steps, it takes the free path.
  - `replan` maps to `decide`.
- `apps/mind/src/tick/apply-decision.ts`:
  - The plan check moves above the design block (3.6).
  - A rejection keeps today's still-valid `goals.now` (3.2).
  - A rejection, or a plan-less answer to `replan`, sets `replanAfter` (60 minutes).
  - A plan-less answer to `blocked` skips that step.
  - `knownObjects` is only merged on decide and morning ticks (3.7).
- `apps/mind/src/tick/advance.ts` (new, runs after `think` even when there's no decision): moves a finished step on, or deletes `goals.now`. `applyDecision`'s early return no longer strands the plan (3.4).
- `apps/mind/src/tick/ask.ts`: sets `mind.thinkFailedAt` when a call fails or is refused.
- `apps/mind/src/prompts/decide.ts` and `user.ts`:
  - When `replan` fires, the task says "your plan is done (or there is none since HH:MM); write the next one for the remaining N hours".
  - `system.ts:112` "do not plan around needs" becomes "the body tops needs up by itself between steps".

---

## Slice 2: observability (branch `obs/ticks-health`)
**Closes:** section 7 items 1–5, 7.6 (the engine ref is recorded), 2.3, and 2.2 (moved here, see below). It measures 1.7 and every "estimate", and proposes 9.4.

**Anchor first:** the viewer uses `forkling.json`'s own `lastTickAt` as `stateTime`, not the commit time.
- `lastTickAt` only changes in commits that write `forkling.json`, so quiet tick commits, art and builder merges no longer move it (2.3).
- It is exactly the mind's anchor (`tick/create.ts:61`), so both replay the same walk (2.2).
- Test: `packages/sim/test/playback.test.ts` checks that the mind's input and the viewer's input give identical traces. A viewer unit test checks that `stateTime` comes from `lastTickAt`. Files: `apps/viewer/src/forkling/Forkling.tsx:63`, `loadWorld.ts`.

**Tests first**
- `packages/schema/test/ticks.test.ts`, a `TickLine` schema with these fields:
  - `at`, `engine`, `asleep`
  - `triggers[{kind, score}]`, `think`, `calls[{kind, model, usd, ok, error?}]`
  - `notes`, `stepBefore`, `stepAfter`, `planId`
  - `needs`, `mood`, `drift[]` (filled in slice 3)
  - `wrote[]`
- `apps/mind/test/ticks.test.ts`:
  - Every tick appends one line, including a quiet tick. Files older than 14 days are pruned.
  - A quiet tick writes only `mind/ticks/` and `mind/health.json`.
  - The CLI output `kind` is `tick` (log only) or `world`.
- `apps/mind/test/health.test.ts`, a pure `buildHealth(prevHealth, line, world)` that computes:
  - the last tick and its outcome
  - the plan state (step, overdue, steps left, last replan)
  - quotas used against their limits, and triggers and calls by kind today
  - rejections and failures today
  - minutes each need has spent under 15, and the mood streak
  - spend against pace, and the age of the open build
  - `warnings`, with tests for each: need critical for more than 1 hour, no plan for more than 1 hour while awake, the same step 3 or more times today, more than 15 decide calls today, spend ahead of pace, a build open for more than 48 hours, no tick for more than 30 minutes while awake (seen on the next tick)
- `packages/sim/test/report.test.ts`, a pure `simReport()`:
  - Runs N days on a seed against the starter world with the sleep schedule and a rolling scripted plan.
  - Returns time per verb, plan-win share, need minima, the share of time each need was critical, and the longest critical streak.
  - Deterministic for a given seed.
- `apps/mind/test/replay.test.ts`, a pure core: given a list of (commit time, `forkling.json`, `goals.json`) states, it rebuilds the canonical body timeline and the share of awake time spent on the plan verb.

**Changes**
- `apps/mind/src/ticklog.ts` (new): append, prune and health.
  - Called from `tick/write.ts`, which returns `kind`.
  - `cli.ts` writes `kind` to `GITHUB_OUTPUT`.
- `templates/forkling-world/.github/workflows/mind.yml`:
  - Tick-log commits use the message `tick: <summary or quiet>`; world commits keep `chore(mind): …`.
  - `ENGINE_REF` is passed into the tick.
  - Pages is dispatched only for world commits.
  - Update `templates/test/templates.test.ts`.
- `packages/sim/src/headless.ts`:
  - New options `sleep` (uses `isAsleepAt`) and `plan` (rolling focus steps).
  - `ForklingState` gets optional pure counters (`focusWon`, `focusLostCritical`, `focusLostTarget`, `driftFor[need]`) that `replan()` increments.
  - `packages/sim/src/report.ts` is the pure aggregation.
- **CLIs** in `apps/mind`, following the `project-cli.ts` pattern (Node lives there, so `packages/sim` stays free of `node:`):
  - `sim-report-cli.ts`: `pnpm --filter @forkling/mind sim-report --days 14 --seed S [--seed2 T]`.
  - `replay-cli.ts`: `pnpm --filter @forkling/mind replay --world <clone> [--from --to]`. It reads `forkling.json` and `goals.json` history with `git log`/`git show`.
- `.claude/skills/live-check/SKILL.md`:
  - Read `mind/health.json` and today's ticks lines with `gh api`, and print a verdict plus the warnings.
  - Fall back to the old checklist if the files don't exist yet.
- **Investigations, written up in the PR:**
  - Run the sim report on the template, and on Merge's seed and temperament, before and after slice 1. Replace each *estimate* in `docs/review-2026-11.md` with the measured number.
  - **1.7:** match the `gh run list -R RomanKuroptev/merge` runs and the commits for 2026-11-01 07:53–09:13 against the four possible causes (no tick ran, a decide call with no decision, the model re-sending step 0, a rejected replacement plan). Report which it was, and add a test if it's a code path not already fixed in slice 1.
  - **9.4 proposal:** measured hours to empty for each need and how often drift interrupts a step. Proposed rates (for example 5× slower), plus the bowl portion count, for Roman to approve before slice 5 uses them.

---

## Slice 3: plan owns the body, and honesty (branch `fix/plan-owns-body`)
**Closes:** 9.2, 2.1, 2.5, 2.6, 2.7, 2.9, 4.4, 4.6. The drift-interruption logging covers Roman's addition.

**Tests first**
- `packages/sim/test/focus.test.ts`:
  - With a focus and a need under 15 that an eligible action can fix, the body does one fixing action, then returns to the focus.
  - With an unfixable critical need, the focus still wins.
  - With no focus, behaviour is unchanged.
- `packages/sim/test/forkling.test.ts`:
  - **2.9:** a resumed `firstAction` that fails `requirementsMet` (for example `sleep` by day) is replaced by a normal choice.
  - **2.6:** while asleep by schedule, only verbs whose `requires` includes `night` are eligible.
- `packages/sim/test/playback.test.ts`, `tallyWindow(input, fromMs, toMs)`:
  - It replays the canonical body across epoch boundaries: the old anchor up to the boundary, then the epoch restart.
  - It returns acting seconds per verb and the drift interruptions (`{verb, need, at}`) during the focus.
  - A window that crosses an epoch boundary equals the sum of its parts.
- `apps/mind/test/tick.test.ts` and `making.test.ts`, **2.1**:
  - `goals.now.workedSec` grows by the tallied acting time on the step verb.
  - At `until`, the effect and XP land only if `workedSec >= 60%` of the step's minutes.
  - Otherwise the step is extended once by its own length. If it's still short, it ends as *unfinished*: no effect, no XP, a stream line, and the next step starts.
  - XP equals the minutes actually worked.
- **2.7:** a plan replaced mid-step lands the old step's effect if the 60% was reached; otherwise it logs "left X unfinished".
- **Drift interruptions** end up in the tick line's `drift[]`, and the next decide or replan prompt contains a line like "you broke off shape twice to eat". There's a golden file for it.
- `packages/sim/test/claims.test.ts`, **4.4**:
  - `strengthen` needs evidence.
  - Evidence must be stream entries newer than the belief's last update, of kinds other than `thought`, `trigger` and `rejected`.
  - A journal paragraph must cite at least one entry that isn't a `thought`.
- `apps/mind/test/tick.test.ts`, **4.6:** a decide call that returns the same long-goal text doesn't move `reviewedAt`; only a weekly tick or a changed text does.

**Changes**
- `packages/sim/src/forkling.ts` (`replan`, :354-406):
  - `critical` becomes `criticalFixable`, using the slice 1 `fixableNeeds`.
  - Add a requirements check to `firstAction`.
  - Increment the counters.
- `packages/sim/src/utility.ts`: the asleep eligibility rule (2.6).
- `packages/sim/src/playback.ts`: per-verb tally in `stepOnce`, plus `tallyWindow`.
- **2.5:** with fixable needs topped up by short drift, long making steps no longer fall into permanent drift. The prompt line was changed in slice 1. Confirm with the sim report numbers in the PR.
- `apps/mind/src/tick/create.ts`: compute the tally from `lastTickAt` to now.
- `apps/mind/src/tick/apply-step.ts`: the 60% rule and the extension.
- `packages/schema/src/goals.ts`: `now.workedSec?` and `now.extended?`.
- `packages/sim/src/claims.ts` (:13, :36) and `apps/mind/src/tick/bedtime.ts` (`streamIds` comes with kinds and times).
- `apps/mind/src/tick/apply-decision.ts`, for 4.6.

---

## Slice 4: builder (branch `fix/builder`)
**Closes:** 9.7, 6.1, 6.2, 6.3, 6.6 (rule text), 6.8, 6.10, 6.13. **6.7** gets Roman's steps.

**Design.** The builder never writes the tick's files again (`mind/state.json`, `brain/budget.json`, `memory/stream`).
- Its job ends by writing **`mind/builds/<id>.result.json`** with `{ status: designed|pr-open|failed|closed, pr?, usd, calls[], at }`.
- A small follow-up job **`books`** commits that one file to `main`, in its own group `build-books`, with a `pull --rebase` retry loop. That file has no other writer, so it can't conflict.
- The tick is the only writer of the shared files. `settleBuild` reads the result: it books the cost into the ledger, adds stream lines and updates `openBuild`.

**Tests first**
- `templates/test/templates.test.ts`:
  - `build.yml` has `group: build-${{ inputs.id }}`, not `mind`.
  - The `books` job only does `git add mind/builds/`.
  - `validate.yml`'s group includes the event name, so the `pull_request` and `workflow_dispatch` runs don't cancel each other (6.8).
  - `mind.yml` dispatches pages for `forkling.json` and `mind/goals.json` too, diffing against the pre-rebase SHA (6.10).
  - A `pull_request: closed` job writes `closed` or `merged` into the result file.
- `apps/mind/test/builds.test.ts` and `build-tick.test.ts`:
  - The result's cost lands in the ledger once (idempotent by build id).
  - `failed` or `closed` refunds the daily or weekly slot (6.3).
  - A code build with `pr-open` never expires, and it doesn't block object builds. Objects still allow one at a time, and so do code PRs (6.2).
  - A merged code PR (its art or project file appears on `main`) is noticed even after 72 hours.
  - An object build still expires after 72 hours if it never produced a result.
- `apps/mind/test/budget.test.ts` (6.13):
  - A ledger with `month: ""` (the new template value) rolls to the current month with no history row.
  - `rollLedger` never rolls backwards.

**Changes**
- `build.yml`, `validate.yml` and `mind.yml` in `templates/forkling-world/.github/workflows/`.
- `apps/mind/src/design.ts` and `project.ts`: write the result file, not the books.
- `apps/mind/src/builds.ts`, `tick/settle-build.ts` and `budget.ts`.
- `packages/schema/src/mind.ts`: a `BuildResult` schema, and `openBuild` split into `openObject` and `openCode`, with migration from `openBuild`.
- The template's `brain/budget.json` gets `"month": ""`.
- **6.6:** the root `CLAUDE.md` rule becomes: "the builder's PRs touch only `objects/`, `art/`, `site/`, `notebook/`, `journal/`; its only direct commit to `main` is its own `mind/builds/<id>.result.json`". I'll also update `apps/mind/CLAUDE.md`.
- **6.7, steps for Roman, done in GitHub.** I'll check the current GitHub docs while implementing; draft:
  1. Create a fine-grained PAT for `RomanKuroptev/merge` only, with contents, pull requests and actions read/write. Store it as the secret `BUILDER_TOKEN`; `build.yml` will use `secrets.BUILDER_TOKEN || github.token`.
  2. Add a ruleset on `main` that blocks force pushes and deletion.
  3. Because the mind commits to `main` on every tick, "require a PR" needs a bypass for the Actions identity. I'll check whether a ruleset can allow it. If it can't, the CLAUDE.md wording becomes "protected against force push and deletion", for Roman to approve.

---

## Slice 5: memory and feelings (branch `feat/memory-feelings`)
**Closes:** section 5, 9.5, 9.6, 4.1, 4.2, 4.3, 4.8, the rule 8 skill group, quotas in the prompt, and give/hide/bed/bowl. It applies the 9.4 rates once Roman has approved them in slice 2.

**Tests first**
- **Prompts** (`apps/mind/test/prompts-golden.test.ts`, golden files):
  - **Morning and weekly** get a "your recent past" block of at most about 600 tokens:
    - the last 3 reading notes, each with title plus a one-line summary, from `notebook/reading/`
    - past obsessions with their dates (from `interests.past`)
    - yesterday's and the day before's plan reasons (from `notebook/plans/`)
    - the last 10 art titles with kind and date
  - **Decide** gets the reading titles, quotas and drift interruptions.
  - **All three** get remaining quotas (creative, photos, readings, code, designs) and the bowl portions left.
  - **The morning task** no longer asks for `stayUpLate` (4.8).
- `packages/sim/test/interests.test.ts`:
  - **4.1:** a topic that is the obsession gains `FEED_STEP × max(0, 1 − ageDays/3)`, so reading can't sustain it after about 3 days. The test reads it 4 times a day and checks the obsession still ends within 7 days.
  - A past obsession can't restart for 14 days.
  - **4.2:** `topicKey` folds case, punctuation and simple plurals ("octopuses" becomes "octopus", "-ies" becomes "-y"). Existing duplicates are merged when loaded.
- `packages/sim/test/utility.test.ts`, **9.5:**
  - `ScoreContext.feelings` multiplies each action's weight in [0.7, 1.4]. High arousal favours run gaits and energy-costing verbs; low valence favours rest verbs (those that satisfy energy, or have `sit`/`sleep` slots).
  - It uses generic action fields only. It's deterministic, and the viewer gets the same input from `forkling.json`.
- `packages/sim/test/appraisal.test.ts`: `created` and `read` have positive impact, and a build arriving counts as `finished`.
- `apps/mind/test/art-tick.test.ts`, **rule 8:** quality reads the skill of the verb that made the artifact (`tinker` uses making, `cook` uses growing).
- **Dead parts:**
  - `give` is removed from the pack; it returns with the visit gateway (`docs/future.md`).
  - `hide` becomes an `effect: none` body verb, so it drifts and the `shy` quirk counts.
  - **The bed:** a generic pack hook `target.prefer` (a `where` filter) lets `sleep` and `nap` go to a `soft` object if one exists, and otherwise behave as today. Tested on the blob pack too.
  - **The bowl:** an object property `portions`/`refill: "wake"` (generic). Eating takes one portion, and the mind refills it at wake.
  - Drift checks `hands` (no `carry` with empty paws), and `write.ts` never writes the `for:<verb>` target label.
  - The reading limit is checked at plan time.
- **Bowl safety test (`day.test.ts`):** start the day with the bowl empty and check hunger is never under 15 for more than 60 minutes. That means `harvest`/`dine` from the template `berry-bush` and `kitchen` must be reachable by drift while awake. If that fails, `dine` (`effect: eat`) on carryable food has to be drift-eligible when hunger is fixable, and that goes through the same `fixableNeeds` path.

**Changes**
- `apps/mind/src/prompts/*.ts`, `tick/think.ts`, `world.ts` (read the recent notes and plans).
- `packages/sim/src/interests.ts`, `utility.ts`, `forkling.ts`, `appraisal.ts`, `effects.ts`, `world.ts`.
- `packages/schema/src/species.ts` (`prefer`) and `properties.ts` (`portions`).
- `species/cat/species.json` (give, hide, sleep/nap `prefer`, and the 9.4 rates).
- `templates/forkling-world/objects/bowl.json`.
- `apps/mind/src/tick/art.ts`, `code.ts`, `tick/write.ts`.

---

## Slice 6: docs (branch `docs/review-fixes`)
**Closes:** all of section 8, then `/docs-sync`.
- Visitor events in `docs/architecture.md`, `apps/mind/CLAUDE.md`, the root `CLAUDE.md` and `MILESTONES.md` (gifts) are marked "after the visit gateway".
- The epoch comment in `playback.ts:11` is fixed (the 10-minute heartbeat).
- `packages/sim/CLAUDE.md` lists all 8 triggers, including `replan`.
- `docs/architecture.md`:
  - adds `memory/timeline/`, `mind/ticks/`, `mind/health.json`, `mind/builds/*.result.json` and `heartbeat.yml`
  - drops `brain/temperament.json` from the template list, or notes that it's created on the first tick
- `MILESTONES.md`: no meteor showers, and the news filter covers Mastodon only.
- `apps/mind/CLAUDE.md`:
  - The vision rule: "new things in view, or a planned photograph step".
  - The commit rule is reworded for the tick log.
- The needs time scale text follows 9.4.
- The HUD's "F3 for Merge's mind" uses the forkling's name (`App.tsx:64`).
- The site's "Last seen" uses the forkling's time zone (`apps/site/src/render.ts:213`).
- `docs/how-it-works.md` is updated to the new behaviour.
- Each finding in `docs/review-2026-11.md` gets a status of fixed, deferred or won't-fix, with its PR.
- Run `/docs-sync` and fix what it lists. The `docs-sync` skill's own stale globs (workflows path, `apps/site`) are fixed too.

## Already deferred or won't-fix (unless Roman wants them pulled in)
- **Deferred:**
  - 2.4: the viewer refresh.
  - 2.8: the thought bubble mixing up plan and drift.
  - 3.8: waking up to an hour late, which is acceptable.
  - 4.5: A-B-A-B fixation.
  - 4.7: the weekly review only sees 8 steps. Partly better thanks to the past block in slice 5.
  - 6.4: the API key for the code builder.
  - 6.5: no token ceiling for the code action.
  - 6.11: the docs say cron, which slice 6 documents.
  - 6.12: caching never pays. A possible saving of about 25% on the system part.
  - 6.14: the gallery is sorted by name.
  - 6.15: the pinned tag gets bumped at release.
  - Weather and sound likes.
  - `WorldObject.behavior`.
  - `memory/people.json`.
- **Won't fix:**
  - `cook` counting toward the creative cap. The cap exists for the cost of the art call, and `cook` makes one.
  - 6.9 is a signal, not a bug.

## Verification
- Each slice runs `pnpm typecheck` and `pnpm test` clean, from PowerShell.
- `day.test.ts` (from slice 1 on) and the bowl variant (from slice 5) pass.
- From slice 2: the `sim-report` output for 14 days on two seeds goes in the PR, and `replay` is run on a local clone of Merge.
- `pnpm mind:local --dry-run` on a template copy shows the new prompt blocks and the token estimate (under 100K; I expect an extra 1–2K at most).
- `pnpm build` passes after slices 2 and 5, which touch the viewer and the sim.
- **At the end:** a list of every finding as fixed, deferred or won't-fix. A daily call and cost estimate from the measured `day.test.ts` counts and the live ledger's per-call costs (about $0.0015 per Haiku decide call, about $0.04 per Sonnet bedtime call, so I expect about $3–5 a month). And what to watch on Merge after release: `health.json` warnings empty, decide calls a day at or under 12, the plan step in progress for most of the day, no `need` loop in the stream, at least one object build requested and merged within the first days, an obsession that changes within a week, and spend on pace.
