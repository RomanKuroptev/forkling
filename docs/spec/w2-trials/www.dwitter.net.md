**Judged as a code feed, by Roman's decision of 20 November 2026.** A dweet is a JavaScript program of at most 140 characters that draws on a canvas; it is a starting point for Merge's own works, and it is only seen by running it, which only the sandbox unit may do. So the trial counts a dweet readable when its code is present and non-empty (`hasCode` in `apps/mind/src/web/skip.ts`, the plan's `code: true` in `starts.ts`), and, as for any feed, "gives something" and "not boring" are shown but not marked. Readable is unchanged for every other host.

**Why this report was rewritten.** The first run (20 November, before Dwitter was on the allowlist) passed "readable" only because every dweet item carried a fixed sentence explaining what a dweet is (the canvas, the time t, the helper names). Without it, only 2 of those 20 dweets had 40 words of their own (code and comments), under the record mark. That line is now removed from the items, and the trial below is the rerun without it.

**Rerun on 20 November 2026:** `source-trial www.dwitter.net --cap 0.1`, 20 dweets from 5 seeds, 48 requests, none refused. Read through www.dwitter.net/apiv2beta/ (the API the site's pages use; /api/ has no hot list). robots.txt is a 404. Packed dweets (`eval(unescape(escape...))`) are unpacked by string functions, never run. No sandbox run was possible here (the trial runs on a PC, not in the sandbox unit), so "it runs" is not measured; only "its code is there" is.

**The read calls did not happen.** All 20 read calls were refused by the API (the account's credit balance was too low), so no reactions or souvenirs were made, and "gives something" and "not boring" read 0 of 0. Spent: $0. The fetch numbers (allowed, reliable, readable, leads somewhere) are real; the reactions of the first run are not repeated here, because they were made with the explaining line in the text. The read prompt was not changed: whether a model reads a dweet well without that line is still to be seen on a rerun with credit.

# Source trial: www.dwitter.net

Kind: record. Tier: voices. 20 items from 5 seeds. **Verdict on the numbers: pass** (as a code feed; see above). What only Roman can judge is marked "you".

| Check | Result | Mark | Pass |
|---|---|---|---|
| Allowed to read | www.dwitter.net has no robots.txt. Terms: Roman reads them | robots.txt allows the paths, terms allow reading or a public API, no login or paywall | yes |
| Reliable | 100% (20 of 20) | 95% or more | yes |
| Readable | 100% (20 of 20) | 80% have their code, present and non-empty (a code feed, Roman 20 November) | yes |
| Leads somewhere | 4.5 links on average | 4 or more | yes |
| Gives something | 0% (0 of 0): no read call was made (API credit) | not marked for a code feed: a dweet is a starting point for a work (Roman, 20 November) | you |
| Not boring | none: no read call was made (API credit) | not marked for a code feed: code is judged by running it, not by a read (Roman, 20 November) | you |
| Licences | no image souvenirs kept | 100% of images kept have a licence the code can read and allows | yes |
| Tier | voices | Roman assigns reference or voices (6.7) | you |

## Souvenirs and reactions

None: every read call was refused for API credit.

## Failures and skips

- 20 read calls: `400 invalid_request_error`, credit balance too low. Every fetch succeeded.

Spent about $0.0000.
