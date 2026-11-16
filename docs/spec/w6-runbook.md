# W6 runbook: expand and found

W6 is built (slices 1 to 12 of [`w6-expand-found.md`](w6-expand-found.md)). **Slices 1 to 8 went live in v0.13.0 and v0.13.1** (14 November): expand and found with their gates, the request and wish files, the lifecycle, the 7-day fallback, construction and the staked plot. **Slices 9 to 12 went live in v0.14.0** (16 November): `/requests/` and the honesty line on the site, the place nudges in `mind/health.json`, and the 30-day sim with the history fix it found. A review of slices 9 to 12 (16 November) found problems that were fixed in three small PRs (#159, #160, #161); they reach Merge with the next engine release. This page is for answering Merge's requests and for what to watch.

## 1. Releases

v0.14.0 carried slices 9 to 12. The review fixes ship in the next engine release by the same steps as W7's (see [`w7-runbook.md`](w7-runbook.md) section 1): a release PR that changes `FORKLING_REF` in the four template workflows, the tag on its merge commit, the `deploy` workflow, `/health`, and Merge's four pins in a commit that touches only `.github/workflows/` (the server writes to that repo all day and never edits those files, so it cannot clash). There is no migration, and `git diff v0.14.0 -- apps/mind/test/golden/system.txt` should be empty. What visitors see afterwards: honest wording on `/requests/` (nothing exists there until Merge asks for a place), and nothing else changes in the viewer.

## 2. Answering a request (yours)

Merge's requests are `requests/<id>.md` in its repo, listed on `/requests/`. The file is a few lines of front matter and Merge's own words:

```
---
id: "lantern-hall"
kind: "place"
name: "Lantern Hall"
purpose: "Where each lidar find gets its own lamp."
tags: ["lidar"]
chunk: [1,0]
status: "open"
statusAt: null
note: null
---
(what it imagines and why, up to 200 words)
```

- **Say you are building it:** set `status: building` and `statusAt` to the time. The staked plot gets a pennant and a pile of boards, and the fallback waits 21 days instead of 7.
- **Build it:** a pull request that adds `places/<id>.json` on the request's chunk. It may touch only `places/`, `works/` and `wishes/`, and `validate.yml` checks it against the limits of spec 5.2 (a build you make with Claude Code may go beyond the kit; the checker still wants a valid place file). Take the name and purpose from the request, and leave plaques, labels and exhibits empty for Merge to fill by tending. When the place lands, the next tick starts 6 waking hours of construction, sets the request to `built`, adds the history line "Asked for by Merge, built by Roman with Claude Code." and tells Merge once.
- **Decline:** `status: declined`, `statusAt`, and a `note` (a decline needs one). **A note** is up to 80 words; Merge reads it inside a data block, never as an instruction. **The site shows a note only on a declined request, as "Roman’s reason"**; on any other status it stays private, as it does in the viewer.
- **A gift:** add a place nobody asked for. The loop files it as a request of kind `gift` ("A gift from Roman."); the guideline is at most one a week.
- **A status change is a direct commit to `main`**, not a pull request: `validate.yml` refuses a pull request that touches `requests/`. Roman decided on 14 November that this stays as it is: no rule change, and `requests/` is not allowed in pull requests.
- If nobody answers in 7 days (21 after `building`), the server builds a plain version from the kit (at most 2 rooms and 30 parts), the request becomes `self-built`, and you can still build the full version later on the same chunk.

## 3. Done-when (spec 16), as of this page

| Item | State |
|---|---|
| A 30-day sim never breaks a quota or a condition of 2.5 | Done, as a test: `apps/mind/test/w6-month.test.ts`. It found and fixed one bug. On 16 November its checks were made able to fail: the expand-job check ran after the worker had finished the job and could never report; expands were counted by array offset and went blind once a history reached its cap; the fake builder answered every expand as `home`. A deliberately broken expand gate now reports "an expand job for home while 2.5 does not hold". |
| In one live week at least 3 expansions land | **Yours to watch, and judged honestly at day 7 (23 November)** (your call, 16 November: keep the line and the approved thresholds). On 16 November Merge's top interest was 21.8 (expand needs 30, found 40), with 4 souvenirs on 4 topics, so 3 in a week is unlikely. The day-7 report gives the count and an estimate of when the first expansion would land at the current pace. Count the `expand` lines in `places/*.json` history, or the `expand` calls in `brain/budget.json` `byKind`. |
| A new place lands on the chunk the rule picks and is joined by a path | The fallback case is in the sim. The Roman-built case is first seen live, on the first request you build: look at `/places/` and the viewer. |

## 4. What to watch in the first week

- **Are the thresholds right?** Expand needs weight 30 on a topic with 3 souvenirs since the place last changed size; found needs weight 40 for 3 mornings in a row. If a week passes with no expand, they are too shy; if Merge asks every week for the same thing, too eager. They are `EXPAND_MIN_WEIGHT` and `WAKE_TOP_MIN` in `packages/sim/src/build-rules.ts`.
- **Spend.** Expand and the fallback build are plain Sonnet calls at low effort (about $0.02 an expand in the sim; a fallback build is estimated at $0.07). Watch the `expand`, `repair` and `foundbuild` rows in `brain/budget.json` `byKind` against the pace.
- **Place nudges** (after the next release): `mind/health.json` `novelty.places` has `repeatedPlace`, `stuckInOnePlace` and `weekendRevisit`. They are measured and never enforced, and they never warn; you decide which to switch on in W8. `weekendRevisit` is a **snapshot**, not the spec's end-of-week figure: it counts the places at neglect 1 or more (7 days with no care) at the moment of each health write, so it moves from tick to tick. A place built from a request is not counted as a repeat of it, and neither is a place Roman gave.
- **Requests**: at most 2 place requests and 5 wishes open, and found at most once a week. `/requests/` shows all of it.

## Known limits

- A request staked in the viewer is read when the page loads and is not kept current by `liveSync` (places are), so a new plot shows after a reload.
- The cat's body does not know about plots (the mind and the viewer must build the same walkable grid); only the visitor can stand on one.
- Revisit has not been seen live: Merge chooses tend for its overdue places.
- A place that is a Roman build can hold anything; the frame-rate test from W5 is yours to run on it.
- W5 slice 14 (retiring the pet era) is done (#155, #156, #157).
