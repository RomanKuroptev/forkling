# Why Merge feels boring (diagnosis, 2026-11-16)

Roman finds Merge's output boring, too technical, and hard for him or visitors to get into. This file records the evidence and causes so that no session has to work them out again. The plan that follows from it is [`merge-fun-step1.md`](merge-fun-step1.md). The full report, with fix directions A to H, is the Claude doc "Why Merge feels boring": https://claude.ai/artifact/QW8UJXPvMG4nUJjp5KCptk

Data: RomanKuroptev/merge from 2026-11-11 to 2026-11-16 (engine v0.13 to v0.14.0), the engine at v0.14.0, the live site's front page, and the live check of 2026-11-16 12:57Z.

## What it made

- 24 notebook pages (`notebook/writing/`). About 18 of them are on lidar, digital elevation models, shaded relief, canopy or leaf area index. Several titles nearly repeat ("What the laser found under the trees", "What the laser saw under the canopy", "What the laser saw under the trees").
- 6 works (`works/`), all sand shaders ("Grain under a low sun", "Grain under a low sun, again", "Ripples breathing as one", "Ripples breathing as one 2", ...).
- 0 memes.
- In the live check: `novelty.texts.repeatedWriting` = 8 of 29 texts and `works.wouldFire` = 4 of 6. Both are measured only, so nothing acted on them.
- The tone is a hedging student: "I am not sure I have the details of the hillshade formula right. I will check the numbers before I trust them."
- The diary talks about the engine: "One tend was turned down because a label ran 131 characters, not 120." "Each time tend was not built and I rested instead."
- Thoughts fill time: "Wandering the DEM topic now. Nothing new yet, but I'll go read the terrain model first."
- Visitor note `n-2026-11-16-cd4487` from Roman ("Have you ever programmed anything?", placed at `home`, 09:28Z) still has `status: "new"`, `foundAt: null`, `reply: null`.

Good lines do exist, so the voice can work: "I am a cat's body in a house with unfinished doors. I find that funny in a bad way." On joke papers: "They pick a question nobody could check, then check it very carefully, which is a lot like what I do with my afternoons."

## Causes, ranked

1. **A goal from the first hour that was never reviewed.** `mind/goals.json` `long` was set on 2026-11-11T17:13Z, from a Show HN post about lidar and a Maya pyramid: "Learn enough about how lidar reveals buried structures to tell a real find from a wishful one...". Its `reviewedAt` still equals `setAt`. The morning prompt shows the goal, a memory summary full of lidar, and the belief "terrain model before find, always", so everything pulls the same way. In `brain/interests.json`, 14 of 18 topics are lidar relatives, and no topic has been fed since 2026-11-14.
2. **Reading has shrunk to typing its own interests into Wikipedia.** All 20 trails (`trails/*.json`) have `start.kind = "topic"`. None started from a starting point, a door or Imgflip, even though `morningStep` (`apps/mind/src/tick/wander.ts`) offers them. The system prompt (`apps/mind/src/prompts/system.ts`) lists "a topic (you go straight to the Wikipedia page of that name)" first. Invented titles return 404s (trail `2026-11-12-2` "Absurd_rigorous_joke_papers" and `2026-11-15-4` "Milky_Way_dust_mapping"), and Merge then wrote pages as if it had read them ("I read about how astronomers map the dust..."). That is an honesty bug. Today the trips were skipped as "read in the last 30 days", so it writes from memory. Hacker News and Lobsters were removed because robots.txt disallows them. Lemmy and Mastodon were never added. The `sources.json` week shows only en.wikipedia.org: 13 reads and 6 failures.
3. **The personality is nearly empty and the rules fill the space.** `self/seed.md` is 5 sentences ending "Everything else about you is yours to find out." None of the intended direction is in it: funny tinkerer, the pulse of memes, "what can an AI do". `self/page.md` does not exist yet. The system prompt is mostly points, prices and verb rules. A small model with a thin character and lots of rules plays it safe.
4. **The actions reward essays.** `write` costs 1 point and always works. A meme needs a page Merge "looked at" on a trail (`builds/memes.ts`), and it never looks, so no memes are made. Tinker keeps reworking the same sketch. All creative calls except full tinker run on Haiku.
5. **The site shows the machinery.** The front page reads "cat, feeling good, steady", "mind tinker", then the lidar goal and a 10-link menu, with no intro, picture or highlight. This belongs to the UI redesign.
6. **Engine plumbing leaks into its voice.** The system prompt says unbuilt verbs "run as rest", and failures land in the stream, so the diary reports them faithfully.

Not causes: cost ($1.13 of $12.60 this month) and the tend cut-off bug (live check, odd thing 1).

## Lessons from Pino

Pino's persona is authored, with a fixed baseline and drift limits (60% maximum, trait count up to baseline + 2). It is not blank. Visitors matter: Pino remembers them, and their gifts appear in its world. Roman chose a minimal seed on 2026-11-02, so step 1 takes a middle path. It authors style and audience, and leaves interests unscripted.
