# Status

Read this first. Update it before every commit and before you stop.

## Where the project is
- M1 to M3 done. M4 to M7 are built and released as v0.4.0 to v0.7.3 (latest tag v0.7.3), but their live runs are still pending on Merge ([RomanKuroptev/merge](https://github.com/RomanKuroptev/merge)).
- M7 slices: A eye cam (v0.7.0), B object builds (v0.7.1), C contraptions (v0.7.2), D coded projects (v0.7.3). A has run live; B to D need their live run.
- M8 (two-week run and launch) waits on the review fixes below.

## Current work: review fixes before M8
Plan: [`docs/plans/review-fixes.md`](docs/plans/review-fixes.md). Six slices, each on its own branch and PR, each started from the previous one's branch. Roman reviews and merges; nothing is merged by Claude.

| Slice | Branch | State |
|---|---|---|
| 1 Stop the loop | `fix/stop-the-loop` | done, PR #19 open |
| 2 Observability | `obs/ticks-health` | done, PR #20 open |
| 3 Plan owns the body, honesty | `fix/plan-owns-body` | done, PR open |
| 4 Builder | `fix/builder` | not started |
| 5 Memory and feelings | `feat/memory-feelings` | not started |
| 6 Docs | `docs/review-fixes` | not started |

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

## Open questions
- **9.4 proposal, for Roman to approve before slice 5 uses it:** hunger and curiosity decay 24 an hour (about 4 h to empty, 5x slower than now); energy decay 20 an hour; `explore` -2, `pounce` -3, `zoomies` -2 energy per action; and a second place to nap (a soft object like the bed, in slice 5) so energy has a source in the evening. Measured effect in review section 11. The bowl's portion count is still to set: at hunger 24 an hour the sim has the cat eat about 8 times a day, so with 4 portions a day roughly half its meals have to come from harvesting or cooking. That is your call (your decision was to set it with this proposal).
- 6.7 (branch protection, scoped PAT) are steps for Roman in GitHub; they come with slice 4.

## Last verified
- 2026-11-01: slice 3, `pnpm typecheck` clean, `pnpm test` 1171 passed, `pnpm build` passes.

## Tooling note
- `pnpm` is not on the Git Bash PATH here; run pnpm commands from PowerShell.
