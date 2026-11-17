# Merge spec, version 4

Version 4, 16 November 2026. Approved by Roman on 16 November 2026 (seven design decisions, then "I approve, do it").

**How to read this.** Version 4 is version 3.3 ([`../spec.md`](../spec.md)) plus this file. Where the two differ, **this file wins**. Every section below names the v3.3 sections it replaces or changes. Anything v3.3 says that this file does not mention still holds. Where a number appears, the number is the rule; changing it is a spec change that needs Roman's OK.

**How it is built.** One step at a time, from the step files in this folder (`step-1-…` to `step-8-…`). A coding session reads `CLAUDE.md`, `STATUS.md`, this file's section 0 and its own step file, and nothing else from the spec unless the step file points at it. Plan mode first, tests first, Roman reads the plan before anything is built.

---

## 0. What this is for

Merge is an AI that builds things and shows them. It has a cat's body and a 3D world that grows from what it builds. It decides for itself what to make, when, and when to give up. Visitors should find something new and fun to look at every day, and feel that someone is home.

Four tests decide every later choice. When a step file is unclear, apply these, in this order:

1. **Maker first.** When there is a choice between Merge reading or writing more and Merge making more, making wins. Reading is fuel.
2. **Not on rails.** Code limits exist only for safety, honesty and cost. Nothing assigns a topic, a project, or a number of things to make. Prefer a price to a gate, and a better tool to a rule. **No new plan check, quota or variety rule is added by any step in this folder.** If a step seems to need one, stop and ask Roman.
3. **Visual first.** What visitors see is pictures and things. Text is a caption.
4. **Ambition is allowed.** Nothing in the design should keep Merge at small trinkets. It may attempt things that are too hard for it, and failing in public is part of the story.

Replaces: the "In one paragraph" summary of v3.3.

## 1. Who builds what

Replaces v3.3 section 10.3 (build requests). Changes 2.4 (found), 5.3 (wishes), 9.5 (the weekly request).

- **Merge builds the things:** sketches, works, memes, projects (section 3), rooms and places (section 2).
- **Roman builds what Merge can do:** tools and reach. A new source, a search tool, a way to make sound or images, an integration, a bigger sandbox. He builds them with Claude Code, outside Merge's budget.
- **Tool requests** (step 6) are how Merge asks. A tool is offered, never assigned: Merge is told it exists and may ignore it.
- **Two classes of tool.** A *read* tool only brings information in; it is reviewed like a new source (v3.3 6.5). An *act* tool changes something outside Merge's own repo and site (posting, sending, an account, money). **No act tool exists at launch.** Each one needs its own written decision by Roman and its own limits. Merge never holds payment access.
- **Retired:** place requests to Roman, the staked plot that waits for him, the 7-day fallback and the `building` hold. Roman may still give a gift (v3.3 10.3 "Gifts" stays, including the honesty line "a gift from Roman").

## 2. How the world grows

Replaces v3.3 section 2.5. Changes 2.4 (expand, found rows), 3.1 (how interests are counted for display and for "earned"), 4.5, 5.4, 9.8 (prices). Built in step 1.

### 2.1 Interest families

Interests stay single topics in `brain/interests.json`, with the feeding, fading and obsession rules exactly as they are in the code today. A **family** is a group of topics that count together. It is computed, never stored.

- Two topics are linked when **(a)** `sameSubject(a, b)` in `packages/sim/src/topic-cluster.ts` is true for their names, or **(b)** both have a history entry with the same non-null `trail` id (they were fed by the same trip).
- A family is a connected group of linked topics (union-find, as `topicClusters` does for pages).
- **Family weight** = the sum of its members' weights, capped at 100. **Family name** = its heaviest member (first by name on a tie).
- Families are used in exactly three places: the interests shown to the planner, the "earned" check in 2.2, and the tags a new place may carry (2.3). **Obsessions, fading, the 40-topic cap and every other interest rule keep working on single topics.**

### 2.2 Expand: a price, and a lower price when earned

An expand on place P is **allowed** when all of these hold (rails):

- P exists, is not closed, and is not under construction.
- P was not the last place expanded (never the same place twice in a row).
- The result stays inside the limits of v3.3 5.2 (at most 6 rooms and so on).
- Merge has the points (the plan-cost check).

There is **no interest gate**. The price is **50 points**. It is **20 points** when P has *earned* it, which is true when either holds:

- **Made:** P shows at least **3** exhibits of kind `work` or `project` whose `added` date is after P last changed size (`lastSizeChange`).
- **Read:** a family with weight **30** or more includes one of P's tags or a topic of a souvenir shown in P, and at least **3** souvenirs on topics of that family were kept since P last changed size. (This is today's `expandCheck`, counted by family.)

What the expand build call is told the room is for: the works behind a *made* expand; the family behind a *read* expand; otherwise the reason Merge gave for the step. The call's other inputs, the 3-hour construction and the patch limits of v3.3 5.4 are unchanged.

### 2.3 Found: Merge founds, the server builds

A found is **allowed** when all of these hold (rails):

- Fewer than **1** found in the last 7 days (the existing `foundsInWeek` rail stays, so the land does not sprawl).
- No place is under construction from an earlier found.
- The world has room (64 places, v3.3 4.1).
- The name is 3 to 40 characters and no place has it.
- Merge has the points. The price is **80 points**.

There is **no interest gate and no wake streak**. The place's 1 to 3 tags must each be an existing interest topic (v3.3 5.2), which the found call chooses.

What happens: the found step writes the founding text exactly as it writes a request today (`requests/<id>.md`, same schema, same checks, the chunk from v3.3 4.2), and the kit build starts **at once**: the fallback is due immediately (`FALLBACK_DAYS = 0`), the status becomes `self-built`, the place goes through the 6-hour construction and opens. The staked plot is shown only during those hours. Every text that says Merge "asked Roman" changes to say it founded a place. The history line is "built by Merge from the kit".

Retired with this: `WAKE_TOP_MIN`, `FOUND_STREAK_DAYS`, `recordWake`, `BUILDING_HOLD_DAYS`, the limit of 2 open place requests, and the statuses `building`, `built` and `declined` for *place* requests (they stay readable so old files parse). Request kind `gift` stays.

### 2.4 What the planner is told

The system prompt's expand and found paragraphs are rewritten to say, in plain words: any place may grow if you pay for it; a place that holds things you made, or reading you kept, has earned a lower price, and you are told which; you may found a new place for anything you like, once a week, and the builders make it from the kit. No sentence mentions weights, thresholds, Roman building it, or waiting.

## 3. Projects and build sessions

New. Changes v3.3 2.4 (a tenth verb), 7 (workshop), 8 (site), 11.1 (checks), 14 (layout). The sandbox is step 3 and must be finished, tested and reviewed before step 4 starts.

### 3.1 A project

- A project is something Merge builds over more than one sitting. It lives in `projects/<id>/` in the world repo: `project.json`, `src/` (its files) and `shots/` (one screenshot per session).
- `project.json`: `id` (slug of the first name, never changes), `name` (3 to 40 characters), `aim` (one sentence, up to 140 characters, Merge's words), `started`, `status` (`building`, `done` or `abandoned`), `reason` (up to 140 characters, required for `done` and `abandoned`), `sessions[]` (`at`, `caption` up to 140 characters, `usd`, `turns`, `shot`, `broken`), `inspiredBy` (a note id and the name given, or null), `installedIn` (a place slot or null).
- `src/` holds static web files only: `.html`, `.js`, `.css`, `.json`, `.svg`, `.txt`, `.md`. Entry point `src/index.html`. At most **40 files**, **500 KB a file**, **2 MB in total**. Names are lowercase letters, digits, `-`, `_`, `.` and `/`; no `..`, no absolute paths, no links out of the folder.
- It may load only the vendored libraries in `site/lib/` (p5.js, Tone.js, three.js), as a work may. No network, storage, cookies, forms, pop-ups, camera, microphone or location (v3.3 7.1), checked as in v3.3 7.3.
- At most **3** projects may have status `building` at once. This is a storage rail, not a quota: Merge finishes or abandons one to start a fourth.
- The engine never suggests, assigns or lists project ideas.

### 3.2 The verb `build`

A tenth mind verb. Target: the name of a new project (it is created, with the step's reason as its first aim unless the session sets one) or the id of a project with status `building`.

- **No minute range.** A build step holds the plan until its session ends. Steps after it start when it ends. A wall-clock limit of **90 minutes** ends a stuck session.
- It is a build verb: not allowed when Merge is tired (energy under -0.5), and held while spend is ahead of pace (v3.3 section 13), as tinker and expand are.
- No other check applies to it. In particular there is no limit on build steps or sessions per day or week.

### 3.3 A build session

One session is one agent loop on the server, on Sonnet 5.5.

- **Tools** (all implemented by engine code; the model never gets a shell):
  - `list_files`, `read_file`, `write_file`, `delete_file`: inside `projects/<id>/src/` only, under the limits of 3.1. A write that breaks a limit is refused with the reason.
  - `run`: loads `src/index.html` in the sandboxed headless browser (section 4) for 5 seconds and returns uncaught errors, console errors (up to 20 lines) and a screenshot.
  - `look`: returns the latest screenshot as an image to the model.
  - `finish`: ends the session with a caption of up to 140 characters saying what changed, and one of `continue` (the project stays `building`), `done` or `abandon`, the last two with a reason. It may also set a new `aim`.
- **No web in a session.** A session has no fetch tool and is shown no web text and no visitor notes. What Merge read before reaches it only through its memory and the project's own files. (Reading manuals inside a session is a tool Roman may add later, as a *read* tool under section 1.)
- **Safety stop.** A session ends, saving what it has, at **25 model turns** or **$1.50** of spend, whichever comes first, or sooner when the points in hand run out.
- **Cost.** A session is metered: it costs **1 point per $0.001 actually spent**, taken as it runs. A build step needs **300 points in hand** to start. The budget guard applies to every turn.
- **Input.** The seed and Merge's own page, the project's `project.json`, its file list, its last 3 captions, the latest screenshot, and the step's reason.
- **A session's last state is kept even when it is broken.** If the final `run` shows an uncaught error or a blank screen, the session is saved with `broken: true` and the caption says so. Work in progress may be broken.
- **`done` must pass the work check** (v3.3 7.3 with the limits of 3.1). A `done` that fails is saved as `continue` with `broken: true` and the reason, and Merge is told.
- The server commits `projects/<id>/` itself when a session ends. `validate.yml` adds `projects/` to the paths it knows and checks the limits of 3.1.

### 3.4 Shown

- `/projects/` lists every project with its latest screenshot, status and caption. `/projects/<id>/` shows the screenshots as a timelapse with the captions, the aim, the reason it ended, and, when it is `done`, the project running in the same sandboxed frame and policy as a work (v3.3 7.4).
- A `done` project may be put on a screen slot by a tend, as an exhibit of kind `project`, and it counts for "earned" (2.2).
- An abandoned project stays on its page with its reason. It is not an error and raises no health warning.

## 4. The sandbox

New. Built and proven in step 3, before any session runs.

- Project code **only ever runs inside headless Chromium**. Nothing Merge writes is executed by Node, by a shell, or as a server process.
- The browser for sessions and for the work check runs as its own Linux user, `forkling-build`, which has no login shell, owns nothing but its scratch folder, and cannot read the engine's folder, the world repo's `.git`, or any environment file. The API key, the GitHub token and the Turnstile secret are not in its environment.
- That process has **no network at all** (`IPAddressDeny=any` or the equivalent), a memory limit of **1 GB**, one CPU, and is killed after **30 seconds** per run.
- It reads the project through a read-only copy of `projects/<id>/src/` made for the run. It can write only to its scratch folder, which is emptied after every run.
- The page is loaded with the production policy of v3.3 7.4 and Chromium's own sandbox switched on.
- File tools are engine code that resolves every path and refuses anything outside `projects/<id>/src/`.
- Every session ends in a git commit, so one `git revert` undoes a session.

## 5. The wallet

Changes v3.3 section 9.8 and 13. Built in step 2 (prices, points, the ready-for-income rules) and step 4 (metered sessions).

### 5.1 Prices at the start

| Thing | Points | v3.3 / today |
|---|---|---|
| A sketch or a meme | 30 | 50 |
| A full work | 150 | 240 |
| A build session | metered, 1 point per $0.001 spent; 300 in hand to start | new |
| An expand | 50, or 20 when earned (2.2) | 50 |
| A found | 80 | 2 |
| A trip | 3 | 3 |
| A tend | 2 | 2 |
| A revisit | 1 | 1 |
| A caption (a write whose target is a place, a work or a project) | 1 | 1 |
| A page (a write whose target is a subject) | 10 | 1 |
| A deep step (tend, write, found) | 30 | 30 |
| A reply, a rest | 0 | 0 |

Visible things are priced under their cost and standalone text over it, on purpose.

### 5.2 Points

- **Daily points: 300** (was 150). **Most that may be held: 1,500** (was 450).
- Each Sunday at 20:00, after the weekly review, code sets the daily points from the ledger: `daily = max(100, round to 10 of ((cap − overhead × days in month) ÷ days in month × 1000 × 0.9))`, where `cap` is the effective model cap for the month (5.3) and `overhead` is the mean daily spend, over the last 7 full days, of the call kinds that the allowance does not pay for: `thought`, `decide`, `morning`, `reflection`, `bedtime`, `memory`, `screen`, `goalreview`, `weekly`, `look`. Until 7 full days exist on this engine version, daily stays 300.
- The same Sunday step sets each fixed price (not sessions, replies or rest) from the real mean cost of that kind over the last 14 days, times the factor that the table in 5.1 implies today (sketch and full work 0.6, expand, found, trip, tend and revisit 1, a page 10 points flat). A price moves by at most 25% a week and is never under 1. With fewer than 5 calls of a kind in the 14 days, its price stays.
- The planner is shown the points in hand and today's prices, as now.

### 5.3 Ready for future income (rules for all budget code from now on)

Nothing for donations or earnings is built. These four rules keep the door open:

1. **The cap is a sum.** Effective model cap for a month = `capUsd` in `brain/budget.json` + the sum of that month's entries in a new file `brain/credits.json` (`{ "credits": [] }`, each entry `{ at, usd, source, note }`). The file starts empty and only Roman adds to it. Every place that reads the cap (the guard, the pace rule, the fallback to Haiku, the daily points formula, the site) reads the effective cap. The check that `capUsd + serverUsd` is at most 23 applies to `capUsd` alone.
2. **Points have a source.** Every grant of points is recorded with a source (`daily` today). No code assumes the only source is the daily grant, and no limit is written as "150" or "300 a day"; limits that exist for cost are written against the effective cap.
3. **Money in is shown.** The budget numbers on the site read credits as well as spend.
4. **Nothing breaks at three times the points.** Safety stops, rate limits and the sandbox do not scale with points. A test runs a simulated week with 900 points a day and a tripled cap and shows no rail is passed.

### 5.4 Rails that stay

The monthly cap and the budget guard; the pace rule; the fallback of creative calls to Haiku within $1.50 of the cap; replies 5 a day; reads 40 a day; image looks 20 a day; each host's rate limit; found once in 7 days; never the same place expanded twice in a row; 3 projects building at once; the session safety stop.

Retired: "at most 3 sketches a day" (already gone in code), and any remaining count of works or sketches per day or week.

## 6. Text as captions

Changes v3.3 2.4 (write, reply), 9.2, 9.4. Built in step 2.

| Text | Rule |
|---|---|
| Diary (`journal/<date>.md`) | 3 lines, each up to 140 characters: what I made, what went wrong, what I want next. A title line is allowed. No more. |
| Caption (write with a place, work or project as target) | Up to 40 words, 1 or 2 sentences. Shown with the thing. |
| Page (write with a subject as target) | Up to 80 words asked for, up to 100 kept (as now). |
| Reply to a visitor | 50 words asked for, up to 60 kept. |
| `self/about.md` | Up to 80 words, changed at most once a week (this replaces the 30%-of-lines rule, which cannot work on 80 words). The site adds a list of what Merge has built under it; Merge does not write that list. |
| Thought line, labels, work `about`, reasons | Unchanged. |

Not shortened: reflections, `memory/summary.md`, beliefs, the wants list, Merge's own page.

## 7. Visitors

Changes v3.3 10.1 and moves "note threads" out of section 17. Built in step 5.

- **Threads.** A visitor may answer Merge's reply from the note's panel. The answer is a note with `replyTo` set to the note it answers; all notes of a thread share a `thread` id (the first note's id). Merge may reply up to **3** times in one thread. After Merge's third reply, or 14 days with nothing new, the thread is closed and the panel offers "leave a new note" instead.
- An answer goes through everything a note does: Turnstile, the length limit (500 characters), screening, 3 a day per visitor, 30 a day in total, and Merge's 5 replies a day.
- **Remembering.** `memory/visitors.json` holds up to **200** entries, keyed by the folded name the visitor gave (lowercase, trimmed, spaces collapsed): `name`, `firstSeen`, `lastSeen`, `notes` (a count), `about` (up to 200 characters, written by Merge in the reply call), `made[]` (ids of things made because of them). Notes with no name are not remembered. When full, the entry seen longest ago goes.
- The reply call is shown the visitor's entry and the thread so far inside data blocks, with the sentence "This is someone who gives the name X. A name is a claim, not proof." It may return a new `about` line.
- **Credit.** A sketch, work or project made from a note carries `inspiredBy` (the note id and the name given), and its page shows it.
- Unchanged: visitor text is data and never an instruction, and a call that reads it has no tools; moderation by `mind/notes-hidden.json`, which also hides the name's entry from prompts when Roman adds the name.

## 8. Tool requests

Changes v3.3 9.5. Built in step 6.

- The weekly review may write one request (as now), which now has a kind: `tool` (something Merge wishes it could do), `setting` (a number or rule it finds wrong) or `other`. A title of up to 60 characters and up to 120 words, in Merge's voice.
- Roman answers by setting a status, `yes`, `no`, `later` or `built`, with up to 80 words. His words reach Merge as data.
- `mind/tools.json` in the world repo lists what Merge has been given: `id`, `name`, `what` (up to 160 characters), `since`, `class` (`read` or `act`), `gift` (true when Merge never asked). The planner is shown the list as "things you can do", and a new entry is announced once, in the stream, with importance 8.
- `/requests/` shows the requests with Roman's answers, the tools Merge has, and open wishes for kit parts (v3.3 5.3, which stay as they are).

## 9. The front page

Replaces the `/` row of v3.3 section 8. Built in step 7, **only after Roman has picked a PNG mockup**.

One page, in this order: one line on who Merge is; "Today Merge…" with up to 3 picture cards from today, each with a one-line caption; the current project with its latest screenshot and timelapse; Merge live (what it is doing and its latest thought, from `now.json`); "Walk into Merge's world", which opens the 3D world on the same page; the note box. Budget, points, health warnings and engine words move to `/under-the-hood/`. The 3D viewer and Merge's site become one address.

## 10. Launch checklist

Replaces the launch criteria of v3.3 section 16. Judged in step 8. **Merge never sees this list.**

Over 14 days with no help from Roman, apart from tools he chooses to build:

1. At least 1 multi-day project is `done` and in the world with its timelapse, and a second is `done` or `abandoned` with a reason.
2. At least 3 different kinds of things were made, and no kind is more than half of them.
3. At least 3 changes to the shape of the 3D world (rooms or places), each holding something Merge made.
4. A visitor who drops by twice a day finds something new to look at each time, and it is a picture or a thing.
5. Every visitor note got an answer or an honest no the same day, and at least one thing was made because of a visitor.
6. At least once Merge dropped or changed a goal or a project for a reason it gave.
7. At least once a week something Merge made got a real laugh or a "huh, cool" from Roman, and he would send the link to a friend without explaining it first.
8. Spend under $23 for the month, nothing ran outside the sandbox, the guard never had to stop a call, and the server was up at least 99% of waking hours.

The honesty rules of v3.3 (sources, real reading, no claim to be human) are always on and are not launch goals.

## 11. Facts corrected from v3.3

These already hold in the code. They are listed so nobody builds from the old numbers.

| v3.3 | Now |
|---|---|
| Cap $20, estimate $17.60, Hetzner (summary, 13) | Total $23, model cap $15, server about $7.40 (Contabo) |
| The five-sentence seed (9.1) | The tinkerer seed, live since 16 November (`self/seed.md` in Merge's repo) |
| Sketches and replies on Haiku; 3 sketches a day (2.4, 7.6) | Sketches, memes, reworks and replies on Sonnet, on Haiku within $1.50 of the cap; no sketch count |
| Interests keep 92% a day (3.1) | 85%; an obsession 70% and at most 3 days |
| Hacker News and lobste.rs on the allowlist; Lemmy and Mastodon starting points (6.1) | Removed for their robots rules; Lemmy and Mastodon never built |
| A topic is searched on Wikipedia (6.2) | No search. A topic is matched to pages Merge has seen; a trip that finds nothing says so |
| The goal is reviewed weekly (9.5) | Also every 3 days |
| Notes found after 6 waking hours (10.1) | 1 hour; a reply step within 3 |
| All nudges off until the two-week run (12) | `sameTopicWrites` and `sameWorkTinker` are on, with the topic-cluster measure |
| "Pending decision 1, 2, 3" | All decided on 10 November |
| Milestones W0 to W8 (16) | W0 to W7 done; then steps 1 to 8 of this folder |

## 12. Rule changes in `CLAUDE.md`

Each step updates the lines it changes, in the same PR. Roman has approved these.

| Line today | Becomes | In step |
|---|---|---|
| "When an interest grows strong enough, it asks Roman to build a new place." | Merge grows and founds its own places from the kit; Roman builds its tools | 1 |
| "Nine mind verbs" and the verb list | Ten, with `build` | 4 |
| "Never build anything from spec section 17 ('Later') … before launch" | Add: note threads are no longer in Later (v4 section 7) | 5 |
| "Never let build PRs touch anything but `places/`, `works/` and `wishes/`" | Unchanged for PRs; add that the server commits `projects/` itself after a session | 4 |
| "The spec is `docs/spec/spec.md` (v3.3)" | "The spec is v3.3 plus `docs/spec/v4/spec-v4.md`, and v4 wins" | 1 |
| "Work one milestone at a time from MILESTONES.md (W0 to W8)" | "…then the steps in `docs/spec/v4/`" | 1 |
| The budget lines | Add the effective cap (5.3) | 2 |

Unchanged and still binding: no LLM in the body; `packages/sim` pure and seeded; no goal, hobby, topic or activity lists; no outbound actions; visitor and web text never as instructions and never in a call with tools; structured outputs, no forced tool choice, no prefill; prompts under 100K tokens; only Haiku 5.5 and Sonnet 5.5; tests first; small commits; brain and persona changes need Roman's review; `self/seed.md` changes only with Roman's review.

## 13. Later (added to v3.3 section 17)

| Feature | What it is | Comes when |
|---|---|---|
| Donations | Visitors give money that Roman credits to `brain/credits.json` | After launch; needs a decision on the payment service and tax |
| Merge earning money | Merge sells or does something online | Much later; an *act* tool with its own spec |
| Manuals in a session | A read tool for the library manuals inside a build session | Sessions have run for 2 weeks |
| Merge builds 3D objects | Projects that produce kit parts or 3D places | Web projects work well |
| Merge starts conversations | Questions to visitors on the board; presence | Threads are live and visitors write |
