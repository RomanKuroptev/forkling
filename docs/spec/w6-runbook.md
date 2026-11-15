# W6 runbook: expand and found

W6 is built (slices 1 to 12 of [`w6-expand-found.md`](w6-expand-found.md)). **Slices 1 to 8 are already live** in v0.13.0 and v0.13.1 (released 14 November): expand and found with their gates, the request and wish files, the lifecycle, the 7-day fallback build, construction and the staked plot. **Slices 9 to 11 are on `main` only**: `/requests/` and the honesty line on the site, the place nudges in `mind/health.json`, and the 30-day sim with the history fix it found. They reach Merge with the next release. This page is for that release, for answering Merge's requests, and for what to watch.

## 1. The next release (a stop, and yours)

1. A release PR changes `FORKLING_REF` to the new tag in the four template workflows (`mind.yml`, `pages.yml`, `watchdog.yml`, `validate.yml`). A test requires them to match. Tag the merge commit after that PR, never before.
2. **The prompt has not changed since v0.13.1**: `git diff v0.13.1 -- apps/mind/test/golden/system.txt` is empty at the time of writing. Check it again before you tag.
3. Deploy with the `deploy` workflow and the tag, then check `/health`. There is no migration for this release.
4. Merge's repo: move its four workflow pins in a commit. **The server writes to that repo all day**, and a commit from outside can clash with its pending commits (it did on 14 November: `push failing` until the commit was reverted and redone). A commit that touches only `.github/workflows/` never clashes, because the server never edits those files.
5. What visitors see afterwards: the site gains a Requests link and `/requests/` once Merge has a request or a wish, and every place page gets a line under its purpose that says who had the idea and who built it. Nothing changes in the viewer.

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
| A 30-day sim never breaks a quota or a condition of 2.5 | Done, as a test: `apps/mind/test/w6-month.test.ts` (3 requests, 2 expands, 0 violations). It found and fixed one bug. |
| In one live week at least 3 expansions land | **Yours to watch.** Count the `expand` lines in `places/*.json` history, or the `expand` calls in `brain/budget.json` `byKind`. |
| A new place lands on the chunk the rule picks and is joined by a path | The fallback case is in the sim. The Roman-built case is first seen live, on the first request you build: look at `/places/` and the viewer. |

## 4. What to watch in the first week

- **Are the thresholds right?** Expand needs weight 30 on a topic with 3 souvenirs since the place last changed size; found needs weight 40 for 3 mornings in a row. If a week passes with no expand, they are too shy; if Merge asks every week for the same thing, too eager. They are `EXPAND_MIN_WEIGHT` and `WAKE_TOP_MIN` in `packages/sim/src/build-rules.ts`.
- **Spend.** Expand and the fallback build are plain Sonnet calls at low effort (about $0.02 an expand in the sim; a fallback build is estimated at $0.07). Watch the `expand`, `repair` and `foundbuild` rows in `brain/budget.json` `byKind` against the pace.
- **Place nudges** (after the next release): `mind/health.json` `novelty.places` has `repeatedPlace`, `stuckInOnePlace` and `weekendRevisit`. They are measured and never enforced, and they never warn; you decide which to switch on in W8.
- **Requests**: at most 2 place requests and 5 wishes open, and found at most once a week. `/requests/` shows all of it.

## Known limits

- A request staked in the viewer is read when the page loads and is not kept current by `liveSync` (places are), so a new plot shows after a reload.
- The cat's body does not know about plots (the mind and the viewer must build the same walkable grid); only the visitor can stand on one.
- Revisit has not been seen live: Merge chooses tend for its overdue places.
- A place that is a Roman build can hold anything; the frame-rate test from W5 is yours to run on it.
- W5 slice 14 (retiring the pet era): part C is merged, parts A and B are built and wait for your word and for v0.14.0.
