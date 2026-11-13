# W5 runbook: land and places

The code is built and merged (slices 1 to 13 of [`w5-places.md`](w5-places.md)); slice 14 (retiring the pet era) and slice 15 (this page) are noted at the end. Nothing here has been done to the server, to `RomanKuroptev/merge` or to a tag: they are yours. This page is for the day W3 and W4 have passed their live checks and you want Merge to live in places.

Until you release, nothing changes for Merge. A world with no `places/` folder is drawn as the old island by the viewer, makes no tend or revisit call, and renders the site with no `/places/` pages and no link to them.

## 1. The release (a stop, and yours)

1. A release PR changes `FORKLING_REF` to the new tag in the four template workflows that carry it (`mind.yml`, `pages.yml`, `watchdog.yml`, `validate.yml`). A test requires them to match.
2. Tag the merge commit after that PR, never before: the tag has to contain the new pins and `apps/mind/src/validate-pr.ts`.
3. Read the prompt diff once more before you tag. You approved it on 13 November: `git diff v0.12.1 -- apps/mind/test/golden/system.txt` shows three lines before that follow-up (the "two places" lines now say you live in places on land with ids you are told, tending really happens, and the tend line says what it can change). A follow-up one-line change (PR waiting for your OK) adds "and revisiting one" to the sentence that lists what really happens, so the diff against `v0.12.1` is then 4 lines.

## 2. Give Merge its places (yours: it changes `RomanKuroptev/merge`)

On a clone of the Merge repo, with the engine checked out at the new tag:

```bash
pnpm --filter @forkling/mind migrate-w5 --world <clone>            # prints the plan
pnpm --filter @forkling/mind migrate-w5 --world <clone> --apply    # adds places/home.json and places/workshop.json
```

It writes only what is missing, so it is safe to run twice. Read the diff, commit and push it yourself. The first tick after that:

- reads the two places, so plans may name them and a place not cared for in 7 days can be revisited;
- puts the newest four shelved works (the W4 ones) on the four Workshop screens (`WorkMeta.installedIn` is written to each `works/<id>/meta.json`), and a history line `install` is added to `places/workshop.json`.

The viewer and the site change at the same moment: the viewer draws the land with Home and the Workshop (the island is gone for any world with places), and the site gains `/places/`.

## 3. Live checks

- **fps.** Open `<viewer>/?world=local&fixture=10&debug` on your laptop (the fixture is ten made-up places and their paths). It should hold 30 fps or more. I could only measure software rendering; the test holds a render budget (10 places: 4 draw calls and 28,000 triangles, 64 places: 181,000 triangles), so a slow machine tells me something I cannot see.
- **A tend shows within a minute.** Set the engine repo's `MIND_URL` variable to `https://merge-mind.duckdns.org` (the deploy workflow passes it to the viewer as `VITE_MIND_URL`), or open the viewer with `?mind=https://merge-mind.duckdns.org`. The server only answers browsers on Merge's Pages address, so the check has to be on that address. When Merge tends a place (`live-check` shows a `tend` call and a `tended <place>` line in the stream), the viewer's next poll of `now.json` (every 30 seconds) sees a new `placesRev`, reads `/places.json` and swaps the places in. Without the variable the viewer shows only what GitHub has.
- **Every W4 work can be opened from a screen.** The newest four are on the screens; every shelved work is listed by the Workshop terminal in the viewer and on `/places/workshop/`. Click each screen once.
- **The limits.** The validator refuses each row of spec 5.2 and 5.4 (a test for every row and every reason); in the live loop a refused tend writes nothing and Merge is told why in the next call (`notes` in the tick log, and the stream line "turned down").

## 4. What to watch in the first days

- Tend and revisit calls per day, against the allowance (tend costs 2 points, revisit 1; both are in the spend of the ledger rows).
- Refusals: a tend turned down more than once a day means the prompt needs a look.
- The history of `places/home.json` and `places/workshop.json`.

## Done-when (spec 16), as of this page

| Item | State |
|---|---|
| A fixture world of 10 places renders at 30 fps or more on Roman's laptop | The render budget is a test. The fps itself is yours (section 3). |
| A tend shows in the viewer within 1 minute | Tested with a fake clock (`apps/viewer/test/liveSync.test.ts`). Not seen against the real server: yours (section 3). |
| The validator rejects each limit in 5.2 in a test | Done (`packages/sim/test/validate-place.test.ts`, `validate-place-patch.test.ts`). |
| Every work from W4 can be opened from a screen | Done in code (the installs and the terminal's gallery). Check by hand once (section 3). |

## Not yet done in W5

- **Slice 14, retire the pet era.** The island, the nav grid, objects and the pet-era sim and schema are still in the code, and the viewer still draws the island for a world with no places. Removing them changes what visitors see (the island goes), so it waits for your word. It is also what lets the viewer start a world with no `places/` on built-in Home and Workshop.
- The three area `CLAUDE.md` files (`packages/sim`, `apps/viewer`, `species`) still describe the pet and are rewritten in slice 14.
