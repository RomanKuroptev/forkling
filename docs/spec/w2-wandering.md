# W2: Wandering

Exported from [`spec.md`](spec.md) (v3.3) on 11 November 2026: sections 6, 7.8, 3.1, the `/trails/` route of 8, and the W2 parts of 12.2 and 12.7. The plan and slices are in this file's last section. The spec is the rule; where the engine decides something the spec leaves open, it is listed under "Decisions".

**Builds:** the allowlist, the source adapters, looking at images and the source trial. Fetch and clean, record links, the read call, trails, souvenirs, the pile, interest feeding, and `/trails/` on the site.

**Done when:** every host in 6.1 passed its trial or was left out. Over 3 live days: at least 8 trips, every souvenir passes its word-for-word check, zero fetches outside the allowlist, and interests change with each change pointing at a trail.

## Decisions

- **Reads a day is 40.** 2.4 and 9.8 say 40; 6.2 still says 24. 40 is used (9.8 lists it as a rail).
- **Interest weights move to 0 to 100** (spec 3.1). A pet-era file with weights from 0 to 1 is scaled by 100 when read.
- **The User-Agent** names the project and its repo URL as the contact: `forkling/0.10 (read-only reader for an autonomous AI; +https://github.com/RomanKuroptev/forkling)`.
- **A voices thread needs 120 words, not 300** (6.6 says 300 for any page). The W0 voice test showed a Hacker News or lobste.rs thread is short but full; 17 of 19 reads kept a souvenir with this floor. The source trial's "Readable" mark for a voices host uses 120 too.
- **Links that name an item through an API** (a Hacker News story, an Imgflip format, a GitHub repository) are offered and followed by their page URL, which `readUrl` maps to the API on the allowlist. A story's own outgoing link is offered only when its site is on the allowlist itself.
- **lobste.rs is left out** (source trial, 11 November 2026): its robots.txt says `Disallow: /` for general agents and `ai-input=no`. Its adapter is removed.
- **Roman's decisions after the trials (12 November 2026).** No `--ignore-robots`: spec 6.5 wants robots.txt to allow the paths used. Wikipedia, the Esolang wiki and Commons are read through their `/wiki/<Title>` pages, which their robots.txt allows (the API paths and `Special:Random` are disallowed), so a trip starts from a topic or a front-page link and goes straight to `/wiki/<Topic>`. Hacker News and lobste.rs are out (a voices host can come back as its own trial, for example hn.algolia.com). The library manuals (MDN, p5.js, Tone.js, three.js) and Imgflip are left out of wandering and come back in W4 as sources for tinker and memes only; a low interest score on a manual is expected. NASA is out for W2 (it needs a key and a better adapter). GitHub is rerun with a token (an Actions job's own `GITHUB_TOKEN`, or `gh auth token` locally). Tiers as in 6.1.
- **The old reading module and the novelty trigger go** when `wander` replaces them (12.7, W2).

## 3. Interests and moods

Interests decide where Merge's attention goes; mood colours how it works. Both are numbers in files, changed only by the rules below, in `packages/sim` (pure and deterministic).

### 3.1 Interests

Stored in `brain/interests.json`: `{ topic, weight, firstSeen, lastFed, history[] }`. A topic is a lowercase phrase of 1 to 4 words; topics are merged by the existing matching (case, punctuation, simple plurals).

| Event | Change |
|---|---|
| A page read on a trip lists the topic (at most 3 topics per page) | +4 |
| A souvenir is kept with the topic | +10 |
| A visitor note is about the topic (at most once per note) | +6 |
| Daily decay at wake | weight × 0.92 (half-life about 8 days) |
| Weight cap | 100 |
| Removed | Weight under 5 and no place tagged with it |

- **Obsession:** weight 80 or more. The existing burnout rule stays: reading about the obsession counts for less each day it lasts and for nothing after day 3; an ended obsession cannot restart on the same topic for 14 days.
- At most 40 interests are kept; the lowest is dropped first.
- The decide prompt shows the top 10 interests with weights, and every place's tags with their weights.


## 6. Wandering the web

A trip is a chain of up to 6 reads on allowed sites, where Merge chooses each next link itself. All fetching is read-only, done by code in the tick, and the model only ever sees page text as data **(pending decision 1)**.

### 6.1 Allowlist

Fixed in the engine (`apps/mind/src/web/allowlist.ts`); adding a site is an engine change Roman reviews. **(v3: the first list is cut from 16 hosts****; v3.1: it is chosen for a funny tinkerer****.)** Each source has a kind: a page source is read as text with links; a record source is read as short records.

| Site | Kind | Tier (6.7) | What is read | Why it is here |
|---|---|---|---|---|
| en.wikipedia.org | page | reference | Article text through the REST API, links to other articles | Background on anything, including algorithms, computer art and what a meme means |
| esolangs.org (Esolang wiki) | page | reference | Article text through the MediaWiki API (content is CC0) | Joke programming languages: funny and technical at once |
| Library manuals: p5js.org, tonejs.github.io, threejs.org, developer.mozilla.org | page | reference | Reference and tutorial pages for the libraries works may load | Technique: Merge reads the manual for the tool it is using |
| Hacker News (API), including Show HN | page | voices | Story title, text and top 5 comments; the story's link is followed only if its site is on this list | Things people just built |
| lobste.rs (JSON) | page | voices | Story title, tags and top 5 comments | A smaller, more technical crowd |
| api.github.com | record | reference | A repository's description, topics and README, found by topic (`creative-coding`, `generative-art`, `demoscene` and the like) | Small projects to learn from |
| api.imgflip.com | record | voices | The 100 most-captioned meme formats of the last 30 days: name and template image | Which meme formats are hot now |
| commons.wikimedia.org | image | reference | Image file pages: image URL, title, licence | Images Merge may show |
| api.artic.edu, api.nasa.gov | record | reference | Artwork records; astronomy picture of the day | Things to look at that are not code |
| Feeds (starting points only) |  | none | Hacker News top and Show HN, lobste.rs hottest, Imgflip top formats, Lemmy meme and maker communities, Mastodon trending tags, Wikipedia on this day and random article | The daily pulse. Nothing is kept from a feed itself. **Wikipedia most-read is removed: it is mostly famous people and news.** |

**Version 3.1:** this list follows the direction Roman chose on 9 November, a funny tinkerer on the pulse of memes; the reasoning is at the top of [Web sources review](https://claude.ai/artifact/5Wexr8vmnG9KGgFurufRpB). Wikivoyage and Wikisource moved to "next in line" with the Met, iNaturalist, the Library of Congress and arXiv. Not allowed: Know Your Meme (its terms forbid robots) and, for now, Reddit (needs an approved app and restricts feeding content to models). Still to confirm in their trials: the bot policy of esolangs.org and the terms of the four manual sites.

Each host has a fixed maximum rate in `allowlist.ts`: Wikimedia sites 1 request every 2 seconds; artic.edu 30 a minute; any other host 1 a second. Every request carries a User-Agent with the project's name and a contact address. A 429 or 403 reply pauses that host for 24 hours and is logged in `mind/health.json`; there is no retry loop.

### 6.2 A trip, step by step

1. **Start.** The step's target: a topic (searched on Wikipedia, first result), a feed item from today's skim, or the source URL of an earlier souvenir.
2. **Fetch**: 10 second timeout, 2 MB maximum, allowed host only, redirects followed only to allowed hosts.
3. **Clean.** A page is cleaned to plain text and cut to 3,000 tokens, with up to 40 outgoing links that are on the allowlist and up to 10 images. A record is turned into a short text of its fields and its image. **Record links (v3):** a record has no links of its own, so code offers up to 8: other records by the same maker, from the same place and with the same subject, plus a Wikipedia search for the maker and the subject. That is how a trip crosses from a museum back into reading.
4. **Read call** (Haiku). Input: the seed, top interests, the trip's purpose, the page or record inside a `<page>` data block, and the numbered links. Output (structured): a reaction of up to 60 words, up to 3 topics, an `interest` score from 0 to 10 (6.6), an optional souvenir, and either the number of the next link or `stop`.
5. **Check the souvenir** (6.3). Update interests (section 3.1).
6. Repeat from 2 until `stop`, 6 reads, or the day's 24 reads are used.

A failed fetch counts as a read and the trip continues from the previous item's other links once; a second failure ends the trip.

### 6.3 Souvenirs

Stored as `souvenirs/<date>-<slug>.json`:

```json
{
  "id": "2026-11-18-keepers-log",
  "kind": "quote",
  "content": "Fog. Fog. Fog. Lamp lit at 4.",
  "why": "Nine days of the same word and he still lit it.",
  "topics": ["lighthouses"],
  "source": { "url": "https://archive.org/...", "title": "Keeper's log, 1891", "fetchedAt": "2026-11-18T10:12:00+01:00" },
  "licence": null,
  "placedIn": null
}
```

- `quote`: `content` must appear word for word in the cleaned text, up to 280 characters.
- `fact`: `content` is Merge's sentence (up to 200 characters) plus `evidence`, a word-for-word excerpt of up to 280 characters.
- `image`: must be one of the item's images; its licence must be one the code can read and that is allowed (public domain, CC0, CC BY, CC BY-SA), and is stored with the credit.
- A souvenir with the same source URL as an earlier one, or whose content is a near copy of one, is dropped (section 12.2).
- A souvenir that fails a check is dropped and the read is logged with the reason.
- At most 3 souvenirs per trip. New souvenirs go to the pile; `tend` places them.

### 6.4 Trails

Stored as `trails/<date>-<n>.json`: purpose, start, and for each page its URL, title, fetch time, reaction, topics and any souvenir id. A trail map exhibit draws this chain as a line of page titles.

The morning feed skim stays as today, but it no longer writes reading notes; it gives the morning decide call a list of possible starting points.

### 6.5 Vetting a source before it is allowed

No site joins the allowlist until it passes a trial that Roman runs and reads. The trial is a command: `pnpm --filter @forkling/mind source-trial <host> --items 20`. It makes real fetches and real read calls (about $0.02 a trial) but writes nothing to the world repo; it prints a report. **(v3: record sources have their own pass marks, because a museum object has no 300 words and no links.)**

| Check | How | Pass, page source | Pass, record source |
|---|---|---|---|
| Allowed to read | `robots.txt` allows the paths used; the terms allow automated reading or the site offers a public API; no login, paywall or cookie wall | All yes | All yes |
| Reliable | Fetch success over 20 items, starting from 5 seeds | 95% or more | 95% or more |
| Readable | Enough to react to | 80% of pages have 300 words or more | 80% of records have an image or a description of 40 words or more |
| Leads somewhere | Links offered per item | 8 or more allowed links on average | 4 or more record links on average |
| Gives something | Items where the read call keeps a souvenir | 25% or more | 25% or more |
| Not boring | Average `interest` score | 5 or more out of 10 | 5 or more out of 10 |
| Licences | Images kept carry a licence the code can read and that is allowed | 100% | 100% |
| Tier | Roman assigns reference or voices (6.7) | Assigned | Assigned |

The report ends with 10 souvenirs and 10 reactions picked at random, so Roman judges the content himself, not just the numbers. A site that passes is added to `allowlist.ts` with its kind and tier, in an engine pull request. Every site in 6.1 goes through the trial in W2 before wandering goes live; one that fails is left out.

**Where candidates come from:** code counts the hosts of links Merge saw but could not follow. Each week `mind/health.json` lists the 5 most-seen hosts, and the weekly request (9.5) may ask for one. Merge's curiosity proposes; Roman decides.

### 6.6 Scoring content while Merge reads

- **Per item:** the read call's `interest`, 0 to 10, is how much this item gave Merge. It is Merge's own taste, not a quality rating.
- **Skipped before any model call (code):** pages under 300 words, records with no image and under 40 words, Wikipedia disambiguation, list and stub pages, and items already read in the last 30 days. A skipped item does not count against the day's reads.
- **Per host, each week (code, in ****`mind/sources.json`****):** yield (souvenirs kept per read), uptake (share of its souvenirs later placed, used in a build or cited by a reflection), boredom (share of its items with interest 3 or less) and failures (share of fetches that failed).
- **These numbers are shown, not used (v3).** They appear in `mind/health.json` and on the site's `/trails/` page. They do not change how often a host is offered. A host with boredom over 60% or failures over 20% for 2 weeks in a row is flagged for Roman. Only Roman removes a host. Weighting offers by score is in Later.

### 6.7 Checking what a source claims

- **Tiers:** reference sites may give `fact` souvenirs. Voices sites (Hacker News) may only give `quote` souvenirs, always shown as "someone said", with the author's public name and a link.
- **Evidence:** a fact keeps its word-for-word excerpt (6.3), so anyone can check Merge's sentence against the source. **(v3: the rule that a Wikipedia fact needs a citation marker is removed; the plain text Merge reads has no markers.)**
- Marking facts that contradict each other, and a freshness rule for current events, are in Later.

All of this is built in W2 with wandering. It adds no model calls: the `interest` field rides on the read call.

### 7.8 Looking at images (v3.1)

Merge may look at up to 20 images a day: an image on something it is reading, or a meme format. A look is one Haiku call with the image and the read call's context; it returns a description of up to 60 words and what Merge thinks of it, stored on the trail. Images are fetched by code from allowed hosts only, at most 2 MB, and are passed as data. This brings back vision in a small, fixed form; the eye cam stays retired.

## From section 8: `/trails/`

| Route | Shows |
|---|---|
| `/trails/`, `/trails/<id>/` | Every trip as a chain of reads with Merge's reactions and the souvenirs kept; the pile; each source's weekly numbers (6.6) |

Before W5 there is no 3D world of places, so trails, souvenirs and the pile are shown on `/trails/` only. The nav link appears only when a world has trails.

## From section 12 (W2 parts)

### 12.2 Rails: the only sameness rules enforced at launch

| Output | Rule | On a hit |
|---|---|---|
| Thought line | Similarity over 0.6 with any of the last 50 | Not shown; the step's reason is shown instead. No retry, no cost |
| Souvenir | Same source URL as an earlier one, or content similarity over 0.5 | Dropped and logged |
| Trip start | Same starting topic as an earlier trip today | That step is removed from the plan; the rest stands |

**12.7:** W2 builds the souvenir and trip-start rails, stranger's doors (12.4 item 3) and the one-host nudge (12.3, measured and logged only).

## Slices

1. Schemas: `souvenir`, `trail` and `mind/sources.json` in `packages/schema/src/wandering.ts`.
2. Interests on spec 3.1 (0 to 100, +4 page topic, +10 souvenir, 40 kept, `history[]` pointing at a trail).
3. The fetch layer: allowlist, rate limits, 10 s and 2 MB limits, redirects only to allowed hosts, the 24 h pause, a log of every fetch.
4. Adapters, record links and the 6.6 skip rules.
5. The source-trial command.
6. The trip and the `wander` verb; remove the old reading module and the novelty trigger.
7. Looking at images.
8. `/trails/` on the site and the template world.
