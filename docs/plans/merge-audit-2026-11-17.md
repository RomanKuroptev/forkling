# Merge audit, 17 November

17 November 2026. Read-only audit of live Merge on engine v0.15.0, asked for by Roman. Nothing was changed. Living copy: https://claude.ai/artifact/QgapgqNJrDtRGS6oRGWkae

## Summary

Merge's first full day on v0.15.0 is clearly better than last week, but the engine still pulls it back to lidar, and its reading still comes almost only from Wikipedia. Nothing is broken or overspending. The biggest problems are rules that push Merge in circles, not crashes.

**What is working now.** Trips really read pages (today 5 trips, 20 reads, 0 empty, against nearly all empty trips from 12 to 16 November). Today's 4 sketches are varied and visual: a loop counter, three lit hills, a door game, a lamp. Today's writings are 80 to 100 words and nothing written today was flagged as a repeat. Interests all trace back to real trips. Spend is low: $0.17 today, $1.42 this month.

**Ranked by impact** (details and evidence below, a fix prompt for each at the end):

1. The "every step must serve a want" rule drags Merge back to lidar.
2. The 3-day goal review kept the lidar goal, and the variety rule now blocks writing about it, so plans get rejected again and again.
3. Reading is only Wikipedia because the morning shows mostly Wikipedia links, trips can never leave Wikipedia, and the maker and pulse sources were never connected.
4. The thought tick repeats the same line every 5 minutes, and half of today's thoughts are about "the lidar loop".
5. Engine rules leak into Merge's voice: its own page, beliefs, diary and writings talk about label lengths, want ids and "I wrote this from memory".
6. Sketches are priced at twice their real cost, so the allowance runs dry while $10 a month of budget sits unused.
7. The door count measures the wrong thing, so 0.25 looks bad on a day Merge did leave its rut.
8. Old work and souvenir draws keep feeding lidar and sand back into new works.
9. Housekeeping: the cap is still $12.60, the server price may not include VAT, and some caching is paid for but never used.

## Ranked problems

### 1. Every step must serve a want, and 2 of the 3 wants are lidar

**What is wrong.** Once Merge has 3 wants, the plan check rejects any step that names no want (`packages/sim/src/mind-plan.ts`, line 154). Today's wants are w1 "what does lidar see under trees", w2 "a sketch of lighting angles on a terrain model" and w3 "a loop counter toy". Wants only change at a reflection.

**What it causes.** On a day when Merge wandered off to art games, doors and lamps, every step still had to claim it served lidar, terrain or the counter. That is why the hill sketch became "a small toy for the lidar page" and why its thoughts keep coming back to lidar. 6 plan rejections in two days said "it serves no want". This is the strongest "on rails" pull left in the engine.

### 2. The goal review kept lidar, and the variety rule forbids writing about lidar

**What is wrong.** The long goal (set 16 November 17:49) is still "write one short page on telling a real lidar find from a wishful one". The next review is 19 November. Meanwhile the `sameTopicWrites` switch blocks any write in the lidar cluster (21 to 24 pages in 7 days). Merge also tries to point steps at the goal as want "long", which the check does not accept.

**What it causes.** Plans fight the rules: 16 plan rejections on 16 November and 11 on 17 November ("written about this 24 times", "want long does not exist"). Each rejection is a retry call and a moment where Merge stands still. The goal it is told to finish is the one thing it may not write about, and the site still shows a lidar goal while Merge makes lamps.

### 3. Reading is 100% Wikipedia

**What is wrong.** Four separate causes:

- The morning offers 12 Wikipedia links first, then 6 Esolang links and 6 Imgflip formats (`apps/mind/src/tick/wander.ts`). The first 12 Wikipedia links are the site's own furniture ("Wikipedia", "Free content", "English language") and the links inside today's featured article. All 5 of today's trips came from that one article (Turrell, liminality, Marc Augé, installation art, art game).
- A trip follows links on the page it reads, and a Wikipedia page only links to Wikipedia. Once a trip starts there, it never leaves.
- The Esolang front page is nearly the same every day, and Imgflip's list is the all-time top 100 (Drake, Two Buttons, Distracted Boyfriend), not what is funny this week. Merge wrote about Brainfuck and joke languages from memory instead of going there.
- Show HN and Lobsters were dropped (their robots.txt says no), Lemmy and Mastodon were never built, and GitHub creative-coding and the library manuals are allowed but never offered as starting points. Manuals are allowed for tinker only, and no work so far lists a source or library.

**What it causes.** The plan for Merge (maker sources plus meme pulse) is not what runs. It reads an encyclopedia, which makes it write about encyclopedia topics. Still 0 memes ever, because a meme needs a read Imgflip format and no trip has gone there.

### 4. The thought tick repeats itself

**What is wrong.** A Haiku thought runs every 2 to 5 minutes while awake, even when nothing has changed. Today: 180 thoughts, 90 of them about "lidar" or "loop". Lines repeat word for word up to 8 times in a row ("Three lights, one hill. The sketch is done…").

**What it causes.** Anyone watching live Merge sees a stuck record, and the inner voice is mostly about its own repeating. Cost is tiny ($0.02 a day), the damage is to how alive it feels.

### 5. Engine rules leak into Merge's voice

**What is wrong.** Merge's own page says "Keep labels well under 120 characters. Use only want ids that exist (w1, w2)." Belief b1 (confidence 1.0) is "tending is strict about limits like label length". The 16 November diary says tending "failed again over a label one character too long" and "my plans were turned down". 4 of today's 6 writings say "I wrote this from memory, not from a trip" or similar.

**What it causes.** Visitors read about the engine's validators instead of Merge's ideas. Rejections that could be fixed silently by code (trim a label, accept "long") become Merge's memories and beliefs. The honest-writing rule is right, but it now comes out as a disclaimer in nearly every page.

### 6. Sketches cost twice what they really cost

**What is wrong.** A sketch is priced at 50 points ($0.05). Today's 4 Sonnet sketches cost $0.093, about $0.023 each. Merge gets 150 points a day.

**What it causes.** The allowance fell from 392 to 175 points today, almost all on 4 sketches. At this rate Merge can afford about 3 sketches a day from tomorrow, while the month is on pace for about $5 of model spend against a $12.60 cap. The wallet limits making for no money reason. Full works (240 points) have never been made.

### 7. The door number measures the wrong thing

**What is wrong.** A trip only counts as "through a stranger's door" if it starts at one of the 3 links the code marked as doors, chosen at random from links outside Merge's interests. Art game, liminality and Turrell were all outside its interests this morning but were not among the 3 marked.

**What it causes.** The share dropped to 0.25 (2 of 8 trips over 16 and 17 November) on the day Merge left its rut. Only 2 days are in the window so far, so the number swings a lot. Nothing breaks, but it would mislead you if you switched that nudge on.

### 8. Old souvenirs keep feeding new works

**What is wrong.** Each sketch is given a "collision" of two souvenirs. 6 of the 8 works were given lidar, canopy or terrain souvenirs from 13 and 14 November (the lamp got "canopy botany" plus "terrain cartography"). The constraint "Use no words at all" came up 3 times today.

**What it causes.** A quiet pull back to the old topic in every piece, and less variety in the prompts that shape works.

### 9. Housekeeping

- **Cap.** `brain/budget.json` still says `capUsd: 12.6`, CLAUDE.md says $15. Today this changes nothing, because spend is far below both. It only moves the point where sketches fall back to Haiku.
- **Server price.** `serverUsd` is 7.4. Contabo's €6.88 may be without Swedish VAT (25%), which would make it about €8.60. Then $15 plus the server could pass the $23 cap. Worth checking one invoice.
- **Caching.** Sketch, art, tend and reflection calls write a prompt cache on every call but never read it back (cacheRead 0 all month). That costs about 25% extra on those prompts. A few cents a month, so low priority.
- **Not built yet (not bugs).** Spec v4 steps 1 to 8 (world growth, 3-line diary, captions, sandbox build loop, visitor threads, front page) start around 19 November. The diary is still 4 paragraphs and pages are still separate texts until then.

## Your five live points answered

| Point from today | What is really going on | Problem? |
| --- | --- | --- |
| Model cap $12.60, not $15 | The raise was reverted on 16 November because the server's own push kept clashing with the edit. STATUS.md says to redo it while Merge sleeps. | Small. Spend pace is far below either cap. |
| Every reading from en.wikipedia.org | The morning lists Wikipedia first, trips cannot leave Wikipedia, and the other planned sources were dropped or never built. See problem 3. | Yes, big. |
| Repeated writing 8, works-novelty "would fire" 4 | Both are 7-day windows. All 8 flagged writings are lidar and elevation pages from 14 to 16 November, and all 4 flagged works are the sand sketches from 14 to 16 November. Nothing made on 17 November is flagged. The numbers fall to 0 by about 23 November if today's pattern holds. | No, it is the old problem showing in the window. |
| Allowance 392 to 225 | 4 sketches at 50 points each. It is at 175 now after the lamp. Working as designed, but the price is twice the real cost. See problem 6. | Medium. |
| Doors share 0.25 | 2 of 8 trips over only 2 days. Today's trips were all new topics, but none started at one of the 3 links the code happened to mark. See problem 7. | The number is misleading, Merge is not. |

**Journal, goals, beliefs, interests against their sources.** Interests check out: every topic change points to a real trail file (checked all 7 trails that feed the current topics). The goal is stale (problem 2). Belief b1 is about the engine's label limit and b2 ("writing a topic down is how I understand it", confidence 1.0) rewards essays over making. Belief b3 about lidar is half wrong: lidar does not find the ground by subtracting a terrain model, the terrain model is built from the ground returns. The diary is honest about what happened but is mostly about rejections and rules.

**Server and cost.** Model spend this month is $1.42, today $0.17, pace about $5 to $7 a month. With the server at $7.40 the total is about $13 to $15 a month, under the $23 cap. The server ticks normally (last tick 18:16 UTC, no warnings, no failed calls today). merge-mind.duckdns.org and the Pages site could not be opened from the audit's cloud machine, so this is from the files the server pushes to the merge repo.

## Fix prompts

### One prompt for all of it

Paste this once. It does fixes 1 to 8 as small PRs in order and stops for Roman's review only where a prompt changes or a new web source is proposed. Do the cap (prompt 9) on its own after 23:00, or skip it: it changes nothing at today's spending.

```
Plan mode first. Read STATUS.md and docs/plans/merge-audit-2026-11-17.md (the audit). Fix all 8 problems below, one small PR per item, in this order, tests first, STATUS.md updated each time. Merge each PR yourself once CI passes, EXCEPT: any change to a prompt text (golden files) or a new web host waits for my review, so batch those into one review PR at the end and show me the prompt diff in plain words. Do not touch RomanKuroptev/merge. Then release as one version with the usual release steps, during Merge's waking hours.

1. Wants: a step may name a want but no longer must (drop the "serves no want" rejection in packages/sim/src/mind-plan.ts ~154). Accept "long" as a reference to the long goal.
2. Goal vs variety rule: when sameTopicWrites blocks the long goal's topic, run the goal review early (max once a day) and tell it the topic is closed for writing for now; give it the last 3 days of what Merge did. Stop after 2 rejected retries per plan.
3. Sources: morning list without Wikipedia furniture links ("Wikipedia", "Free content", "English language"), max 4 Wikipedia links spread over the front page sections, hosts interleaved not Wikipedia first, plus 4 creative-coding GitHub repos. Run source trials for hn.algolia.com (Show HN), a Lemmy memes community and Mastodon public trends, respecting robots.txt; report results, add nothing without my OK.
4. Thoughts: skip the thought call when nothing changed since the last one; drop a thought over 0.6 similar to one of the last 5.
5. Engine rules out of Merge's voice: cut long labels at a word boundary instead of rejecting; plan rejections go to the tick log only, not the memory stream; the write step stops adding "I wrote this from memory" disclaimers but still never claims reading it did not do. Do not edit Merge's page or beliefs.
6. Prices: build the weekly price reset from the ledger (real average cost, rounded up, sketch floor 20 points).
7. Doors: a trip is a stranger start when its start page matches none of the top 5 interests at wake, marked door or not. Measure only.
8. Works: prefer collision souvenirs from the last 3 days, never the same one twice in 7 days; no constraint twice in a row.
```

The nine separate prompts below are the same fixes, for running just one.

Each starts in plan mode. Prompt 9 touches Merge's repo and must run while Merge is asleep (after about 23:00 Stockholm time).

### Prompt 1: wants stop dragging Merge back

```
Plan mode first. Read STATUS.md and packages/sim/src/mind-plan.ts.
Problem (audit 17 Nov): once Merge has 3 wants, every non-care step must name a want (mind-plan.ts ~line 154, "it serves no want"). Its wants are 2x lidar/terrain + 1 counter toy, and wants only change at a reflection, so on 17 Nov a day of art games and lamps had to claim each step served lidar. 6 plan rejections in 2 days came from this rule.
Goal: a step may serve a want, but does not have to. Merge must not feel on rails.
Do: 1) Make wantId optional for every step; drop the "serves no want" rejection. Keep the check that a named want exists. 2) Accept "long" as a valid reference to the long goal (4 rejections today were 'want "long" does not exist'). 3) Keep measuring how many steps name a want, in health.json, as a number only.
Tests first in packages/sim/test. Update golden prompts only if needed and list the prompt diff for my review. Small commits, open a PR, update STATUS.md.
```

### Prompt 2: the goal and the variety rule stop fighting

```
Plan mode first. Read STATUS.md, docs/plans/merge-fun-step1.md (slice 2) and the goal review code (goalReviewStep).
Problem (audit 17 Nov): the 3-day goal review on 16 Nov kept the lidar long goal, while the sameTopicWrites switch blocks any write in the lidar cluster (21-24 pages in 7 days). Result: 16 plan rejections on 16 Nov and 11 on 17 Nov, and a goal Merge may not work on. Next review is 19 Nov.
Do: 1) When a plan is rejected by sameTopicWrites and the blocked cluster matches the long goal, run the goal review early (once a day at most), and tell the review call plainly that this topic is closed for writing for now, so it can drop or reshape the goal (for example into a sketch). 2) Give the review the last 3 days of what Merge actually did, so it can follow where Merge went instead of where it was. 3) A rejected step that is a write on a blocked topic should be turned into a hint for the next plan, not three retries: count retries per plan and stop after 2.
Tests first. Goal review prompt changes need my review: show me the diff. PR, STATUS.md.
```

### Prompt 3: reading beyond Wikipedia

```
Plan mode first. Read STATUS.md, docs/spec/v4/spec-v4.md (sources), apps/mind/src/tick/wander.ts, web/doors.ts, web/sources/ and web/allowlist.ts.
Problem (audit 17 Nov): 100% of reads are en.wikipedia.org. Causes: (a) the morning lists 12 Wikipedia links first; the first 12 are page furniture ("Wikipedia", "Free content", "English language") plus links inside the one featured article, so all 5 trips on 17 Nov came from that article; (b) a trip can only follow links on its page, and Wikipedia only links to Wikipedia; (c) the Esolang front page barely changes and Imgflip get_memes is the all-time top 100, not this week; (d) GitHub creative-coding and Art Institute are allowed but never offered in the morning; Lemmy and Mastodon were never built; HN and Lobsters were dropped for robots.txt.
Goal (my direction): Merge is a maker on the pulse of memes. Sources = maker (Esolang wiki, Show HN, creative-coding GitHub, library manuals) + pulse (Imgflip, Lemmy memes, Mastodon trends). No Reddit, no Know Your Meme.
Do, one PR per slice: 1) Morning list: drop furniture links, take at most 4 Wikipedia links spread over the front page sections (featured, news, did you know, on this day), interleave hosts instead of Wikipedia first, add 4 GitHub creative-coding repos (newest pushed) and Esolang "recent changes"-style new languages if robots allows, else a random page from the language list. 2) Run the source trial for hn.algolia.com (Show HN front page), a Lemmy instance's memes community (read-only API, check robots and terms) and a Mastodon instance's public trends API. Report results to me before adding any host. 3) For Imgflip, check whether anything gives recent popularity; if not, say so. 4) Measure starting host per trip in health.json.
Respect robots.txt, no --ignore-robots. Tests first. Adding a host is an engine PR for my review.
```

### Prompt 4: no repeated thoughts

```
Plan mode first. Read apps/mind/src/tick/thought.ts and prompts/thought.ts.
Problem (audit 17 Nov): 180 thought calls in one day, 90 about "lidar" or "loop", the same line repeated up to 8 times in a row. Visitors watching live Merge see a stuck record.
Do: 1) Skip the thought call when nothing changed since the last thought (same step, no new event, no new page, no visitor): code then keeps the last thought. 2) If a new thought is over 0.6 similar (3-gram, packages/sim/src/novelty.ts) to one of the last 5, do not store or show it. 3) Show the last 5 thoughts to the thought prompt as "do not repeat these". 4) Log skipped and dropped thoughts in health.json.
Tests first. Thought prompt diff for my review. PR, STATUS.md.
```

### Prompt 5: keep engine rules out of Merge's voice

```
Plan mode first. Read the tend validator, prompts/page.ts, prompts/write.ts (or wherever the write step is told it read nothing) and reflection.ts.
Problem (audit 17 Nov): Merge's own page says "Keep labels well under 120 characters. Use only want ids that exist"; belief b1 (confidence 1.0) is about label length; the diary talks about rejected plans and labels; 4 of 6 writings on 17 Nov say "I wrote this from memory, not from a trip".
Do: 1) A label or title that is too long is cut by code at a word boundary, never rejected. 2) Plan rejections are not written to the memory stream as events Merge experienced; they go only to the tick log. 3) The write step still must not claim reading it did not do, but replace the instruction that makes it add a disclaimer: it should simply not cite a source, and only mention it when it matters to the joke or point. 4) In the reflection and page prompts, say that rules of the engine are not interesting to visitors and should not become beliefs. Do not edit Merge's page or beliefs files; they are Merge's own and will drift once the inputs change.
Tests first. Prompt diffs for my review. PR, STATUS.md.
```

### Prompt 6: price sketches at their real cost

```
Plan mode first. Read packages/sim/src/allowance.ts and docs/decisions.md (sketch price).
Problem (audit 17 Nov): sketch = 50 points ($0.05) but the 4 Sonnet sketches on 17 Nov cost $0.093 in all, about $0.023 each. The allowance fell 392 -> 175 in a day while the month is on pace for ~$5-7 of model spend against the cap. The comment says prices are reset from the ledger each Sunday, but that is not built.
Do: build the weekly price reset: each Sunday, set each price to the average real cost in brain/budget.json over the last 7 days (in points, $0.001 each), rounded up, never below 1, with a floor of 20 for a sketch. Log old and new prices in health.json. Do not raise the daily 150. Tests first. PR, STATUS.md.
```

### Prompt 7: a door number that means something

```
Plan mode first. Read isStrangerStart in packages/sim/src/text-nudge.ts and doors.ts.
Problem (audit 17 Nov): a trip only counts as a stranger's door if it starts at one of 3 randomly marked links. On 17 Nov all 5 trips were on topics outside Merge's interests at wake, yet doors share fell to 0.25.
Do: count a trip as a stranger start when its starting page's title matches none of the top 5 interests at wake (same rule as topic starts), whether or not it was one of the 3 marked. Keep the 3 marked doors in the prompt. Measure only, no nudge change. Tests first. PR.
```

### Prompt 8: fresher collisions and constraints

```
Plan mode first. Read the tinker step's collision and constraint draw (apps/mind/src/tick/work.ts and what it calls).
Problem (audit 17 Nov): 6 of the 8 works since 14 Nov were given lidar/canopy/terrain souvenirs from 13-14 Nov as their collision, and the constraint "Use no words at all" came 3 times on 17 Nov.
Do: draw collisions with a preference for souvenirs from the last 3 days, never the same souvenir twice in 7 days; never offer the same constraint twice in a row or more than twice in 7 days. Seeded PRNG only. Tests first. PR.
```

### Prompt 9: raise the cap to $15 (only while Merge sleeps)

```
Read STATUS.md, the part about the model cap. It is now after 23:00 Stockholm and Merge is asleep.
In a fresh clone of RomanKuroptev/merge: check that the server has nothing unpushed (latest commit is a recent "tick:" commit and health.json has no "push failing" warning), then change only capUsd 12.6 -> 15 in brain/budget.json, commit and push. Wait 20 minutes, pull again, and confirm capUsd is still 15 and health.json shows no "push failing". If anything conflicts, revert my commit and tell me. Also tell me the Contabo price you used for serverUsd, and remind me to check if my invoice adds VAT.
```
