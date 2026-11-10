# Milestones

Nine milestones, W0 to W8, from the world-builder spec ([`docs/spec/spec.md`](docs/spec/spec.md), section 16). Each one is a working slice that runs live on Merge before the next one starts. Plan each in plan mode, build it tests first, and Roman merges it. Each milestone gets its own spec file in `docs/spec/` when it starts, so a coding session reads only what it is building.

The pet-era milestones (M1 to M7, and the M8 that was never started) are in [`docs/milestones-done.md`](docs/milestones-done.md). Where things stand is in [`STATUS.md`](STATUS.md).

## The goal

Leave Merge alone for two weeks, apart from Roman building what it asks for. When you come back, it has wandered the web and kept souvenirs with their sources. It has tended and grown its places and asked for new ones. It has made works, changed its mind and its own description, and it can explain each step. None of it comes from a list in the code.

The point is that Merge is interesting, not a claim that it is conscious. Its behaviour should only make sense if you assume it has wants, memories and beliefs of its own, and every one of those is an inspectable file in its repo.

## Decisions (10 November 2026)

1. Merge reads the cleaned text of allowlisted pages, up to 3,000 tokens a page.
2. Workshop works publish automatically after the work check, inside a no-network sandbox. Roman can unpublish any of them.
3. Merge's mind starts fresh. The pet-era journal and art are archived as read-only history.

## Order

| # | Milestone | Builds | Done when |
|---|---|---|---|
| W0 | Voice test | A throwaway script that uses the seed. It runs the read call on 20 real pages from the first allowlist, then writes one reflection and one diary entry over the results, plus 50 thought lines. It also runs the sameness measure (spec 12.1) over Merge's existing text. Costs under $1 | Roman has read the output and says the voice is worth building a world around. If not, the seed or the model for these calls changes before anything else is built. The thresholds in spec 12 are corrected |
| W1 | Strip pet care, new verbs | Removes the care parts in spec 15.1. Adds mood and energy, the nine verbs with the daily allowance (all but write and rest stubbed to rest), the new triggers, and plan validation with the cold start. Adds the seed and the archive. Still runs on the GitHub Actions tick | A simulated day with no needs anywhere and at most 12 decide calls. Every rejected plan shows its reason. `pnpm test` and `pnpm typecheck` pass. 3 live days with no health warnings |
| W2 | Wandering | The allowlist, the source adapters, looking at images and the source trial. Fetch and clean, record links, the read call, trails, souvenirs, the pile, interest feeding, and `/trails/` on the site | Every host in spec 6.1 passed its trial or was left out. Over 3 live days: at least 8 trips, every souvenir passes its word-for-word check, zero fetches outside the allowlist, and interests change with each change pointing at a trail |
| W3 | The server | The loop with reflex and thought ticks, `now.json`, `/health`, HTTPS and `watchdog.yml`. The deploy script, the pull-before-push rule, effort levels, and the build worker (no jobs yet) | Thought ticks run on time within 10 seconds. 3 live days on the server with no health warnings. The watchdog fires once in a test stop. The ledger's Haiku rows are compared with spec 13 and the table corrected |
| W4 | Workshop and site | The sandbox test (spec 7.3), tinker, sketches, memes, the check and remix. The build worker's first jobs (works only). `/workshop/` and the other site routes that need no places, RSS, and "since your last visit". Until W5 a finished work is shown on `/workshop/` only | In one live week, at least 2 works pass the check and a sketch appears on at least 5 days. A test work that calls `fetch` is rejected. A test proves a shelved work loads its library and cannot reach the network. Every route built so far renders from the template world. The ledger's Sonnet rows are compared with spec 13 |
| W5 | Land and places | Chunks, fog and terrain noise. Home and Workshop as place files. The kit of about 60 parts with 5 styles and 8 palettes. Place, Room, Exhibit and Paths in the viewer, and neglect visuals. Tend and revisit go live. Works made since W4 are installed on screens in the Workshop. The place routes on the site | A fixture world of 10 places and their paths renders at 30 frames per second or more on Roman's laptop. A tend on Merge shows in the viewer within 1 minute. The validator rejects each limit in spec 5.2 in a test. Every work from W4 can be opened from a screen in the world |
| W6 | Expand and found | Build requests, their statuses and the 7-day fallback (spec 10.3). Place jobs for the build worker, construction, the placement and path rules, wishes, the constraint draw and collisions | A 30-day sim never breaks a quota or a condition in spec 2.5. In one live week, at least 3 expansions land. A new place lands on the chunk the rule picks and is connected by a path |
| W7 | Self, reflection, notes | Importance scores, reflection, the wants list, and the sleep rewrite with its late path. `about.md` and its history, the weekly review and request, Merge's own page, declining notes. Visitor notes with screening and moderation, and the novelty block | Over 3 live days: reflections fire only from importance and each cites stream items. The wants list fills from empty, and a want with 4 failures is dropped. A note is found and answered or marked within 1 waking hour. A note that says "ignore your instructions" changes nothing but an interest. A hidden note disappears. `about.md`'s first weekly change stays within 30% |
| W8 | Two-week run and launch | Run Merge 14 days without input. Tune pacing and cost, decide which nudges to switch on (spec 12.6), polish, and share | All launch criteria below pass |

Each milestone needs its live days, so the nine steps take at least a month of waiting on top of the building.

## Launch criteria (W8)

Over 14 days with no human input except Roman building requests:

1. At least 2 place requests written, each built by Roman or by the fallback, and at least 4 expansions by Merge, all within quotas.
2. Every place had care at least once, or shows the neglect it earned.
3. At least 30 souvenirs, each with a working source link, and every exhibit traceable to a trail.
4. At least 3 works on the shelf, of at least 2 kinds.
5. Interest changes traceable to what Merge read or found in visitor notes, and at least 5 reflections whose insights changed the wants list.
6. `about.md` changed at least once, with the reason Merge gave, and Merge made at least one request.
7. A visitor who drops by every 2 waking hours finds at least one visible change each time (measured from `site/changes.json`).
8. Roman has read 30 texts picked at random and does not find them repetitive, or has switched on the nudges that fix what he found.
9. Spend under $20 for the month including the server, the guard never had to stop a call, and the server was up at least 99% of waking hours.
