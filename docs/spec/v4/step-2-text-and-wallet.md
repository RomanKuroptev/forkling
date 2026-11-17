# Step 2: short text, and a wallet that favours things you can see

Spec: [`spec-v4.md`](spec-v4.md) sections 0, 5 and 6. Start only after step 1 has run live for 3 days.

## Why

Merge holds 420 of 450 points and writes about 4 pages a day, because a page costs 1 point and is always available. Roman decided on 16 November: all visible text becomes captions, standalone pages get a real price, visible things are priced under their cost, and all budget code stays ready for future income.

## Before planning: measure

From a fresh clone of `RomanKuroptev/merge`, read `brain/budget.json` and the tick logs for the days since v0.15.0 went live (16 November) and write down for Roman: the mean daily spend of the overhead kinds (spec-v4 5.2 names them), the mean cost of a sketch, a tend, a trip, a page and an expand, and what 300 points a day would have cost against the $15 cap. If the formula in spec-v4 5.2 gives a daily figure more than 20% away from 300, say so and let Roman choose the starting figure.

## Build

Three slices, one PR each.

### Slice A: captions and the short diary

- `write` gets two kinds, decided by its target: a **caption** (the target is a place id, a work id or, after step 4, a project id) of up to 40 words, and a **page** (the target is anything else) of 80 words asked, 100 kept, as now. A caption is stored with the thing it belongs to (a plaque or label for a place as today; `caption` in a work's `meta.json`) and is not a notebook page.
- The sleep rewrite writes a diary of 3 lines, each up to 140 characters, after an optional title line. Lower its output limit to match. `checkText` enforces it; a diary that breaks it is cut to its first 3 lines, not thrown away.
- Replies: 50 words asked, up to 60 kept.
- `self/about.md`: up to 80 words. The 30%-of-lines rule is replaced by "at most one change a week" (it cannot work on 80 words). The site's about page lists what Merge has built under the text.
- The system prompt's write and reply paragraphs and the diary prompt are rewritten to match. Golden files updated.
- Tests first for each limit, and for a caption landing on its thing.

### Slice B: prices and points

- `packages/sim/src/allowance.ts`: the prices of spec-v4 5.1 (`sketch: 30`, `fullWork: 150`, `found: 80` from step 1, `expand: 50`, `expandEarned: 20`, `trip: 3`, `tend: 2`, `revisit: 1`, `caption: 1`, `page: 10`, deep 30, reply and rest 0). `DAILY_POINTS = 300`, `MAX_POINTS_IN_HAND = 1500`.
- The Sunday step (after the weekly review): daily points from the formula in spec-v4 5.2, and the fixed prices from the ledger with their factors, the 25% weekly limit, the floor of 1 and the 5-call minimum. The result is stored in the mind state with the date and shown in `mind/health.json`. The pure part goes in `packages/sim` (it takes numbers and returns numbers).
- A migration for Merge's state: points in hand are kept as they are; the new maximum applies from the next wake.
- Tests first: the formula on three ledgers (quiet, normal, heavy); a price never moves more than 25% in a week; a kind with 4 calls keeps its price; a page costs 10 and a caption 1; plans are costed with the new prices.

### Slice C: ready for income

The four rules of spec-v4 5.3, exactly.

- `brain/credits.json` with its Zod schema and a template copy holding `{ "credits": [] }`. `effectiveCapUsd(ledger, credits, month)` in `apps/mind/src/budget.ts`; `canSpend`, `paceUsd`, `paceAhead`, `creativeModel`, the daily points formula and the health file all read it. The schema check `capUsd + serverUsd ≤ 23` is unchanged and reads `capUsd` alone.
- Every grant of points is recorded with `source: 'daily'` (the last 30 grants in the mind state). The grant function takes the source as an argument.
- Search the code and tests for the literals 150, 300, 450, 1500, 12.6, 15 and 23 used as budget or points limits outside their one definition, and replace them with the named value.
- The site's budget numbers (wherever they are shown today) add a "money in" line that reads the credits. With no credits it is not shown.
- Tests first: one credit of $5 this month raises the effective cap by $5 and next month by 0; the guard, the pace rule and the Haiku fallback all move with it; a simulated week at 900 points a day with a tripled effective cap passes no rail (session stop, reads a day, looks a day, replies a day, host rates).

## Do not touch

- The server's live `brain/budget.json` by hand while Merge is awake (see STATUS.md: it breaks the server's push). `credits.json` is a separate file for that reason.
- The four plan checks. Do not add a daily limit on pages; the price is the whole mechanism.
- Reflection, the memory summary, beliefs and Merge's own page: their lengths stay.

## Done when

1. All tests pass, and `pnpm test` and `pnpm typecheck` pass.
2. A replay of Merge's last 7 days with the new prices shows Roman, in plain words, what each day would have cost in points and what Merge could have afforded instead.
3. Roman has read the rewritten write, reply and diary prompts and said yes.
4. The cost note in `docs/decisions.md` gives the expected monthly model total under the new prices, and it is under $15.

## After release

After 3 live days report: pages against things made per day, points in hand each evening, real spend per day.
