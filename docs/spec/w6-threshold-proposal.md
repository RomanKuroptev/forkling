# W6 proposal: the expand and found thresholds (for Roman's review)

**Status: approved by Roman on 14 November (the full recommendation: expand 30, found 40 on 3 mornings in a row, and the topics of what a place shows count as its tags for expand). Built as slice 5b.** Spec 2.5 gives the numbers (a tag at weight 50 for expand, an interest at 70 on 3 mornings in a row for found), and where the spec gives a number, the number is the rule, so only Roman changes them. This page is for deciding that before slice 6 (found) builds on them.

## What the live data says (Merge's repo, 14 November, one day of trips)

- Weights: page +4, souvenir +10, and 8% fades off each morning, so a topic fed *x* points a day sits near **11.5 × x** at wake once it has been fed for a while.
- Merge's best topic, "digital elevation model", got **28 points in one day** (2 pages, 2 souvenirs) and woke at 25.8. The next best, "leaf area index", got 18 and sits at 16.6. Only 13 November has any feeding: this is the first trip day, so it is a thin sample.
- Reading is spread over **15 topics whose weights add up to 205**. The lidar cluster is nine near-synonyms ("lidar", "airborne lidar", "digital elevation model", "forest canopy", "terrain rendering", "maya archaeology" ...), most at about 13.

Days of feeding one exact topic until its morning weight reaches a threshold (from the code's own arithmetic):

| points a day on the topic | 25 | 30 | 40 | 50 | 70 |
|---|---|---|---|---|---|
| 2.2 (about one page a day) | 54 | never | never | never | never |
| 4 | 10 | 13 | 25 | never | never |
| 7 (a souvenir every 1.5 days) | 5 | 6 | 9 | 12 | 25 |
| 14 (a page and a souvenir a day) | 3 | 3 | 4 | 5 | 7 |
| 28 (what the best topic got on its day) | 1 | 2 | 2 | 3 | 3 |

## A correction to my own note

I wrote that 50 "may never be reached". The table says that is too strong: **one topic fed like Merge's best day, two days running, reaches 50 on the third morning.** The weight is not what stops an expand. Three other things do, and they matter more than the number:

1. **Home and the Workshop can never earn an expand.** Their tags are `home` and `workshop`, which no page ever feeds, so their weight stays 0. Spec 2.5 asks for a tag of the place, and a place's tags are fixed when it is founded. The first place that can grow is one founded for an interest, and that needs a found (70 on 3 mornings in a row) and a built request. Until then no expand can happen at all, which puts the "3 expansions in a live week" mark at risk.
2. **Found at 70 is out of reach in practice.** An exact topic needs about 7 points a day for 25 days, or 14 a day for 7 days, and must then hold 70 on 3 mornings in a row. Merge changes topic every day.
3. **Topics fragment.** The weight and the 3 souvenirs have to sit on the *same exact tag*, and Merge's souvenirs each carry different topics (its 3 souvenirs are on 3 different ones).

## Options

**A. Lower the numbers** (two constants, `EXPAND_MIN_WEIGHT` and `WAKE_TOP_MIN` in `packages/sim/src/build-rules.ts`):
- **Expand 50 to 30.** About 2.6 points a day (one page a day) holds it, and a page-and-souvenir day crosses it on the 3rd morning instead of the 5th. The 3 souvenirs on the tag stay, so it still means "I keep coming back to this".
- **Found 70 to 40**, still 3 mornings in a row. Four days at 14 a day reaches it, and it then stays above 40 for the next mornings. Spec 3.1's other thresholds (80 for an obsession, 30 to end one) are unchanged.

**B. Let a place carry the interests of what it holds.** A place's candidate tags for expand become its tags plus the topics of the souvenirs exhibited in it (`placedIn`). Home, which Merge fills by tending, could then grow. This changes spec 2.5's wording ("one of its tags"). Without it, option A alone does not unblock Home or the Workshop (blocker 1).

**C. Leave the numbers, and let the first expansions wait for a found.** Honest to the spec, but with Merge's interests where they are, the live week may show no expansion and no place request.

## Recommendation

**A and B together:** expand at **30**, found at **40**, and a place's candidate tags include the topics of what is exhibited in it. Blocker 3 (fragmentation) I would leave to W7, where reflection and the wants list can pull the near-synonyms together; it is not a W6 matter. Both numbers could be made settings in `mind/config.json` (which only Roman edits) so that W8's tuning needs no pull request; that is a separate small choice and I would not do it unless you say so.

## What changes if you approve

- `build-rules.ts` (two constants, and B in `expandCheck`), with the tests first, including the table above as test cases.
- **`golden/system.txt` changes**: the expand line says "weight 50 or more", so it would say 30. I will show you that diff before merging, as for any prompt change.
- `docs/spec/w6-expand-found.md` and `STATUS.md` carry the new numbers; you edit spec 2.5 in the Claude doc, which stays the source.
- Slice 6 (found) then builds on the new found threshold.
