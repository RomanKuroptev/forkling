# W0: Voice test

From spec sections 6.1, 6.2, 9.1, 9.3, 9.4, 12.1 and 16. The whole spec is in [`spec.md`](spec.md).

**Builds:** a throwaway script that uses the seed. It runs the read call on 20 real pages from the first allowlist, then writes one reflection and one diary entry over the results, plus 50 thought lines. It also runs the sameness measure (12.1) over Merge's existing text. Costs under $1.

**Done when:** Roman has read the output and says the voice is worth building a world around. If not, the seed or the model for these calls changes before anything else is built. The thresholds in section 12 are corrected.

## How to run

```
git clone --depth 1 https://github.com/RomanKuroptev/merge.git ../merge-clone
ANTHROPIC_API_KEY=... pnpm --filter @forkling/mind voice-test --merge ../merge-clone
```

The report goes to `voice-test-out/<time>/report.md` (git-ignored), with everything raw in `raw.json`. Flags:

- `--offline`: fetches and measures only, with no model calls.
- `--offset <n>`: a different mix of items.
- `--seed-file <path>`: tries another seed.
- `--cap <usd>`: the spend limit (default 1).

## What it does

1. **Fetch** 20 items. The mix is 3 Wikipedia random articles, 2 Wikipedia "on this day" articles, 3 random esolangs.org pages, 2 Show HN threads, 2 Hacker News top threads, 2 lobste.rs threads, 2 Imgflip top formats, 2 Art Institute of Chicago public-domain records, 1 NASA APOD and 1 GitHub creative-coding repo. All fetches are read-only GETs with a User-Agent, with 2 seconds between Wikimedia and artic requests and 1 second for other hosts. Each has a 10 second timeout and a 2 MB cap. Pages are cleaned and cut to 3,000 tokens (`apps/mind/src/web/clean.ts`). Short pages are skipped before any call (spec 6.6), so starting points are random or come from today's feeds, never picked topics.
2. **Read call** per item: Haiku at low effort. It returns a reaction (up to 60 words), up to 3 topics, an interest score from 0 to 10, an optional souvenir and the next link it would follow. Records with a JPEG picture show it to the model. Souvenirs are checked word for word in code (`apps/mind/src/web/souvenir.ts`). A voices site may only give a quote.
3. **50 thought lines** across a simulated day of reading (09:00 to 21:15, every 15 minutes): Haiku at low effort. Each sees the current step, the new events, and the last 5 thoughts as "you just thought".
4. **One reflection**: Sonnet at medium effort, starting from an empty wants list. It writes questions, insights that cite stream ids, and up to 4 wants.
5. **One diary entry**: Sonnet at low effort, up to 250 words.
6. **Sameness**: `samenessProfile` and `wornPhrases` (`packages/sim/src/novelty.ts`) over the pet-era thoughts, plan reasons and journal, and over the new text. Every model text is also checked for claims to be human.

## Calibration from the pet-era text (offline run, 10 November)

These come from Merge's existing repo: 127 thought lines, 199 plan reasons and 10 journal entries.

| Text | Median | 90th percentile | Over the spec threshold |
|---|---|---|---|
| Thought lines (window 50) | 0.16 | 0.42 | 4% over 0.6 (the rail) |
| Plan reasons (window 30) | 0.09 | 1.00 | 24% over 0.35 (the writing nudge) |
| Journal entries (window 14) | 0.06 | 0.11 | none over 0.3 (the diary nudge) |

The top worn phrases are "so i will" (134 times) and "the bowl is empty until morning" (66 times). That is the pet loop repeating itself, which the 0.35 threshold catches. The journal is long enough that 3-grams rarely repeat, so 0.3 never fires on it. Thresholds are corrected after the live run, next to the new text's numbers.

## Live run (10 November 2026)

19 reads, 50 thought lines, one reflection and one diary entry. It cost $0.056 against the $0.15 estimate. The report is `voice-test-out/run1/report.md` (git-ignored).

| Measure | Pet era | New text |
|---|---|---|
| Thought lines, highest overlap with the last 50 | median 0.16, 90th percentile 0.42, max 0.96 | median 0.04, 90th percentile 0.12, max 0.23 |
| Read reactions (window 20) | n/a | max 0.04 |
| Souvenirs passing the word-for-word check | n/a | 17 of 19 kept, 1 dropped, 1 none |

What the overlap measure did not see: about 12 of 50 thought lines end on a "tail low" or "tail numb" gag, and "the next link" and "keeping the one line I trust" recur. The worn-phrase counter did catch them ("the next link" ×8, "tail is low" ×4). 25 of 50 thought lines went over 140 characters, so the limit needs a hard cut in code. The diary invented one detail (penguins "too light to set anything off") that the page does not say.

For spec 12: keep 0.6 for the thought-line rail, make worn phrases the main repetition guard, enforce the 140-character limit in code, and keep the diary claim check in W7.
