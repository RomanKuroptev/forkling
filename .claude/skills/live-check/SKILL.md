---
name: live-check
description: Read-only health check of Merge's live repo: spend, journal, goals and Actions runs. Use when asked how Merge is doing or after a release.
---

Key steps (read only, use `gh` and the public repo `RomanKuroptev/merge`):
1. `brain/budget.json`: spend so far this month, cost per day, any budget guard stops.
2. `gh run list` for the repo: failed or slow mind, build, pages and validate runs. Open the logs of any failure.
3. `mind/goals.json`, the newest `journal/*.md`, `memory/beliefs.json` and `brain/interests.json`: what it is pursuing and why.
4. Count surprise triggers vs LLM calls, and recent artifacts in `art/`.
5. Report: cost per day against the $10 a month cap, triggers, anything odd (fixation, repeated rejections, unsupported journal claims). Do not change anything in the repo.
