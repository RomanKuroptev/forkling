# Milestones

Build in thin vertical slices. Each milestone ends with something you can see or play with. Use plan mode at the start of each one, write tests first, and commit when the acceptance criteria pass.

The engine is `forkling`. The first forkling is **Merge**, a cat, living in `merge` (created from the `forkling-world` template). Cat is the first species pack; keep everything else species-agnostic.

Ideas that are not part of v1 live in [`FUTURE.md`](FUTURE.md). Don't build them until v1 is done.

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

Merge only sees titles and short summaries, wrapped as data. Reddit is a possible later source (see `FUTURE.md`).

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

## M1: Explorable island (done)

Island, third-person controller, lighting and GitHub Pages deploy.

## M2: Merge wanders, via the first species pack (done)

Species pack format, `species/cat`, needs, seeded PRNG, utility AI, A* pathfinding, cat micro-behaviors, the "blob" test pack, F3 debug overlay.

## M3: State lives in the forkling's repo (done)

`forkling-world` template and `merge` repo, Zod schemas, viewer route `/<owner>/<repo>`, deterministic playback from `(intention, startedAt, seed, now)`.

---

## M4: The mind wakes up (built; finishing the one-day run)

**Goal:** Merge sets and pursues its own goals on a schedule, sleeps like a person, and you can see why it does what it does.

- `apps/mind`: one tick = load state and species pack, apply needs decay since `lastTickAt`, process `events/inbox/`, score surprise, decide whether to think, choose or keep an intention, validate, commit only if something changed
- **Surprise triggers** in `packages/sim`: novelty (an object or event not seen before), a blocked plan step, a strong need, a goal step finished, a new day. No trigger means no LLM call; utility AI keeps Merge busy
- **Goals at three time scales** in `mind/goals.json` (world repo): `long` (free text, days to weeks), `today` (a plan of verb + target steps), `now` (the current step). Haiku writes the morning plan and handles triggered decisions, returning structured output with a one-sentence `reason` in Merge's voice. Sonnet reviews the long goal once a week
- **Validate step in code** after every LLM decision: the plan's verbs exist in the species pack, targets exist in the world, preconditions hold; anti-fixation (same action or target too many times in a row) is rejected; on rejection fall back to utility AI and log why
- **Sleep schedule** from the forkling's time zone with seeded daily jitter (±30 min), weekend lie-in, and an optional late night the mind can choose. While asleep: hourly ticks, no LLM calls
- **Budget guard:** `brain/budget.json` ledger with per-call token counts and dollar cost, hard cap $10 a month. At the cap the mind skips all LLM calls until the month resets. Token use goes to the Actions job summary
- `.github/workflows/mind.yml` in the template: cron every 10 minutes while awake (skip cheaply when asleep except on the hour), plus `repository_dispatch` for an immediate tick on a visitor event (debounced to 2 minutes). Checks out `forkling` at a pinned tag. Commits `chore(mind): <short summary>` only when state changed
- **Thought bubble** in the viewer: current goal, current step and its reason, read from the repo
- `pnpm mind:local` runs a tick against a local checkout, with a `--dry-run` that prints the prompt and token estimate

**Done when:** Merge sets a goal of its own, pursues it through a day, goes to bed and wakes up on schedule, the thought bubble shows why it is doing what it does, and the budget ledger shows a few cents a day.

Note: GitHub cron can be delayed by several minutes. Design for that; never assume exact tick times.

---

## M5: A body that makes things (built; needs its live run)

**Goal:** Merge has hands, a home and materials, and starts making things for its own reasons.

- **Body plan in the species pack format:** a pack declares `quadruped`, `upright` or both, and which verb groups that body allows. The cat pack becomes an upright cat that drops to four legs for running, zoomies and sleeping
- **Upright cat model:** update `species/cat/src/buildCat.ts` and `clips.ts` for a two-legged working pose with arms and paws, a held-item attachment point, and a few shared work clips (work at a surface, use a held tool, hold up to look, carry). Most making verbs share these clips plus a prop
- **Primitive verbs** replace the M2 actions (`eat`, `nap`, `perch`, `play`...): each verb declares body plan, preconditions (tool or place, held item, materials), duration, animation slot, and effects on needs, skills and world state. `PlanStep.verb` keeps its shape. M5 covers body and senses, hands, making (except tinker) and growing and food; the Mind verbs wait for M6 and M7 (see Verbs above)
- **What making produces:** a made object, written by deterministic code and committed straight to `objects/` by the mind (capped at 30 per world). It is a composition of primitives. A big build appears at once as unfinished and grows each session until done. The making skill sets how tidy and how large it is, and the materials set its properties (wood is light and carryable, stone is heavy, flowers are soft). Name and reason come from the plan step as untrusted text
- **Objects by physical properties** instead of affordances: size, `weightKg`, `carryable`, `diggable`, `canHide`, `edible`, `soft`, `high`, `material`. The sim works out what a verb can do with an object from its properties
- **Tools and places** as starter objects in the template: a small house with a desk, a workbench, a kitchen corner, a garden plot, a bookshelf, an instrument and a telescope, plus the bed, bowl and water. Each one unlocks verbs
- **Materials** to gather around the island (wood, stones, clay, flowers, fibres, shells) that respawn slowly, and an inventory in `forkling.json` (what it holds, what is stored at home)
- **Things that change over days** in the sim: plants grow, paint dries, food spoils, materials respawn
- **Skills** per verb group in `brain/skills.json`, raised in the sim with practice
- **Temperament and quirks:** seeded likes and dislikes (colours, textures, places, weather, sounds) and two or three quirks, rolled once into `brain/temperament.json` from pools in the species pack
- **Mood by appraisal** in `packages/sim`: events are compared with goals, temperament and quirks to produce mood changes, shown in body language and fed to the mind
- Update the mind's prompts for verbs, places, materials, inventory, skills and quirks
- The blob test pack gets its own small verb set and a quadruped body to prove nothing is cat-specific

**Done when:** Merge gathers materials and makes something at a tool or place for a reason it states, two seeds produce visibly different reactions and choices, and sim tests pass for both packs.

---

## M6: Memory, reflection, curiosity and creative work (built on branches m6-memory, m6-curiosity, m6-art; needs release and its live run)

**Goal:** Merge learns from its days, follows what it finds online, and its creative work shows up on its own website.

- **Memory stream:** `memory/stream/YYYY-MM-DD.jsonl` of observations from sim events (free, no LLM). Deleted after 7 days
- **Bedtime reflection** (Sonnet, one call around 22:30): reads the day's stream, goals and beliefs; writes the journal entry `journal/YYYY-MM-DD.md` and updates `memory/beliefs.json` (statement, confidence, evidence, formed and revised dates). Beliefs can be strengthened, weakened, revised or dropped
- **Nightly memory rewrite** (Haiku, Batch API): rewrites `memory/summary.md` into a fixed number of slots (start with 12) so memories compete for space. Keep one slot for running jokes and recurring characters
- Beliefs and memory slots are included in decision prompts so experience changes later choices
- **Trend feeds** (`apps/mind/src/feeds/`): one adapter per source in the table above, each returning titles and short summaries only, with per-source allowlists (Lemmy communities) and a politics and news filter (Mastodon hashtags). Every feed fails soft: a broken source is skipped, never fatal. Confirm each source is reachable from GitHub Actions
- **Reading sessions:** five a day while awake. The morning one skims the feeds; the others follow up to three Wikipedia links from a topic Merge picks. Web text is untrusted data: length-limited, wrapped in `<data>`, never instructions
- **Interests and obsessions:** `brain/interests.json`, topics with weights that rise when fed and fade daily; a topic above a threshold becomes an obsession phase with a start date, which biases goals and artifacts until it burns out. Past phases are kept for the site
- **Creative artifacts** in `art/<id>.json` (kind, title, content, the skill level it was made at, the goal and obsession it served): writing (poems, essays, field notes, zines), SVG drawings, short Tone.js melodies, recipes with amounts in grams, radio-show scripts, lab notes from experiments. Drawings hang in its house; melodies play near Merge in the viewer. The prompt includes the skill level so early work is simpler
- **Merge's Pages site** (world repo): a static site rendered by a template from repo files, with the notebook (reading notes, plans, beliefs), the journal, a gallery of artifacts, past obsession phases, and the **"why?" timeline** that traces each action to its goal, reason and the beliefs behind it
- Claims check: the reflection's journal claims about objects and events are checked against the day's stream and world state; unsupported claims are rejected

Built in three slices, each released and run live before the next: **A** memory (stream, bedtime reflection, beliefs, journal, nightly Batch rewrite, claims check; steps cite beliefs with `because`), **B** curiosity (feeds, reading, interests, obsessions, notebook), **C** art (mind verbs, artifacts, the site, viewer hooks).

**Done when:** a belief formed from experience visibly changes a later choice, an obsession on its site can be traced to a feed item, and its gallery shows at least three kinds of artifact.

---

## M7: Seeing, building and coding (in progress: slice A built on `m7-eyecam`)

**Goal:** Merge perceives its world directly and grows it and its website with things it designs.

- **Eye cam and the photograph verb:** render a 512 px frame from Merge's eye position (height and field of view from the species pack). A headless render in Actions (Playwright) captures it when Merge photographs something or something new is in view, up to 12 a day. Haiku with vision writes Merge's caption or opinion, which goes into the memory stream and its site
- **Object builds** (up to one a day, only when the mind wants something for a goal or obsession): one Haiku call with structured output writes an object JSON (a model reference or a composition of primitives, with physical properties and a `reason`), a script opens a PR, `validate.yml` checks it, and pure data PRs auto-merge
- **Tinker contraptions:** objects that are made of parts and run a physics sequence when triggered (chain reactions, catapults, marble runs). The body plays them with Rapier as a show; the sim only records that it ran and what Merge thought of it
- **Coded Pages projects** (the code verb, up to two a week): the Claude Code Action on Haiku builds a small game, toy or interactive page for Merge's site from a goal or obsession. Token ceiling per run, every request under 100K tokens. These PRs always wait for review
- `validate.yml`: Zod schema check, allowed-paths check, headless sim test that loads the world and runs 1000 ticks
- Template `CLAUDE.md` for the builder: allowed paths, object schema, art style, size limits, PR description in Merge's voice
- Caps: 1 object build a day, 2 coded projects a week, 1 open builder PR at a time

Built in four slices, each released and run live before the next: **A** eye cam and the `photograph` verb (v0.7.0), **B** object builds, `validate.yml`, `build.yml` and auto-merge (v0.7.1), **C** tinker contraptions (v0.7.2), **D** coded Pages projects (v0.7.3). Photos are 512 px jpegs kept at `art/photos/<id>.jpg` next to an `art/<id>.json` photo artifact; contraptions are designed in the object-build call and checked with a headless Rapier run before they land.

**Done when:** Merge designs an object for one of its goals, the PR merges, the object appears and Merge uses it, a contraption it built runs for visitors, its first coded project goes live, and it has commented in its journal on something it photographed but was never told about.

---

## M8: Two-week run and launch

**Goal:** prove v1 and share it.

- Run Merge for 14 days without intervention and check the eight criteria at the top of this file
- Run the headless two-seed divergence test (criterion 6) in CI
- Compare real costs from `brain/budget.json` with the feature estimates and tune cadence, prompts and caps
- Tune pacing so a visitor dropping by every 2 to 4 hours always finds something new
- Polish the README and the Pages site landing page, then share the link

**Done when:** all eight v1 criteria pass and Merge's world is public.
