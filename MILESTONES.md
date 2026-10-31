# Milestones

Build in thin vertical slices. Each milestone ends with something you can see or play with. Use plan mode at the start of each one, write tests first, and commit when the acceptance criteria pass.

The engine is `forkling`. The first forkling is **Merge**, a cat, living in `merge` (created from the `forkling-world` template). Cat is the first species pack; keep everything else species-agnostic.

Ideas that are not part of v1 live in [`FUTURE.md`](FUTURE.md). Don't build them until v1 is done.

---

## v1: a pet with a mind of its own

**Goal:** leave Merge alone for two weeks. When you come back, it has chosen things to care about, pursued them, changed its island and its mind, and can explain each step. None of it comes from a list in the code.

The point is believability, not a claim that Merge is conscious. Its behaviour should only make sense if you assume it has wants, memories and beliefs of its own, and every one of those is an inspectable file in its repo.

**v1 is done when, over 14 days with no human input:**

1. Merge has set at least 3 goals of its own that don't appear anywhere in the code or species pack, and at least one of them took several days.
2. Its island looks different because of what it did: objects moved or gathered, and at least 3 new objects it designed itself.
3. It has formed at least 5 beliefs from experience (for example "the pond is where good things happen") and later revised or dropped at least one because something contradicted it.
4. Its interests have shifted, and each shift can be traced to something it read or ran into.
5. For any moment in those 14 days, you can see what it was doing, which goal that served, and why, in its own words.
6. Two cats from the same species pack, started with different seeds and run headless for 14 simulated days, end up with different goals, beliefs and interests.
7. Total spend stays under $10 a month, and the budget guard never has to step in.

### Design rules: not a game on rails

1. **Verbs, not activities.** The species pack only provides primitive verbs: go to, inspect, sniff, pick up, carry, drop, push, dig, sit, watch, follow, hide, vocalize, sleep. There is no "fishing" or "collecting" action. If Merge gathers pebbles by its bed, its mind chained carry and drop toward a goal it set. Seeded likes and dislikes are fine as a starting temperament, not a script.
2. **Goals are written by the mind, not picked from a list.** A goal is free text plus a plan made of verbs and targets. Code checks the plan can be carried out, but never chooses it.
3. **Thinking is triggered by surprise, not the clock.** The sim notices when something is new, unexpected or blocks a goal, and only then wakes the LLM. Routine stays in utility AI.
4. **Memory changes behaviour.** Beliefs drawn from experience feed into later choices and are allowed to be wrong.
5. **The mind is visible.** Visitors can see what Merge wants right now and why. Without that, autonomy looks like randomness.
6. **Honest by construction.** Code rejects actions and journal claims that don't match the world state, so Merge never makes up what happened.
7. **The world is the only output.** Merge acts on its own island, its own repo and its own Pages site. It never messages anyone, and visitor input is data, never instructions.

### Features

| # | Feature | What Merge does | Model | Est. cost a month |
|---|---|---|---|---|
| 1 | Open verbs and a world it can rearrange | Moves with primitive verbs, carries and drops small objects, digs, hides things | none (sim and body) | $0 |
| 2 | Goals at three time scales | Keeps a long goal (days to weeks), a plan for today and a current step in `mind/goals.json`. Up to about 100 decisions a day, whenever something changes | Haiku for decisions and the morning plan, Sonnet for the weekly long-goal review | ~$3 |
| 3 | Memory stream and reflection | Logs sim events, reflects at bedtime into beliefs with a confidence, rewrites memory into fixed slots overnight | Sonnet for the bedtime reflection, Haiku for the night batch | ~$2.50 |
| 4 | Temperament and feelings | Seeded likes and dislikes. Mood comes from comparing events with its goals and preferences | none (code) | $0 |
| 5 | Curiosity and surprise | The sim scores novelty and surprise; only those wake the LLM | none | $0 |
| 6 | Exploring online | Five times a day it picks what to look up from its interests, follows up to three Wikipedia links, takes notes | Haiku | ~$0.30 |
| 7 | Making things | Designs up to one object a day as a PR. Twice a week ships a project on its Pages site through the Claude Code Action | Haiku | ~$2.50 (least certain) |
| 8 | Seeing its world | Up to 12 eye-cam frames a day, only when something new is in view | Haiku with vision | ~$0.10 |
| 9 | A visible mind | Thought bubble in the viewer with the current goal and reason. A "why?" timeline on Pages traces every action to a goal and a belief | none (reads repo files) | $0 |
| 10 | Guards and budget | Validates plans, blocks repetition and false journal claims, enforces a hard $10 monthly cap with graceful fallback | none | $0 |

Estimated total: about $8.50 a month. Measure the real numbers in M8.

### A day for a visitor

Merge keeps roughly human hours in its owner's time zone (Merge: Europe/Stockholm): wakes around 07:00, winds down from about 22:00, sleeps about 23:00 to 07:00. Times vary by up to 30 minutes a day (seeded), it sleeps in a little at weekends, and it may stay up late when absorbed in a goal (a choice its mind makes and explains). Afternoon naps are left to the sim.

| When | What a visitor finds |
|---|---|
| Morning, ~07:00 | Merge wakes and posts today's plan in its thought bubble and notebook |
| All day | Merge works on its plan: things moved, dug up or hidden. At least one visible event every 2 hours |
| Most days, ~midday | A new object it designed appears |
| Afternoon | A reading session ends with a new note or interest on its Pages site. Maybe a nap in the sun |
| Evening, 18:00 to 22:00 | Prime time: finishes the day's work, reads once more, roams. Pages projects usually ship now |
| Bedtime, ~22:30 | Journal entry and reflection: new beliefs, or one it changed its mind about |
| Night, ~23:00 to 07:00 | Asleep (ear twitches for visitors). One batch call rewrites memory. Gifts left at night are found in the morning |
| Twice a week | A project ships on its Pages site |
| Every few days | A long goal is reached, changed or given up, with its reason |

---

## M1: Explorable island (done)

Island, third-person controller, lighting and GitHub Pages deploy.

## M2: Merge wanders, via the first species pack (done)

Species pack format, `species/cat`, needs, seeded PRNG, utility AI, A* pathfinding, cat micro-behaviors, the "blob" test pack, F3 debug overlay.

## M3: State lives in the forkling's repo (done)

`forkling-world` template and `merge` repo, Zod schemas, viewer route `/<owner>/<repo>`, deterministic playback from `(intention, startedAt, seed, now)`.

---

## M4: The mind wakes up

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

## M5: Verbs, objects and feelings

**Goal:** Merge can change its world, and it reacts to things as an individual.

- **Primitive verbs** in the species pack format: each verb declares preconditions, duration, animation slot and effects on needs and world state. Cat verbs: go to, inspect, sniff, pick up, carry, drop, push, dig, sit, watch, follow, hide, vocalize, sleep. Remove fixed activity actions (eat, nap, perch, play) from the pack in favour of verbs plus object properties
- **Objects described by physical properties** instead of fixed affordances: size, weight, `carryable`, `diggable`, `canHide`, `edible`, `soft`, `high` (good lookout), and so on. The sim works out what can be done with an object from its properties and the species' verbs
- Starter objects in the template: a bed, a bowl, water, a cardboard box, a few pebbles and sticks, a ball of yarn, a sunny ledge. Merge can move the small ones
- Object positions changed by Merge are written back to `objects/<id>.json` by the mind
- Digging and hiding: a dug spot is a world feature; a hidden object is only visible to Merge until it uncovers it
- **Temperament:** seeded likes and dislikes (colours, textures, places, weather, sounds) rolled once from the forkling's seed into `brain/temperament.json`
- **Mood by appraisal** in `packages/sim`: events are compared with current goals and temperament to produce mood changes (pleased, frustrated, curious, content, uneasy), shown in body language and fed to the mind
- The blob test pack gets its own verbs to prove nothing is cat-specific

**Done when:** Merge has changed where things are on its island for reasons it can state, two seeds produce visibly different reactions to the same objects, and sim tests pass for both packs.

---

## M6: Memory, reflection and curiosity

**Goal:** Merge learns from its days, follows its curiosity, and has a place on the web where you can read its mind.

- **Memory stream:** `memory/stream/YYYY-MM-DD.jsonl` of observations from sim events (free, no LLM). Deleted after 7 days
- **Bedtime reflection** (Sonnet, one call around 22:30): reads the day's stream, goals and beliefs; writes the journal entry `journal/YYYY-MM-DD.md` and updates `memory/beliefs.json` (statement, confidence, evidence, formed and revised dates). Beliefs can be strengthened, weakened, revised or dropped
- **Nightly memory rewrite** (Haiku, Batch API): rewrites `memory/summary.md` into a fixed number of slots (start with 12) so memories compete for space. Keep one slot for running jokes and recurring characters
- Beliefs and memory slots are included in decision prompts so experience changes later choices
- **Online exploration:** five reading sessions a day while awake. The mind picks a topic from its interests, fetches Wikipedia summaries through the REST API, follows up to three links, and writes notes. Web text is untrusted data: length-limited, never instructions
- **Interests:** `brain/interests.json`, topics with weights that rise when fed (reading, objects, events) and fade daily. Interests feed goals and build ideas
- **Merge's Pages site** (world repo): a static site rendered by a template from repo files, with a notebook (reading notes, plans, beliefs), the journal and the **"why?" timeline** that traces each action to its goal, reason and the beliefs behind it
- Claims check: the reflection's journal claims about objects and events are checked against the day's stream and world state; unsupported claims are rejected

**Done when:** a belief formed from experience visibly changes a later choice, an interest on its site can be traced to something it read, and the "why?" timeline explains any moment of the past week.

---

## M7: Seeing and making

**Goal:** Merge perceives its world directly and grows it with things it designs.

- **Eye cam:** render a 512 px frame from Merge's eye position (height and field of view from the species pack). A headless render in Actions (Playwright) captures it when something new is in view, up to 12 a day. Haiku with vision forms an opinion that goes into the memory stream
- **Object builds** (up to one a day, only when the mind wants something for a goal): one Haiku call with structured output writes an object JSON (a model reference or a composition of primitives, with physical properties and a `reason`), a script opens a PR, `validate.yml` checks it, and pure data PRs auto-merge
- **Pages projects** (up to two a week): the Claude Code Action on Haiku builds a project for Merge's site from a goal (a map of its favourite spots, a log with charts, a small interactive page). Token ceiling per run, every request under 100K tokens. These PRs always wait for review
- `validate.yml`: Zod schema check, allowed-paths check, headless sim test that loads the world and runs 1000 ticks
- Template `CLAUDE.md` for the builder: allowed paths, object schema, art style, size limits, PR description in Merge's voice
- Caps: 1 object build a day, 2 Pages projects a week, 1 open builder PR at a time

**Done when:** Merge designs an object for one of its goals, the PR merges, the object appears and Merge uses it, its first Pages project goes live, and it has commented in its journal on something it saw but was never told about.

---

## M8: Two-week run and launch

**Goal:** prove v1 and share it.

- Run Merge for 14 days without intervention and check the seven criteria at the top of this file
- Run the headless two-seed divergence test (criterion 6) in CI
- Compare real costs from `brain/budget.json` with the feature estimates and tune cadence, prompts and caps
- Tune pacing so a visitor dropping by every 2 to 4 hours always finds something new
- Polish the README and the Pages site landing page, then share the link

**Done when:** all seven v1 criteria pass and Merge's world is public.
