# Merge's fresh start (after spec v4)

Roman, 18 November: yes to an archived reset, done **after the parallel build is finished** (R2 released and live), before the soft launch to friends. Not part of the build; nothing here runs until Roman pastes the prompt below.

## Why

Merge's memory carries the old habits: the lidar goal and wants, engine rules that leaked into its beliefs, page and diary, and lidar souvenirs that keep coming back in collisions. Spec v4 fixes the engine, not the memories. A fresh mind starts without that pull, friends watch a world grow from the first island, and the run report measures v4 alone.

## What stays

- Who it is: `forkling.json` (name, species, seed, timezone), `self/seed.md` with the approved v4 seed sentence, the cat body.
- Money and running state: `brain/budget.json` (this month's spend must stay, or the cap breaks), `brain/credits.json` and any money ledger, `mind/config.json`, `mind/sources.json`, `mind/health.json`, `mind/ticks/`, the workflows.
- Visitors: `notes/` and `memory/visitors.json`, so people who wrote are still known by name. Their notes stay as replied; Merge just has no memory of the old conversations beyond the visitor file.
- The pet-era `archive/` from 2 November, untouched.

## What starts fresh (moved, never deleted)

Moved to `archive/v1/` with the same relative paths: `memory/` (beliefs, summary, stream, timeline), `brain/interests.json`, `mind/goals.json`, `mind/wants.json`, `mind/state.json`, `journal/`, `notebook/`, `souvenirs/`, `trails/`, `works/`, `places/` beyond the template's starting places, `self/page.md` and `self/page-history/`, the wallet / points files (the ledger of money in stays), project folders from step 4, tool requests from step 6.

Then the fresh files come from the engine template, as `migrate-w1` did. The points balance starts at the v4 starting amount, or at `--start-points <n>` for today (Roman, 21 November: 500, so a build session's 300 in hand is there on day one).

Also: tag the last commit before the reset `merge-v1` in RomanKuroptev/merge, so the whole old life is one click away. The site shows `archive/v1/` as a "Merge v1" window on the Merge 95 desktop (an old save file), next to the existing archive.

## How (modelled on migrate-w1)

1. A new command `pnpm --filter @forkling/mind migrate-fresh --world <clone> [--apply]` in `apps/mind/src/migrate.ts` style: dry run by default, safe to run twice, tests first (a temp world: moves land in `archive/v1/`, kept files untouched, budget spend unchanged, the engine reads the result, the site renders the v1 window).
2. Dry run, then apply, on a throwaway clone of Merge; run a 1-day fast-forward from it and check it wakes, plans, reads and makes something.
3. One engine PR (command + site window), merged when CI passes, released as a patch.
4. Live: while Merge is asleep (after 23:00 Stockholm), stop the mind service on the server, pull Merge's repo, tag `merge-v1`, apply the command, commit "fresh start: Merge v1 archived", push, pin FORKLING_REF to the patch release, start the service, watch /health and the first morning tick.
5. Undo, if needed: revert the fresh-start commit (the tag keeps the old state), start the service.

## The prompt (paste after R2 is live; R2 = v0.18.0, live 19 November)

```
Give Merge a fresh start, by docs/plans/merge-fresh-start.md (copy it there from this text if it is missing). Use plan mode for the engine part only. Build migrate-fresh in the style of migrate-w1, tests first, plus the site's "Merge v1" window; merge when CI passes and release it as a patch. Dry run and apply it on a throwaway clone of RomanKuroptev/merge and run a 1-day fast-forward from it; stop and tell me if it fails. Then, after 23:00 Stockholm while Merge sleeps: stop the mind service over SSH, pull Merge's repo, tag the last commit merge-v1 and push the tag, apply migrate-fresh, commit, push, pin FORKLING_REF to the patch, start the service, and check /health and the first morning tick. In the same commit, while Merge sleeps: raise capUsd in brain/budget.json to 15 (keep spentUsd as it is) and copy the template's mind/tools.json in. Never delete anything: everything old goes to archive/v1/ or stays in the tag. If it is past 05:00 Stockholm when you get to the live part, stop and wait for the next night.
```
