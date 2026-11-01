---
name: live-check
description: Read-only health check of Merge's live repo from its health summary and tick log, then spend, journal, goals and Actions runs. Use when asked how Merge is doing or after a release.
---

Read only. Use `gh` and the public repo `RomanKuroptev/merge`. Prefix commands with `rtk`. Never change anything in the repo.

Start with the two files the mind keeps for exactly this question. Each is one call:
`rtk gh api repos/RomanKuroptev/merge/contents/<path> --jq .content | base64 -d`

1. **`mind/health.json`** (rebuilt every tick). Print the verdict first: if `warnings` is empty, say "nothing looks wrong" and quote `lastTick.at`; otherwise list each warning. If `lastTick.at` is more than 30 minutes old while `lastTick.asleep` is false, the ticks have stopped (see step 6). Also read: `plan` (the current step, how overdue it is, steps left, last replan), `today` (decide calls, calls and triggers by kind, failures, rejections, steps started), `quotas`, `needsCritical` (minutes under 15), `mood`, `spend` against `paceUsd`, and `openBuild`.
2. **`mind/ticks/<today>.jsonl`** (one line per tick, quiet ones too; the local date is in the forkling's time zone, see `forkling.json`). Read the last 12 lines. For each: `at`, `triggers` (what woke the mind, or why nothing did in `notes`), `think` and `calls` (what was asked, `ok`, `error`, `usd`), `stepBefore` and `stepAfter`, `planId` (it changes when the plan is replaced), and `drift` (what broke a step off). Look for the same trigger line repeating, calls with `ok: false`, a `stepAfter` that never changes, or a gap in `at` larger than 10 minutes while awake.
3. **Anything the health file cannot say**: `rtk gh run list -R RomanKuroptev/merge --limit 20` for failed or slow mind, build, pages and validate runs (open the logs of a failure), then `mind/goals.json`, the newest `journal/*.md`, `memory/beliefs.json` and `brain/interests.json` for what it is pursuing and why, and `art/` for recent artifacts.
4. **The history without the log commits**: log-only commits start with `tick:`, world commits with `chore(mind):`. To see what Merge did, filter on the second.
5. **To compare the body with the plan** over a window, clone the repo and run `pnpm --filter @forkling/mind replay --world <clone> --from <ISO> --to <ISO>` (needs the engine checked out, run from PowerShell). It prints what the body did beside the plan step and how often they agreed.
6. **If the ticks have stopped**: `rtk gh run list -R RomanKuroptev/merge --workflow heartbeat.yml --limit 10` and the `mind.yml` list. The heartbeat chain hands over to a fresh run every 5 hours and the handover can wait a long time in the `heartbeat` concurrency group. Say whether a heartbeat run is live.

Report, in this order: the verdict and the warnings; cost this month against the $10 cap and the pace; decide calls today (the target is 12 or fewer); the share of the day with a plan step in progress; anything odd (repeated triggers, fixation, repeated rejections, unsupported journal claims, failures). If `mind/health.json` does not exist yet (before the tick log was released), fall back to `brain/budget.json`, `memory/stream/<date>.jsonl` and the commit history, and say so.
