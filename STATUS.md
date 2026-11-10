# Status

Read this first. Update it before every commit and before you stop.

## Where the project is
- M1 to M3 done. M4 to M7 are built and released as v0.4.0 to v0.7.3 (latest tag v0.7.3), but their live runs are still pending on Merge ([RomanKuroptev/merge](https://github.com/RomanKuroptev/merge)).
- M7 slices: A eye cam (v0.7.0), B object builds (v0.7.1), C contraptions (v0.7.2), D coded projects (v0.7.3). A has run live; B to D need their live run.
- M8 (two-week run and launch) waits on the review fixes below.

## Release
- **v0.8.0 is tagged** (2026-11-01) and Merge's workflows pin it (`cc3d656` in `RomanKuroptev/merge`, which also took the template's new `build.yml`, `validate.yml` and `mind.yml`). Everything below is live from the first tick after that. The first live day on it needs watching in `mind/health.json`: warnings empty, decide calls at most 12, a step running most of the day, a first food chain (cut, cook, dine) once the bowl is empty, and the first `chore(builder): result of <id>` commit when a build happens. 6.7 (branch protection) is still open and goes last.

## Current work: review fixes before M8
Plan: [`docs/plans/review-fixes.md`](docs/plans/review-fixes.md). Six slices, each on its own branch and PR, each started from the previous one's branch. Roman reviews and merges; nothing is merged by Claude.

| Slice | Branch | State |
|---|---|---|
| 1 Stop the loop | `fix/stop-the-loop` | done, PR #19 open |
| 2 Observability | `obs/ticks-health` | done, PR #20 open |
| 3 Plan owns the body, honesty | `fix/plan-owns-body` | done, PR #21 open |
| 4 Builder | `fix/builder` | done, PR #22 open |
| 5 Memory and feelings | `feat/memory-feelings` | done except the bowl, PR #23 open |
| 6 Docs | `docs/review-fixes` | done, PR #24 open |
| 7 Rates, sleep decay, bowl | `feat/rates-bowl` | done, PR #25 open (on top of #24) |

**Next:** Roman reviews and merges #19 to #25 in order (each is based on the one before). Then the two decisions below (9.4 and 6.7), a release tag, and bumping `FORKLING_REF` in Merge's workflows (they pin v0.7.3, which has none of this). M8 starts after the first day on the new version looks clean in `mind/health.json`.

### Slice 7 as built: rates, sleep decay, the bowl (decisions on 9.4)
- **Rates (approved):** hunger and curiosity 24 an hour, energy 20, `explore` -2, `pounce` -3, `zoomies` -2 energy. **Sleep:** needs fall at 25% of their speed in bed (`ASLEEP_DECAY` in `packages/sim/src/needs.ts`).
- **Bowl:** `portions: 3` on `bowl.json` (a new object property, with `state.portionsLeft`). Each time the replayed body started an `eat` at a portioned object the mind takes a portion (`tick/portions.ts`, counted from `tallyWindow`'s new `started`); when the forkling wakes the bowl is filled again. An empty bowl offers no `for:eat` spot, so drift cannot eat there and a plan that eats from it is turned down ("The bowl is empty"). The prompt says "food to share out: The bowl 2 of 3 portions left, filled again when you wake". Once it is empty hunger is a need the body cannot fix, so the `need` trigger wakes the mind, which has to plan food: `cut` berries, `cook` them, `dine`.
- **Day test:** the fake mind answers a hunger wake-up with that food chain. The bowl ends the day empty, it dines at least once, hunger is never critical for more than 30 minutes, and 7 decide calls (limit 12).
- **A bug found on the way, fixed here:** needs were decaying about ten times too slowly in the live system, because a replay whose last write was older than the current half-hour epoch restarted at the epoch start and dropped the gap. `carryForward` in `playback.ts` now carries the body across it (at most 2 hours). Details in review section 11, addendum. The rates only mean what they say with this fix.
- **Measured (14 days, seeds 1 and 2):** plan share 85.5% (was 68.4%), about 106 interruptions a day (was about 247), energy never critical for more than 1.5 minutes. Hunger still reaches about 0 for about 3 hours of most nights in the sim (the cat does not eat a late snack); it wakes hungry, and a snack before bed would be the mind's to plan. The sim report does not model portions (the mind counts them), so it eats freely.
- A tick counts at most the last 2 hours of the body's time, and nothing after a longer gap or in a world's first tick, so a pause cannot charge meals or steps that were never watched.

### Slice 1 as built (affects review findings 1.1-1.6, 3.1-3.7, 9.1)
- The cat has no `affection` need and `follow` raises nothing. Merge's stored `affection` drops out on the first tick (`createForkling` ignores needs the pack lacks). It returns with the visit gateway (`docs/future.md`).
- New `replan` trigger (score 0.45): the day is planned and no step is running, or the last step ran out. Not in the 45 minutes before bed. After an empty or rejected plan it waits `mind.replanAfter` (60 minutes). Code only asks; the mind still writes the plan.
- `need` fires only for a need the body cannot raise itself right now (`fixableNeeds` in `packages/sim/src/utility.ts`, wired in `tick/apply-step.ts`). The 30 minute cooldown stays.
- `blocked` asks once per step (`mind.blockedStep`). If the answer has no plan the step is skipped.
- A failed call or an answer with nothing usable mutes everything but `newDay` and `bedtime` for 30 minutes (`mind.thinkFailedAt`).
- A step that ran out always hands over (`tick/advance.ts`), with or without a decision. With no key, at the budget cap, or after a failure the plan goes on.
- A rejected morning plan still counts as planned (no repeated feed skim), then replans after the cooldown. A rejected replacement leaves today's plan alone. A plan is checked before a design takes the build slot. A weekly review no longer marks new objects as seen.
- New `apps/mind/test/day.test.ts`: a template day, 144 ticks, no visitors. Limits: no need under 15 for over 60 minutes awake, a step in progress for 80% of waking ticks, at most 12 decide calls, none while asleep. Measured before: 29 decide calls and affection critical for 14 hours. Measured after: 6 decide calls, longest critical stretch 60 minutes (energy, which only a sunbeam nap fixes: exactly at the limit, for the 9.4 proposal in slice 2).
- Needs also decay while asleep (`forkling.ts:194`), so overnight hunger sits near 0. The day test checks waking ticks only. Measured in slice 2: curiosity is under 15 for about 760 minutes of bed hours over 14 days at the current rates.
- Prompt text changed (for Roman's review): the replan task in `prompts/decide.ts`, and one sentence in `prompts/system.ts` ("The body looks after its own needs between steps ... so do not plan around that"). New golden file `user-replan.txt`.

### Slice 2 as built (review section 7, findings 1.7, 2.2, 2.3)
- **Anchor (2.2, 2.3):** the mind and the viewer both anchor playback on `playbackStateTime(forkling)` (the forkling's own `lastTickAt`), not the commit time, so art, builder and tick-log commits no longer move the walk. A source-pin test keeps the viewer on it.
- **`mind/ticks/YYYY-MM-DD.jsonl`:** one line per tick, quiet ones too (`TickLine` in `packages/schema/src/ticks.ts`): triggers, think kind, every try at a call with cost or error (`ask.ts` records them), step before and after, plan id, needs, mood, files written. 14 days kept. The workflow now commits every tick; log-only commits start with `tick:` and do not rebuild the site.
- **`mind/health.json`:** rebuilt each tick by the pure `buildHealth` (`apps/mind/src/health.ts`): plan state, day counters, quotas, minutes each need has been under 15 while awake, mood streak, spend against pace, open build age, and a `warnings` list (need critical over 1 h, no step for over 1 h, same step 3 times, over 15 decide calls, failures, rejections, a gap over 30 min between awake ticks, spend ahead of pace, build open over 48 h).
- **CLIs:** `pnpm --filter @forkling/mind sim-report` (pure `simReport` in `packages/sim/src/report.ts`) and `replay --world <clone>` (pure `replay` in `apps/mind/src/replay.ts`, reads the world's git history). The `live-check` skill reads health and the log.
- **Measured (review section 11):** see there. Headlines: the plan window share is 72.9% with affection, 75.7% without, 89.3% with slower decay and cheaper energy costs. Energy is driven by action costs, not time, and has no source between sunset and bed (a structural 3.5 h stretch). 1.7 was a stopped clock (no tick for 70 min), not a plan bug.
- `ENGINE_REF` is passed to the tick as `FORKLING_REF` and written into each line.

### Slice 3 as built (findings 9.2, 2.1, 2.5, 2.6, 2.7, 2.9, 4.4, 4.6)
- **The plan owns the visible action (9.2, 2.5):** in `packages/sim/src/forkling.ts` a critical need breaks the plan off for one action only when the body can raise it right now (`fixableNeeds`) and the planned verb would not; otherwise the plan wins outright. Before, any need under 15 handed the whole choice to a random draw. A resumed action from the repo must still be allowed at this time of day (2.9). In bed hours only verbs for the night are on offer (2.6): measured night time on something else went from 6.8 h to 0.0 h over 14 days.
- **A step lands only after the body did it (2.1, 2.7):** `tallyWindow` (`packages/sim/src/playback.ts`) counts what the canonical body did per verb, epoch by epoch. The mind adds the seconds on the step's verb to `goals.now.workedSec`. At the end of a step the effect and practice land only if at least 60% of the minutes were spent; otherwise the step gets its time again once, then ends unfinished (stream: "Left X unfinished", nothing gathered or learned). Practice is the minutes really spent. A plan that replaces a step in progress settles it the same way, except that an artifact verb is not made. In the day test 1 of 29 steps ended unfinished.
- The totals (`workedSec`, `mind.brokenOff`) are written only when something else is written; the next tick's tally starts at the last write, so nothing is lost or counted twice, and a quiet tick still leaves the world's files alone.
- **What broke a step off reaches the mind:** the tick log's `drift[]` and `mind.brokenOff` feed one line in the next decide or morning prompt ("you broke off shape 3 times: eat (hunger) 2, nap (energy) 1"), then restart. New golden `user-broken-off.txt`.
- **Honesty (4.4, 4.6):** `checkReflection` takes the stream entries. A thought, a trigger or a turned down plan is not evidence for a belief; strengthening needs an entry newer than the belief's last change; a journal paragraph may not cite only thoughts. A decision that repeats the same long goal no longer resets `reviewedAt`.
- **Needs still decay in bed.** Now that nothing eats at night, hunger and curiosity sit at 0 through the night in the sim report (about 6,400 to 6,800 minutes of bed hours under 15 over 14 days). This is the 9.4 time scale again: either the slower decay in the proposal, or needs decaying at a fraction while asleep. Not changed.

### Slice 4 as built (findings 6.1, 6.2, 6.3, 6.6, 6.8, 6.10, 6.13; 6.7 is yours)
- **Builds have their own concurrency group** (`build-<id>`), not the mind's, so a queued tick can no longer cancel a pending build (6.1).
- **The builder and the mind no longer write the same files.** `design` and `project` write only `mind/builds/<id>.result.json` (status `designed`, `pr-open`, `failed`, `closed` or `merged`; a reason; what was spent). A small `books` job in `build.yml` (its own group `build-books`, retry loop) commits that one file to `main`, and writes a `failed` report if the run produced none. The tick (`tick/settle-build.ts`) reads it: books the cost once, closes a failed or closed build with a stream line, and gives back the day's or week's slot (6.3).
- **Two slots:** `mind.openBuild` is the object build, new `mind.openCode` the coded project. A code PR waiting for a person never expires (so a merge on day 5 is noticed) and no longer blocks object builds (6.2). A project left in the old slot moves on the first tick.
- `validate.yml`: the group includes the event name (6.8), and a `settle` job writes `merged` or `closed` into the result file when a person closes a builder PR. (A PR the workflow token merged itself starts no workflow, which is fine: the object is in the world.)
- `mind.yml`: the site is also rebuilt for `forkling.json` and `mind/goals.json` changes, at most once an hour (6.10).
- The template ships no `brain/budget.json` (its hardcoded month was wrong for any other month), and `rollLedger` never goes back a month (6.13).
- Rule text fixed in the root `CLAUDE.md`, `apps/mind/CLAUDE.md` and the world's `CLAUDE.md` (6.6). `build.yml` opens its PRs with `secrets.BUILDER_TOKEN` when it exists.
- Not done by me: 6.4 (API key for the code builder), 6.5 (no token ceiling for the code action).

### Slice 5 as built (section 5, 9.5, 9.6, 4.1-4.3, 4.8, rule 8, dead parts)
- **What it did before comes back to it.** New `apps/mind/src/past.ts` reads the notebook: the morning and weekly prompts get a `<past>` block (last 3 reading notes, the reasons for the last 2 days' plans, the last 10 things it made, the last 5 ended obsessions); a decision gets the reading notes. Every prompt says how much of each daily or weekly limit is left. The morning no longer asks for `stayUpLate` (4.8).
- **Obsessions burn out (4.1-4.3).** Reading about the current obsession counts for less each day it has lasted and for nothing after 3, so it ends within about a week even if read about 4 times a day. Topics are matched by case, punctuation and simple plural and duplicates merge (a topic keeps its first spelling). An ended obsession cannot restart on the same topic for 14 days.
- **Mood bends the draw (9.5):** a verb's score is weighted by the repo's `feelings` using only its own fields (runs or costs energy, versus restores energy or sits or sleeps), at most 40% either way, the same for every replay. `created`, `read` and a build arriving now move the mood.
- **Rule 8:** artifact quality reads the skill of the verb's own group, not always `mind`.
- **Dead parts:** `give` removed (comes back with the visit gateway); `hide` has no world effect so the body may choose it; drift checks the paws; the sim's `for:<verb>` label is no longer written to `forkling.json`; the reading limit is checked when a plan is made. **The bed now has a job:** a new verb `curl_up` on soft objects (+40 energy, by day) gives energy a source after the last sunbeam. Measured over 14 days: the longest stretch with energy under 15 fell from 220 minutes to 2, and in the day test from 60 to 10 minutes.
- **Cost of that:** with energy decaying 80 an hour the cat visits the bed about every half hour, and the plan share fell from 76.3% to 68.4%. That is the 9.4 time scale again; the proposal's slower rates are what fix it.
- **Not done: the bowl's portions.** It needs a portion count, which you said to set with the 9.4 proposal, and which depends on the decay rates you have not approved yet. Nothing about the bowl changed. The prompt does not show portions, and the "an empty bowl never leaves hunger critical for an hour" test is not written.

### Slice 6 as built (review section 8, then section 12)
- Docs now match the code: visitor events are marked as future, the layout lists the tick log, health, build reports, timeline and heartbeat, the trigger lists have all eight, `docs/how-it-works.md` describes the new behaviour, MILESTONES has no meteor showers, the commit rule and the vision rule are fixed. The HUD names the forkling being watched and the site says when it was last seen in the forkling's own time zone.
- `docs/review-2026-11.md` section 12 lists every finding as fixed, deferred or won't-fix with its PR.
- `/docs-sync` was run; it found the script list in the root `CLAUDE.md`, the module list in `apps/mind/CLAUDE.md` and two lines of `apps/viewer/CLAUDE.md` (the anchor) stale, and they are fixed. The skill's own globs are fixed too.

## Open questions
- **6.7, steps for you in GitHub** (branch protection and a scoped token):
  1. Create a fine-grained personal access token with **Repository access: only `RomanKuroptev/merge`** and permissions Contents (read and write), Pull requests (read and write), Actions (read and write), Metadata (read). Add it as the repository secret `BUILDER_TOKEN`. `build.yml` then opens builder PRs with it, so their `pull_request` checks also run. Without the secret it falls back to the workflow token, as today.
  2. Settings, Rules, Rulesets, New branch ruleset, target `main`: turn on **Restrict deletions** and **Block force pushes**. Both are safe: nothing here force-pushes or deletes `main`.
  3. **Require a pull request** needs care: the mind commits to `main` on every tick with the workflow token, so the rule would stop it unless that identity can bypass. GitHub's documentation for the bypass list names roles, teams and GitHub Apps and does not mention the Actions token, so I could not confirm it can be added. In the ruleset's bypass list, search for "GitHub Actions". If it is there, add it (Always allow) and then turn on Require a pull request. If it is not, leave that rule off and tell me: the root `CLAUDE.md` wording "main is branch-protected" then becomes "protected against force pushes and deletion".
- **Decided (2026-11-01):** the 9.4 rates, 25% decay in bed and a bowl of 3 portions are approved and built in #25. What is left is 6.7 (branch protection), to be done last and after a day of watching `health.json`; test the Actions bypass right after turning a "require a pull request" rule on, because a rule without a working bypass freezes the mind (it commits straight to `main`).
- 6.7 (branch protection, scoped PAT) are steps for Roman in GitHub; they come with slice 4.

## Last verified
- 2026-11-01: slice 6, `pnpm typecheck` clean, `pnpm test` 1240 passed, `pnpm build` passes. Slice 5 (1237 passed); slice 4, `pnpm typecheck` clean, `pnpm test` all passed. The workflow files parse as YAML (checked with the `yaml` package). The workflows themselves have not run on GitHub.

## Tooling note
- `pnpm` is not on the Git Bash PATH here; run pnpm commands from PowerShell.
