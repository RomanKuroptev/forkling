# Source trial: public.api.bsky.app/trending

## What changed (Roman, 20 November)

Roman decided that Bluesky gives Merge only Bluesky's own words: a trending topic's name and the one-sentence summary Bluesky writes for it. Never a quote from a person's post. The code now does it strictly: a topic's item text is "Trending on Bluesky today: <name>" and the summary, nothing else. The topic's posts (`app.bsky.feed.getFeed`) are no longer asked for at all, so no post text and no handle can reach the read call, and a souvenir (which must match the item text word for word) can only be Bluesky's own words. The news rule and its word list are unchanged. The web snapshot no longer holds the topics' posts.

The trial below was rerun after the change, on 20 November. **It fails the readable check**: Bluesky's topic text is 22 to 25 words, and the mark is 40 words or an image. So no read call was made (spend $0.0000, 21 requests to the API), no reactions were written, and no souvenirs were kept. The earlier trial (same day, with the posts) passed every check and kept 20 souvenirs, all quotes from people's posts, which is what Roman ruled out; its full report is in the git history of this file (PR #473). In Merge's own loop the same 40-word floor (`skip.ts`, spec 6.6) skips every topic before a read call, so as it stands Merge sees Bluesky topics only as starting-point titles and can keep nothing from them, not even Bluesky's summaries. Whether the source stays on the list with records this short is Roman's call.

## The trial after the change

Kind: record. Tier: voices. 9 different topics read (the news rule left the rest out). 20 items from 5 seeds. **Verdict on the numbers: fail.** What only Roman can judge is marked "you".

| Check | Result | Mark | Pass |
|---|---|---|---|
| Allowed to read | robots.txt allows /xrpc/app.bsky.unspecced.getTrendingTopics. Terms: Roman reads them | robots.txt allows the paths, terms allow reading or a public API, no login or paywall | yes |
| Reliable | 100% (20 of 20) | 95% or more | yes |
| Readable | 0% (0 of 20) | 80% have an image or 40 words | NO |
| Leads somewhere | 8.0 links on average | 4 or more | yes |
| Gives something | 0% (0 of 0) | not marked for a feed: nothing is kept from a feed (6.1) | you |
| Not boring | 0.0 out of 10 on average | not marked for a feed: it is only where a trip starts (6.1) | you |
| Licences | no image souvenirs kept | 100% of images kept have a licence the code can read and allows | yes |
| Tier | voices | Roman assigns reference or voices (6.7) | you |

## 10 souvenirs, picked at random (0 kept in all)


## 10 reactions, picked at random (0 in all)


## Failures and skips

- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/33824d3a8ff2: a record with no image and under 40 words (25)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/fba11daf4901: a record with no image and under 40 words (24)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/7a1a1c1d51a2: a record with no image and under 40 words (23)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/a4c88fc56c85: a record with no image and under 40 words (23)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/a4c88fc56c85: a record with no image and under 40 words (23)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/d1de6ed2d7e4: a record with no image and under 40 words (22)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/82dc20d5994d: a record with no image and under 40 words (22)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/b39544e1c3db: a record with no image and under 40 words (23)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/b39544e1c3db: a record with no image and under 40 words (23)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/d4900f9c2d16: a record with no image and under 40 words (24)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/c4067ece3b89: a record with no image and under 40 words (25)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/33824d3a8ff2: a record with no image and under 40 words (25)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/a4c88fc56c85: a record with no image and under 40 words (23)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/b39544e1c3db: a record with no image and under 40 words (23)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/33824d3a8ff2: a record with no image and under 40 words (25)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/a4c88fc56c85: a record with no image and under 40 words (23)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/b39544e1c3db: a record with no image and under 40 words (23)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/33824d3a8ff2: a record with no image and under 40 words (25)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/a4c88fc56c85: a record with no image and under 40 words (23)
- https://bsky.app/profile/did:plc:qrz3lhbyuxbeilrc6nekdqme/feed/b39544e1c3db: a record with no image and under 40 words (23)

Spent about $0.0000.
