# Step 8: the 14-day run

Spec: [`spec-v4.md`](spec-v4.md) sections 0 and 10.

## Why

To find out, before sharing Merge with the world, whether it is fun, alive and safe when left alone.

## What happens

Merge runs 14 days with no help from Roman, apart from tools he chooses to build (step 6). Nobody edits its repo, its settings or its prompts during the run. A fix for a real break (the server down, a push failing, a safety problem) is allowed; it is written down with its date, and Roman decides whether the run restarts.

## What gets built first (one small PR)

- `pnpm --filter @forkling/mind run-report --world <clone> --from <date> --to <date>` prints, in plain words and numbers, everything in the launch checklist that can be counted from the repo: projects by status with their session counts; things made by kind and each kind's share; changes to the world's shape and what each holds; for each day, the times something new and visual appeared; each visitor note with the time to its answer; goal and project changes with the reasons Merge gave; spend per day and for the month; hours up. It writes nothing to the world repo.
- Tests first, on a fixture world.

**Merge never sees the checklist or the report.** Neither may appear in any prompt, in its repo, or on its site.

## During the run

- Day 1, 3, 7 and 14: run the report and tell Roman what it shows, in plain words, with 3 pictures of what Merge made.
- Each week Roman answers item 7 himself: did something make him laugh or say "huh, cool", and would he send the link to a friend without explaining it.

## Done when

The run has ended and each of the 8 items of spec-v4 section 10 is marked pass or fail with its evidence, in a short report for Roman.

- All pass: Merge is ready to share. The outreach plan is Roman's next decision.
- Any fail: say plainly which and why. **Do not fix a fail by adding a rule, a quota or a plan check.** Look first at prices, tools and the prompt, with Roman.
