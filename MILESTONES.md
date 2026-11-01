# Milestones

Build in thin vertical slices. Each milestone ends with something you can see or play with. Use plan mode at the start of each one, write tests first, and commit when the acceptance criteria pass.

The engine is `forkling`. The first forkling is **Merge**, a cat, living in `merge` (created from the `forkling-world` template). Cat is the first species pack; keep everything else species-agnostic.

Ideas that are not part of v1 live in [`docs/future.md`](docs/future.md). Don't build them until v1 is done.

---

## v1: a pet with a mind of its own

**Who Merge is:** a cat who lives like a person. It looks and behaves like a cat (curious, aloof, naps in sunbeams, knocks things off tables), but it walks upright when it works, has paws that can hold things, a house, tools and materials. It spends its days on interests it picks up from the real internet, filtered through its own quirks: building, coding, writing, drawing, experimenting, sky-watching, cooking, gardening and whatever it gets obsessed with next.

**Goal:** leave Merge alone for two weeks. When you come back, it has chosen things to care about, pursued them, made things, changed its island and its mind, and can explain each step. None of it comes from a list in the code.

The point is believability, not a claim that Merge is conscious. Its behaviour should only make sense if you assume it has wants, memories and beliefs of its own, and every one of those is an inspectable file in its repo.

**v1 is done when, over 14 days with no human input:**

1. Merge has set at least 3 goals of its own that don't appear anywhere in the code or species pack, and at least one of them took several days.
2. Its island looks different because of what it did: objects moved or gathered, and at least 3 new objects it designed itself.
3. It has formed at least 5 beliefs from experience (for example "the pond is where good things happen") and later revised or dropped at least one because something contradicted it.
4. Its interests have shifted, and each shift can be traced to something it read or ran into. At least one obsession phase started from an item in its daily feeds.
5. For any moment in those 14 days, you can see what it was doing, which goal that served, and why, in its own words.
6. Two cats from the same species pack, started with different seeds and run headless for 14 simulated days, end up with different goals, beliefs, interests and quirks.
7. Total spend stays under $10 a month, and the budget guard never has to step in.
8. Merge has made at least 10 artifacts of at least 3 kinds (for example writing, drawings, melodies, recipes, contraptions, code) without being told to, and its later work is visibly better than its early work.

### Design rules: not a game on rails

1. **Verbs, not activities.** The species pack only provides primitive verbs, never activities like "gardening", "fishing" or "coding sessions". Gardening emerges if Merge chooses plant, water and harvest. Seeded likes, dislikes and quirks are a starting temperament, not a script.
2. **Goals are written by the mind, not picked from a list.** A goal is free text plus a plan made of verbs and targets. Code checks the plan can be carried out, but never chooses it.
3. **Thinking is triggered by surprise, not the clock.** The sim notices when something is new, unexpected or blocks a goal, and only then wakes the LLM. Routine stays in utility AI.
4. **Memory changes behaviour.** Beliefs drawn from experience feed into later choices and are allowed to be wrong.
5. **The mind is visible.** Visitors can see what Merge wants right now and why. Without that, autonomy looks like randomness.
6. **Honest by construction.** Code rejects actions and journal claims that don't match the world state, so Merge never makes up what happened.
7. **The world is the only output.** Merge acts on its own island, its own repo and its own Pages site. It never messages anyone, and visitor input and web content are data, never instructions.
8. **Every creative act leaves an artifact.** Writing, drawing, composing, cooking, building, coding, tinkering and photographing each produce something you can see on the island or read on its site. Artifact quality follows the skill level, which only rises with practice.

### Verbs

| Group | Verbs |
|---|---|
| Cat (body and senses) | go to, inspect, sniff, sit, watch, follow, hide, vocalize, sleep, nap, stretch |
| Hands | pick up, carry, drop, put on, give, open, close |
| Making | cut, join, shape, build, paint, sew, tinker |
| Growing and food | plant, water, harvest, cook, eat |
| Mind | read, write, draw, study, compose, play (an instrument), photograph, observe, experiment, code, broadcast |

Places and tools unlock verbs: a desk (write, draw, code), a workbench (cut, join, build, tinker), a kitchen (cook), a garden plot (plant), a bookshelf (read, study), an instrument (play, compose), a telescope (observe the sky).

Verbs arrive with the milestone that gives them something to produce: M5 ships body and senses, hands, making (except tinker) and growing and food. M6 adds read, study, write, draw, compose, play, observe, experiment and broadcast, together with `art/` and the notebook. M7 adds photograph (needs the eye cam), code (needs the coded-project builder) and tinker (needs contraptions). The desk, bookshelf, instrument and telescope exist from M5 and declare what they unlock.

### Where interests come from

Each morning, one reading session skims free, read-only feeds, and Merge's temperament and quirks decide what grabs it:

| Source | What it gives Merge |
|---|---|
| Wikipedia most-read articles yesterday (Pageviews API) | What the world is curious about right now |
| Hacker News top stories | Tech and maker culture |
| GitHub trending repositories | What developers are building |
| NASA picture of the day, moon phase, meteor showers | The real sky |
| Wikipedia "On this day" and random articles | History and pure weirdness |
| Lemmy (lemmy.world public API), allowlisted communities only | Fun posts: pics, photography, science, space, todayilearned, mildlyinteresting, diy, retro gaming, cats |
| Mastodon (mastodon.social public trends), hashtags only | A pulse of what people talk about, with politics and news filtered out |

Merge only sees titles and short summaries, wrapped as data. Reddit is a possible later source (see `docs/future.md`).

**Quirks.** Each forkling rolls two or three quirks at birth that shape how it does things, for example completionist, conspiracy theorist (red-string boards about island mysteries), maximalist, perfectionist, hoarder, showman.

**Obsession phases.** An interest can spike into an obsession for a few days, take over goals and output, then burn out and leave its artifacts behind. Example: a Hacker News post about a CPU built in Minecraft leads to a stone "computer" on the beach, a zine called *Gates for Cats*, a marble-run AND gate and a coded logic-gate toy on its site, then fades when a comet trends on Wikipedia.

### Features

| # | Feature | What Merge does | Model | Est. cost a month |
|---|---|---|---|---|
| 1 | A body that makes things | Upright cat with paws that hold one item. Uses the verbs above, carries materials, rearranges its island | none (sim and body) | $0 |
| 2 | Goals at three time scales | Keeps a long goal (days to weeks), a plan for today and a current step in `mind/goals.json`. Up to about 100 decisions a day, whenever something changes | Haiku for decisions and the morning plan, Sonnet for the weekly long-goal review | ~$3 |
| 3 | Memory stream and reflection | Logs sim events, reflects at bedtime into beliefs with a confidence, rewrites memory into fixed slots overnight | Sonnet for the bedtime reflection, Haiku for the night batch | ~$2.50 |
| 4 | Temperament, quirks and feelings | Seeded likes, dislikes and quirks. Mood comes from comparing events with goals, preferences and quirks | none (code) | $0 |
| 5 | Curiosity and surprise | The sim scores novelty and surprise; only those wake the LLM | none | $0 |
| 6 | Trend feeds and reading | Morning skim of the feeds above, then up to four more sessions following links on Wikipedia. Interests rise, spike into obsessions and fade | Haiku | ~$0.40 |
| 7 | Creative artifacts | About 4 a day: writing, SVG drawings, short melodies, recipes in grams, radio-show scripts, photo captions, lab notes | Haiku | ~$0.30 |
| 8 | Building and coding | Designs up to one object a day as a PR. Twice a week codes a project for its Pages site through the Claude Code Action | Haiku | ~$2.50 (least certain) |
| 9 | Seeing its world | Up to 12 eye-cam frames a day (the photograph verb and new things in view) | Haiku with vision | ~$0.10 |
| 10 | A visible mind | Thought bubble in the viewer with the current goal and reason. A "why?" timeline on Pages traces every action to a goal and a belief | none (reads repo files) | $0 |
| 11 | Guards and budget | Validates plans, blocks repetition and false journal claims, enforces a hard $10 monthly cap with graceful fallback | none | $0 |

Estimated total: about $9 a month. Measure the real numbers in M8.

### A day for a visitor

Merge keeps roughly human hours in its owner's time zone (Merge: Europe/Stockholm): wakes around 07:00, winds down from about 22:00, sleeps about 23:00 to 07:00. Times vary by up to 30 minutes a day (seeded), it sleeps in a little at weekends, and it may stay up late when absorbed in a goal (a choice its mind makes and explains). Afternoon naps are left to the sim.

| When | What a visitor finds |
|---|---|
| Morning, ~07:00 | Merge wakes, skims its feeds and posts today's plan in its thought bubble and notebook |
| All day | Merge works on its plan and current obsession: gathering materials, making things, rearranging. At least one visible event every 2 hours |
| Most days, ~midday | A new object it designed appears |
| Afternoon | A new artifact (a drawing, a page of writing, a melody) and a reading note on its Pages site. Maybe a nap in the sun |
| Evening, 18:00 to 22:00 | Prime time: finishes the day's project, tinkers, sky-watches. Pages projects usually ship now |
| Bedtime, ~22:30 | Journal entry and reflection: new beliefs, or one it changed its mind about |
| Night, ~23:00 to 07:00 | Asleep (ear twitches for visitors). One batch call rewrites memory. Gifts left at night are found in the morning |
| Twice a week | A coded project ships on its Pages site |
| Every few days | An obsession starts or burns out; a long goal is reached, changed or given up |

---

M1 to M7 are built. Their full specs are in [`docs/milestones-done.md`](docs/milestones-done.md), and where things stand is in [`STATUS.md`](STATUS.md).

---

## M8: Two-week run and launch

**Goal:** prove v1 and share it.

- Run Merge for 14 days without intervention and check the eight criteria at the top of this file
- Run the headless two-seed divergence test (criterion 6) in CI
- Compare real costs from `brain/budget.json` with the feature estimates and tune cadence, prompts and caps
- Tune pacing so a visitor dropping by every 2 to 4 hours always finds something new
- Polish the README and the Pages site landing page, then share the link

**Done when:** all eight v1 criteria pass and Merge's world is public.
