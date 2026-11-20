**Run on 20 November 2026 for issue #304. The real run with model calls is not done yet (the fixer had no API key). To finish it: `pnpm --filter @forkling/mind source-trial lemmy.world/c/showerthoughts --items 12 --seeds 3 --cap 0.05 --out docs/spec/w2-trials`.**

**Offline run: no model was called, so "Gives something" and "Not boring" are not measured.**

Without their comments, 6 of 12 posts read would be readable (a picture on lemmy.world or 40 words). lemmy.world asks for Crawl-delay: 60 in robots.txt, so the trial made one request every 60 seconds.

# Source trial: lemmy.world/c/showerthoughts

Kind: record. Tier: voices. 12 items from 3 seeds. **Verdict on the numbers: fail.** What only Roman can judge is marked "you".

| Check | Result | Mark | Pass |
|---|---|---|---|
| Allowed to read | robots.txt allows /api/v3/post/list, /api/v3/post, /api/v3/comment/list. Terms: Roman reads them | robots.txt allows the paths, terms allow reading or a public API, no login or paywall | yes |
| Reliable | 100% (12 of 12) | 95% or more | yes |
| Readable | 100% (12 of 12) | 80% have an image or 40 words | yes |
| Leads somewhere | 8.0 links on average | 4 or more | yes |
| Gives something | 0% (0 of 0) | 25% or more keep a souvenir | NO |
| Not boring | 0.0 out of 10 on average | 5 or more | NO |
| Licences | no image souvenirs kept | 100% of images kept have a licence the code can read and allows | yes |
| Tier | voices | Roman assigns reference or voices (6.7) | you |

## 10 souvenirs, picked at random (0 kept in all)


## 10 reactions, picked at random (0 in all)


## Failures and skips


Spent about $0.0000.
