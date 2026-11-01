# Finished milestones

Full specs of M1 to M7, moved out of [`MILESTONES.md`](../MILESTONES.md). The v1 goal, criteria and design rules stay there. Current state is in [`STATUS.md`](../STATUS.md).

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

## M5: A body that makes things

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

## M6: Memory, reflection, curiosity and creative work

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

## M7: Seeing, building and coding

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

