# Step 1: the world grows from what Merge makes

Spec: [`spec-v4.md`](spec-v4.md) sections 0, 1 and 2. Read those and nothing else from the spec, except v3.3 sections 4.2, 4.5, 5.2 and 5.4 for the place limits that stay.

## Why

After six live days Merge has never tried to add a room or found a place. The gates read interest weights that come from reading, the strongest interest is 22 against gates of 30 and 40, and it has 4 souvenirs. Roman decided on 16 November: making earns space, Merge can pay points for space, related topics count together, and Merge founds its own places from the kit.

## Build

Three slices, one PR each, in this order.

### Slice A: interest families (pure, `packages/sim`)

- New `packages/sim/src/interest-family.ts`: `interestFamilies(interests)` returns families `{ name, weight, members[] }` by the rules of spec-v4 2.1 (link by `sameSubject` on names, or by a shared non-null `trail` id in the topics' history; union-find; weight is the capped sum; name is the heaviest member, first by name on a tie). Sorted heaviest first.
- The planner's `<interests>` block shows the top 10 **families**, each as its name, weight and up to 4 other members. Nothing else that reads interests changes: feeding, fading, obsessions, the 40-topic cap, the wander and write prompts keep using single topics.
- Tests first: the lidar topics of Merge's real `brain/interests.json` of 16 November (copy it into a fixture) form one family; "hyper-realistic sand in webgl" and "voltage glitching hardware" do not join it; a topic with no trail and no shared words stands alone; the function is deterministic and does not change its input.

### Slice B: expand by price

- `packages/sim/src/build-rules.ts`: `expandCheck` is split in two. `expandAllowed(place, lastExpandedPlace)` holds only the rails (exists, not closed, not under construction, not twice in a row). `expandEarned(place, families, souvenirs, exhibits)` returns `{ earned, by: 'made' | 'read' | null, family | null, works[] }` by spec-v4 2.2, with `EARNED_WORKS = 3`, and `EXPAND_MIN_WEIGHT = 30` and `EXPAND_MIN_SOUVENIRS = 3` now read against families.
- `packages/sim/src/allowance.ts`: `PRICES.expand` stays 50; add `expandEarned: 20`. `stepCost` takes whether the target place has earned it (pass it on the step, as `deep` is passed).
- `packages/sim/src/mind-plan.ts`: `expandable` becomes "places that may be expanded" (the rails only). The refusal text "is not ready to grow" goes; the remaining refusals are closed, under construction, twice in a row, and not enough points.
- The expand tick step and the build job: the room's purpose comes from the works (made), the family (read) or the step's reason. Find where the old `tag` result is used and feed it from this.
- The system prompt's expand paragraph is rewritten per spec-v4 2.4. The planner is told which places have earned the lower price, and why, in one line each.
- Tests first: a place with 3 works added since it last changed size is earned by `made`; with 2 it is not; the read route gives the same answers as today's `expandCheck` when each topic is its own family; an unearned expand costs 50 and an earned one 20; a plan with an expand and too few points is refused with the points reason only; the golden prompt files are updated.

### Slice C: found builds at once

- `foundCheck` loses the wake streak and the open-request limit and keeps: fewer than 1 found in 7 days, no place under construction from a found, room in the world, the name rules. Remove `WAKE_TOP_MIN`, `FOUND_STREAK_DAYS`, `recordWake` and `BUILDING_HOLD_DAYS`, and `wakeTop` from the mind state (keep it optional in the schema so old files parse).
- `FALLBACK_DAYS = 0`: the kit build is due as soon as the founding text is written. Reuse the existing fallback build path unchanged; do not write a second build path.
- `PRICES.foundRequest` becomes `found: 80`.
- The found call is no longer given "the interest that earned it". It chooses 1 to 3 tags from existing interest topics, as the schema already requires.
- Every string that says Merge asked Roman ("Asked Roman for a place", "asked Roman for …", the system prompt's found paragraph, site texts on `/requests/` and the place page) changes to founding. History: "built by Merge from the kit". Request kind `gift` and its texts stay.
- The site: an open founding shows as "being built" on `/places/`; `/requests/` no longer lists place requests (it keeps wishes and the weekly requests).
- `CLAUDE.md`: the three lines named for step 1 in spec-v4 section 12. `MILESTONES.md`: add a short "After W7" section that points at this folder. `docs/decisions.md`: one dated entry.
- Tests first: a found with no strong interest is allowed when the rails pass; a second found within 7 days is refused; a found while a founded place is under construction is refused; the founding text passes the same checks a request does; the build starts in the same tick or the next; the 30-day sim (`w6-month.test.ts`) still passes with the new rules and never breaks a rail.

## Do not touch

- How interests are fed, how they fade, and obsessions.
- The place limits of v3.3 5.2 and 5.4, placement (4.2), paths, neglect, construction times.
- The four existing plan checks (starting point, overdue note, `sameTopicWrites`, `sameWorkTinker`). Do not add a new one.
- Wishes, gifts, and anything in Merge's live repo. The release is a separate, later step with Roman's go.

## Done when

1. All tests above pass, and `pnpm test` and `pnpm typecheck` pass.
2. A replay on a fresh clone of `RomanKuroptev/merge` shows, in plain words for Roman: the families on 16 November with their weights; that the Workshop has earned an expand by `made`; and what an expand and a found would have cost on each of the last 6 days against the points Merge had.
3. A dry run of one morning (`pnpm mind:local --dry-run`) prints a planner prompt with no weights or thresholds in the expand and found paragraphs.
4. Roman has read the new system-prompt paragraphs and said yes. They change Merge's brain.

## After release

Check after 3 live days: did Merge expand or found, what did it put there, and what did the points do. Report to Roman in plain words.
