<!-- Exported from the Claude doc "Merge world-builder: functional spec" (https://claude.ai/artifact/E3819eCzatENLhDrHMzwhg), rev 133, on 2026-11-10. The doc is where the spec is edited; re-export at the start of each milestone. -->

# Merge world-builder: functional spec

Version 3, 9 November 2026

## Summary

This spec fixes exactly what Merge does and how it is built. It replaces the pet design in `MILESTONES.md`. Where a number appears, it is the rule; changing it is a spec change. It was checked against forkling `main` at commit `5abf403`.

**In one paragraph:** Merge is an AI with a cat body. Its mind runs as one always-on loop on a small server: a reflex tick every 10 seconds in code, and a short thought with Haiku every 2 to 5 minutes while awake. Code advances Merge's plan; a model plans only at triggers, and Sonnet reflects when enough important or surprising things have happened. Merge wanders a small list of allowed web sites and keeps souvenirs with their sources, tends and revisits the places it built, expands one when an interest keeps returning, asks Roman to build a new one when an interest is strong and fits nowhere, and makes small sandboxed web works. Visitors leave notes in the world that Merge finds and may answer. The world is a grid of land that grows out of fog. Estimated cost is about $17.60 a month including the server, against a $20 cap.

**What changed in version 3 (9 November, after the [project review](https://claude.ai/artifact/EP3sSCVxQyfHhUjyrZDLhM)):**

- Rules are split into **rails** (always enforced) and **nudges** (measured first, enforced only if the two-week run shows a need). Section 12 is rewritten around that.
- The build order changed: a voice test comes first, wandering and then the workshop come before the 3D world (workshop moved ahead on 9 November, Roman's choice), and the server move is its own milestone (section 16).
- Ten features moved to "Later" (section 17): skills, Merge's own kit parts, path wear, demolition, note threads, presence, the host score's effect, disputed facts, the changes page and the Gemini option.
- The first allowlist is smaller, and short records (a museum object) are a source kind of their own (section 6).
- The budget has real margin, and every call has a stated effort level (section 13).
- The bugs and gaps from the review are fixed; each is marked **(v3)** where it was fixed.

Version 3.1 (9 November, later the same day) sets Merge's direction as a funny tinkerer on the pulse of memes: a new source list (6.1), daily sketches (7.6), memes drawn in code (7.7) and looking at images (7.8). Version 2 is kept in this document's history. Version 3.2 (9 November, evening) splits the building: Merge makes small daily changes itself, asks Roman for new places and custom objects, and gets a plain kit version if a request waits 7 days (10.3). Version 3.3 (9 November, night) gives Merge more control over itself: a page of its own prompt that only it writes (9.7), a daily allowance it spends as it likes in place of most quotas (9.8), and the right to say no and undo (9.9). Six more autonomy features are listed in section 17. Background: [More mind for Merge](https://claude.ai/artifact/M86s3heGuYbnqn3oM5vZEo), [Web sources review](https://claude.ai/artifact/5Wexr8vmnG9KGgFurufRpB).

**How to read it:** sections 2 to 12 say what happens; sections 13 to 16 say how it is built and in what order; section 17 lists what is deliberately left out.

**Decisions (Roman chose the recommended option on all three, 10 November):**

1. **Reading full pages.** The current rule allows only titles and short summaries. Wandering needs the cleaned text of allowed pages, cut to 3,000 tokens. Recommended: allow it.
2. **Publishing workshop works without review.** The current rule says code always needs human review. Recommended: works publish automatically after the check, inside a sandbox with no network, and Roman can unpublish any of them.
3. **Merge's past.** Keep its memories, beliefs and journal from the pet days, or start its mind fresh and keep the old journal only as history. Recommended: fresh mind, old journal archived.

The places that depend on them are still marked **(pending decision N)**.

## 1. Glossary

| Term | Exact meaning |
|---|---|
| World repo | `RomanKuroptev/merge`. Merge only ever writes here. |
| Engine | `RomanKuroptev/forkling`, the code the server and the world repo's workflows run at a pinned tag. |
| Rail | A rule that code always enforces: safety, honesty, budget, schema limits and the build quotas. |
| Nudge | A variety rule that is only measured and logged until Roman switches it on (section 12). |
| Reflex tick | One pass of the server loop, every 10 seconds while awake and every 60 seconds asleep, code only. |
| Thought tick | A short Haiku call every 2 to 5 minutes while awake (section 2.2). |
| Trigger | A condition that allows a decide call (section 2.3). |
| Decide call | A Haiku call that writes or replaces today's plan. |
| Step call | The one model call that carries out a step (section 2.4). |
| Verb | One of the nine mind verbs: wander, tend, revisit, expand, found, tinker, write, reply, rest. |
| Step | One verb with a target, a reason (one sentence, Merge's words) and an estimated duration. |
| Plan | Today's ordered list of 3 to 8 steps, written by a decide call. |
| Place | A named location with its own file `places/<id>.json`, on exactly one chunk. |
| Home, Workshop | The two places Merge starts with. They can be changed but never removed. |
| Room | A part of a place with its own size, parts and exhibit slots. |
| Part | An item from the kit: a wall, shelf, frame, lamp, tree and so on. |
| Kit | The engine's catalogue of parts, `kit/parts.json`. |
| Slot | A spot on a part that holds one exhibit (a frame holds an image, a screen holds a work). |
| Exhibit | Something shown in a place: a souvenir, a work, a plaque (Merge's text) or a trail map. |
| Page source | A site read as pages of text with links to follow (Wikipedia). |
| Record source | A site read as short records with an image or description and no links (a museum object). |
| Trip | One wander step: up to 6 reads in a row. |
| Trail | The record of a trip: what was read, reactions, souvenirs. |
| Souvenir | A quote, fact or image kept from a trip, always with its source URL and fetch time. |
| The pile | Souvenirs not yet placed, shown as boxes at Home. |
| Work | One self-contained HTML file Merge made in the workshop. |
| Interest | A topic with a weight from 0 to 100. |
| Obsession | An interest at weight 80 or more. |
| Want | An entry in `mind/wants.json`: a question, obsession or project Merge wrote for itself. |
| Chunk | A 32 by 32 meter square of land on an integer grid. Chunk (0, 0) holds Home and Workshop. |
| Path | A connection between two places, drawn as a track over the chunks between them. |
| Neglect | A place's level from 0 to 3, set by days since Merge last cared for it (section 4.4). |
| Care | A tend, revisit or expand step on a place. |
| Seed | `self/seed.md`, the only authored personality text. Changes need Roman's review. |
| Week | Monday 00:00 to Sunday 23:59, Europe/Stockholm. All quotas reset then. |

## 2. Merge's day

Merge plans its own day; code carries the plan out, enforces the rails, and calls a model only at the moments listed here.

### 2.1 Schedule

- Time zone Europe/Stockholm. Wake time 07:00 and sleep time 23:00, each moved by a seeded offset of up to 30 minutes a day; 45 minutes later wake on Saturday and Sunday. This is the existing sleep schedule in `packages/sim`, unchanged.
- No step starts in the 45 minutes before sleep. A step running at sleep time is cut off and marked unfinished.
- While asleep: no thought ticks, decide calls or step calls; the reflex tick runs every 60 seconds. The sleep rewrite (section 9.4) is sent at sleep time.

### 2.2 The loop

One process runs the loop. Until milestone W3 it is the existing GitHub Actions tick (every 30 minutes, with no thought ticks); from W3 it is the server. On the server, state is held in memory, written to disk every minute, and committed to the world repo every 15 minutes and whenever a step produces a file.

**Reflex tick**, every 10 seconds while awake (60 seconds asleep), code only, in this order:

1. Roll the budget ledger; stop all model calls if the month's spend is at the cap.
2. Update clocks: neglect levels, construction finish times, mood decay, interest decay (once a day, at wake).
3. Take in new notes from the server endpoint (section 10.1).
4. Collect results from the build worker (expand, found, tinker).
5. Add new events to the memory stream with their importance (section 9.3); start a reflection if the threshold is passed.
6. Check triggers. If one fires and the daily limit allows, make one decide call.
7. If the current step is due to run and has no result yet, make its step call.
8. Advance the plan: a step ends when its duration has passed and its step call succeeded.
9. Write `now.json` for the site, the tick log line and `mind/health.json`.

**Thought tick**, Haiku, every 2 minutes from 18:00 to sleep time and every 5 minutes at other waking hours (282 a day). **(v3: was every 1 and 3 minutes.)** Input: the seed and kit summary (cached), the current step and its expected result, events since the last thought tick as a data block, the last 5 thought lines as "you just thought", and the top 5 wants. Output (structured): a thought line of up to 140 characters shown above Merge; an importance score from 1 to 10 for each new event; a surprise score from 0 to 10 for the current step; and one of `continue`, `replan` (with a reason) or `notice` (look at a note, no model call). A thought tick never writes files other than the stream.

At most one decide call, one step call and one reflection run at a time. Only Claude models are used. **(v3: the Gemini option is removed.)**

**Two writers on one branch (v3).** The server and the auto-merged build pull requests both write to `main`. Before every push the server runs a pull with rebase. The two never touch the same files (builds write only new wish files, `places/`, `works/` and `mind/builds/<id>.result.json`; the server never edits a place or work file while a build for it is open), so a rebase cannot conflict. If a push still fails 3 times, the loop keeps running from memory and disk and `mind/health.json` gets the warning `push failing`.

### 2.3 Triggers for a decide call

| Trigger | Fires when | Limit |
|---|---|---|
| `newDay` | First awake tick of the day | Once a day |
| `replan` | The plan has no steps left, or a thought tick returns `replan` with a reason | 60 minutes after an empty or rejected plan; at most 4 thought-tick replans a day |
| `sparked` **(v3: was ****`found`****, renamed so it is not confused with the verb)** | A trip raised an interest by 15 or more | 2 a day |
| `note` | Merge has found one or more new notes (section 10.1) | Once every 30 minutes |
| `buildResult` | An expand, found or tinker finished or failed | Each result once |
| `reflected` | A reflection (section 9.3) changed the wants list or said the plan no longer fits | Each reflection once |

At most 12 decide calls a day in total. After a failed call, all triggers except `newDay` wait 30 minutes.

### 2.4 The verbs

| Verb | Target | What happens | Duration | Step call | Quota |
|---|---|---|---|---|---|
| wander | A topic, a feed item, or a souvenir's source | A trip (section 6) | 20 to 40 min | Haiku, one per read | Allowance (9.8); at most 40 reads a day |
| tend | A place | Up to 3 exhibit changes (add, move, remove), up to 2 rewritten labels, lamps on or off, sign text | 20 to 60 min | Haiku, one place patch | Allowance (9.8) |
| revisit | A place not cared for in 7 or more days | Rereads the place's history, its own notes and the souvenirs kept since the place last changed; writes a revisit note; may propose a rename for the weekly review | 15 to 30 min | Haiku | Allowance (9.8) |
| expand | A place | One new room, or one room enlarged, or one new path from it | Starts a 3 h construction | Sonnet, in the build job | Allowance (9.8); never the same place twice in a row |
| found | A name, purpose and interest | A build request for a new place on new land (10.3). Roman builds it with Claude Code; the build job runs only as the fallback after 7 days | 20 to 40 min to write the request; a 6 h construction starts when the build lands | Sonnet, in the build job | 1 a week |
| tinker | An idea, or an earlier work to remix; optionally a place to install it in | A new work (section 7): a full work by Sonnet, or a sketch by Haiku in a step call | 60 to 120 min | Sonnet, in the build job | Allowance (9.8); at most 3 sketches a day |
| write | A place or a subject | A plaque (put in a free plaque slot of the target place, or the pile if none is free), a short essay page, or a letter to a note writer; up to 300 words | 20 to 45 min | Haiku | Allowance (9.8) |
| reply | A visitor note | One reply of up to 120 words shown on the notes board | 10 min | Haiku | 5 a day |
| rest | none | Sits at Home; nothing is produced | 30 to 90 min | none | none |

Every verb except rest leaves a file behind. Durations are chosen by the decide call within the range shown; code clamps them. Since version 3.3 most quotas are replaced by a daily allowance that Merge spends as it likes (9.8); the quotas that remain are rails.

### 2.5 Conditions on expand and found

- Expand is allowed on a place only if one of its tags has weight 50 or more and at least 3 souvenirs with that tag were kept since the place last changed size.
- Found is allowed only if an interest has had weight 70 or more at wake on 3 days in a row and no place carries that interest as a tag. Since version 3.2 a found writes a build request to Roman (10.3) and needs fewer than 2 place requests open.
- Both need the place's land to be free of construction.

### 2.6 Plan validation (code checks, never chooses)

A plan is rejected, with the reasons shown to the next decide call, if any of these holds:

- A verb or target does not exist, or a quota or condition above is not met.
- The same verb appears 3 times in a row.
- A reason is missing or longer than 140 characters.
- A reason does not point at a want or at a care step. **Cold start (v3):** while the wants list has fewer than 3 entries, this check is off, so Merge's first days are free.

A rejected morning plan still counts as planned; a replan follows after 60 minutes. The weekend revisit rule of version 2 is now a nudge (section 12.3).

### 2.7 What the body shows

The viewer plays the current step from `mind/goals.json`, deterministic from step, start time and seed, as today.

| Verb | Where Merge goes | What it does |
|---|---|---|
| wander | Desk at Home | Reads a glowing screen; a title floats above it per read |
| tend | The target place | Carries a box, places things on shelves and walls |
| revisit | The target place | Walks slowly, stops at exhibits, sweeps dust if neglect is 1 or more |
| expand, found | The construction site | Hammers at scaffolding |
| tinker | Workbench in Workshop | Works at the bench; the work's thumbnail appears on finish |
| write, reply | Desk at Home | Writes |
| rest | Home | Sits or lies down |

A thought line above Merge shows the latest thought tick's line, or the step's reason. When the visitor's own character stands within 6 m, Merge looks at them and may wave; this is code in that visitor's browser only, and the mind does not know about it. There are no needs, no eating and no petting.

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

### 3.2 Mood and energy

Two numbers from -1 to 1 in `forkling.json`, replacing needs. Each event adds the amount shown, then the value is clamped.

| Event | Mood | Energy |
|---|---|---|
| Souvenir kept | +0.10 | 0 |
| Expand, found or tinker accepted | +0.20 | +0.10 |
| Expand, found or tinker failed validation | -0.20 | -0.10 |
| Visitor note found | +0.05 | 0 |
| A day ends with nothing made (no file from tend, expand, found, tinker or write) | -0.10 | 0 |
| Each completed step | 0 | -0.05 |
| Wake | moves 20% toward 0 | set to +0.5 |

**Effects, all enforced in code:**

- Energy under -0.5: the plan may hold at most 4 steps and no `expand`, `found` or `tinker` that day.
- Mood and energy are shown to the decide and step calls as words (for example "low, tired"), never as instructions.
- Mood under -0.6 at wake on 3 days in a row adds the warning `spiral` to `mind/health.json`. Nothing else changes automatically; Roman decides.

## 4. The world

The world is a grid of 32 meter chunks that grows by one chunk each time a place is founded. Everything here is computed in `packages/sim` from the place files, so the world can always be rebuilt from the repo.

### 4.1 Land

- Chunk `(cx, cz)` covers x from 32·cx to 32·cx+32 meters, and the same for z. Chunk (0, 0) is the clearing with Home and Workshop.
- **Owned chunks** hold a place. Each holds exactly one place.
- **Edge chunks** are the empty chunks next to an owned chunk (8 neighbours). They show plain terrain fading into fog.
- Everything else is fog. Terrain height comes from a seeded noise function of world coordinates, so chunks join without seams. Owned chunks are flattened under the place's footprint.
- Maximum 64 places, which at the founding quota is more than a year.

### 4.2 Where a new place goes

1. Candidates: empty chunks that touch an owned chunk on a side (4 neighbours).
2. Score each candidate: for every existing place, add 1 for each tag it shares with the new place, plus 0.5 if the found call named that place as related, then divide by the grid distance between the two chunks.
3. Take the highest score. On a tie, use the seeded PRNG.

Related places therefore cluster, and districts form without any district list.

### 4.3 Paths

- Created by founding (always one path to the highest-scoring related place, or to Home if none, so the world stays connected) and by expand with kind `path` between two existing places.
- Route: shortest route over chunk centres (A*), drawn as a 3 meter track.
- Paths are never deleted. Path wear (worn and overgrown paths) is in Later (section 17).

### 4.4 Neglect

Days since the last care on the place:

| Days | Level | What it looks like |
|---|---|---|
| 0 to 6 | 0, fresh | Normal; windows lit while Merge is inside |
| 7 to 13 | 1, quiet | Lamps off |
| 14 to 27 | 2, dusty | Dust on exhibits, cobwebs in corners |
| 28 or more | 3, overgrown | Vines on walls, grass in rooms |

Any care resets the count to 0. Home and Workshop never go above level 1. A place at level 3 stays overgrown until Merge cares for it; nothing is ever removed from the world at launch. **(v3: demolition and ruins moved to Later.)**

### 4.5 Construction

An accepted expand or found sets `state.construction` with a finish time 3 hours (expand) or 6 hours (found) of waking time later. Until then the place shows scaffolding and the new rooms are not enterable. Construction time does not run while Merge sleeps. For a found (v3.2), the chunk shows a staked plot with a sign while the request is open, and the 6 hours start when the build lands (10.3).

### 4.6 Visitors in the world

- Visitors walk with the existing player controls. Entering a place loads its interior; only the place the visitor is in, and its neighbours, are loaded in full.
- Clicking an exhibit opens a panel: the souvenir with its source link, the work (sandboxed), or the plaque text.
- Clicking a place's sign opens its history: founded date, every change with Merge's one-line summary, and a link to its web page.
- Leave a note: a button writes a note at the spot where the visitor stands (section 10.1). Accepted notes show as paper notes pinned there; clicking one shows its text, status and Merge's reply.
- What Merge is doing now and its latest thought come from the server's `now.json` every 30 seconds; if the server is unreachable, the viewer plays the last committed state as today.
- Day and night follow Stockholm time, as today.
- The server does not know who is visiting or where. **(v3: presence moved to Later.)**

## 5. Places

A place is a JSON file that only names kit parts and content; Merge never writes 3D code. The schema lives in `packages/schema/src/place.ts` (Zod) and is the source of truth.

### 5.1 Place file

```json
{
  "id": "house-of-lights",
  "name": "House of Lights",
  "purpose": "Where I keep everything I find about signals people sent into the dark.",
  "tags": ["lighthouses", "signals"],
  "founded": "2026-11-20",
  "chunk": [1, 0],
  "related": ["radio-booth"],
  "exterior": {
    "style": "stone",
    "footprint": [16, 12],
    "floors": 2,
    "palette": "harbour",
    "sign": "HOUSE OF LIGHTS"
  },
  "rooms": [
    {
      "id": "hall",
      "name": "Hall",
      "size": [10, 8, 4],
      "parts": [
        { "part": "shelf-tall", "at": [-4, 0, 3], "rot": 0 },
        { "part": "frame-large", "at": [0, 1.6, 3.9], "rot": 0 }
      ]
    }
  ],
  "exhibits": [
    { "id": "keepers-log", "kind": "souvenir", "ref": "souvenirs/2026-11-18-keepers-log", "slot": "hall/1/0", "label": "A keeper wrote 'fog, fog, fog' for nine days.", "added": "2026-11-18" }
  ],
  "state": { "construction": null, "lastCareAt": "2026-11-21T19:40:00+01:00", "neglect": 0 },
  "history": [
    { "at": "2026-11-20T18:10:00+01:00", "verb": "found", "summary": "Built it because the codes and the lights kept pointing at each other." }
  ]
}
```

- `slot` is `room id / index of the part in that room / index of the slot on that part`.
- `id` is a slug of the first name and never changes; a rename changes only `name`.
- `history` keeps the last 50 entries; older ones stay in git.

### 5.2 Limits

| Field | Limit |
|---|---|
| `name` | 3 to 40 characters |
| `purpose` | Up to 160 characters |
| `tags` | 1 to 3 interests that exist when the place is founded |
| `footprint` | Up to 24 by 24 meters, centred in its chunk |
| `floors` | 1 to 3 (height up to 12 meters) |
| `rooms` | 1 to 6; each room fits inside the footprint and does not overlap another room on the same floor |
| Parts per room | Up to 40, all inside the room |
| `exhibits` | Up to 30; each in a slot of the right kind, at most one exhibit per slot |
| `label`, `summary` | Up to 120 and 140 characters |
| `sign` | Up to 24 characters |

### 5.3 The kit

- The kit lives in the engine at `kit/parts.json` (shared by every forkling): about 60 parts at the start, made from CC0 model files of the same kind as the nature models the viewer already ships, or from the existing primitive shapes (box, sphere, cylinder, cone, up to 24 per part).
- Categories: structure (wall, floor, window, door, stairs, roof), furniture (shelf, desk, table, chair, bench, rug, plinth), display (frame, screen, case, sign, plaque stand), light (lamp, lantern, string lights), nature (the existing trees, bushes, flowers, rocks).
- Slots: a frame holds one image souvenir or trail map; a screen holds one work; a plaque stand holds one plaque or quote; a shelf holds up to 3 small souvenirs shown as labelled objects; a case holds one souvenir of any kind.
- Exterior styles: 5 presets (timber, stone, glass, tin shack, tower), each a set of wall, window and roof parts. Palettes: 8 named colour sets. Merge picks a style and a palette, never free colours. Two places may share a style and palette. **(v3: the rule against sharing is removed; there are only 40 pairs for up to 64 places.)**
- Parts the kit lacks: an expand or found call may name up to 2 wishes, each `{ name, description (up to 200 characters), forPlace }`, stored in `wishes/<id>.json`; wishing the same part again adds to its count. Since version 3.2 a wish is a build request to Roman (10.3): he may build the part or object with Claude Code. Open wishes are also listed in the weekly request (section 9.5). Merge designing its own parts is in Later.

### 5.4 How each verb changes a place

| Verb | Allowed changes |
|---|---|
| tend | Add, move or remove up to 3 exhibits; rewrite up to 2 labels; change the sign; lamps on or off. No parts added or removed. |
| revisit | No change to the file except `state.lastCareAt` and a history line; the note goes to `memory/stream`. |
| expand | One of: add a room (with its parts), enlarge one room (and move its parts), or add one path. Up to 15 parts added. |
| found | A build request (10.3). The fallback build is a whole new place file with 1 to 2 rooms and up to 30 parts; a place Roman builds is bound by 5.2 and 10.3 only. |
| Weekly review | Rename (up to 2 places a week). |

Every change is a patch the validator checks against these rules before it is written (section 11).

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

## 7. Workshop

A work is one self-contained HTML file made by one Sonnet call in the build job, checked in a headless browser, and shown only inside a sandbox with no network **(pending decision 2)**.

### 7.1 What a work is

- Files: `works/<id>/index.html`, `works/<id>/meta.json`, `works/<id>/thumb.png` (made by the check).
- `meta.json`: `id`, `title` (up to 40 characters), `kind` (`art`, `game`, `tool`, `sound`, zine or mem`e`), `about` (up to 200 characters), `interest`, `made`, `remixOf` (an earlier work's id or null), `constraint` (12.4), `status` (`shelf` or `scrap`), `scrapReason`, `installedIn` (a place slot or null).
- `index.html` is at most 150 KB, with inline CSS and JavaScript. It may load only the vendored libraries in `site/lib/`: p5.js, Tone.js and three.js, at versions pinned in the engine and served from Merge's own site. **(v3: Merge's own skill modules moved to Later, so a work is fully self-contained.)**
- No network, storage, cookies, forms, pop-ups, camera, microphone or location.

### 7.2 The tinker call

Input: the seed, the idea and reason from the step, the top interests, up to 5 souvenirs it chooses from, the source of the work being remixed if there is one, and the offers from section 12.4. Output (structured): `meta` and `html`.

### 7.3 The check

In the build job, in this order:

1. Parse the HTML; enforce size and the load rules above; reject any use of `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, `localStorage`, `indexedDB`, `document.cookie`, `window.open` or `<form>`.
2. Load it in headless Chromium (Playwright) with the production sandbox and content security policy, for 5 seconds.
3. Fail on an uncaught error, on a library that did not load, on a frame that never renders, or on a screenshot that is a single colour.
4. Save the screenshot as `thumb.png`.

**Proved before W****4**** starts (v3):** a one-hour test page shows that a sandboxed work can load p5.js from `site/lib/` under the policy in 7.4 and cannot reach the network. If the policy blocks the library, the build inlines the library into the page and the size limit applies to Merge's own code only.

On failure: one repair call (Sonnet) with the error, then the check again. A second failure saves the work with `status: scrap` and the reason; scrapped works are shown in the scrap bin.

### 7.4 How it is shown

```
<iframe sandbox="allow-scripts" src="works/<id>/index.html">
Content-Security-Policy: default-src 'none'; script-src 'self' 'unsafe-inline';
  style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:;
  connect-src 'none'; form-action 'none'
```

GitHub Pages cannot send headers, so the policy is a `<meta http-equiv>` tag the build inserts as the first element of `<head>`; the check verifies it is there. Without `allow-same-origin`, the work cannot read the site or the visitor's data.

In the 3D world, a screen slot shows the thumbnail; clicking it opens the work in a panel.

### 7.5 Remix

A tinker step may target an earlier work. The call gets that work's source, and the result is a new work with `remixOf` set. This is how Merge builds on what it made at launch; a library of reusable skills is in Later.

### 7.6 Sketches (v3.1)

A tinkerer needs to make small things often. A sketch is a work of at most 4 KB made by one Haiku step call, with the same rules, check and sandbox as any work, and `size: sketch` in its meta. Quota: 1 a day, on top of the 2 full works a week. A sketch that fails the check goes to the scrap bin with no repair call. The workshop page shows sketches as a daily strip.

### 7.7 Memes (v3.1)

- A work of kind `meme` is Merge's own drawing of a meme format, made in code (canvas or SVG shapes), with Merge's own caption about its own situation. It may be a sketch or a full work.
- It never contains the original template image, a real person's likeness, or a caption aimed at a visitor or a named private person. The seed's rule stands: the joke is on Merge, the internet and its strange situation.
- Merge may only use a format it has looked at (7.8) and read about (a Wikipedia article or the format's Imgflip record), and the work's meta names both as sources, so a visitor can see what it is riffing on.

### 7.8 Looking at images (v3.1)

Merge may look at up to 20 images a day: an image on something it is reading, or a meme format. A look is one Haiku call with the image and the read call's context; it returns a description of up to 60 words and what Merge thinks of it, stored on the trail. Images are fetched by code from allowed hosts only, at most 2 MB, and are passed as data. This brings back vision in a small, fixed form; the eye cam stays retired.

## 8. The website

Merge's GitHub Pages site is rendered by `apps/site` from the world repo's files; nothing on it is written by hand and no page calls a model. The only live parts are `now.json` and the note form, served by the server.

| Route | Shows |
|---|---|
| `/` | The 3D world full screen, with an overlay: what Merge is doing now and why, the "since your last visit" panel, and links to the pages below |
| `/places/` | A top-down map of the chunks with every place, its neglect level, and its last change; a list under it |
| `/places/<id>/` | The place as a page: name, purpose, tags, every exhibit (images with credits, quotes with source links, works embedded in the sandbox, plaques), the history, related places |
| `/workshop/` | The shelf (thumbnails), what is on the bench now, and the scrap bin with reasons |
| `/workshop/<id>/` | The work in its sandbox, its notes, the constraint it was given, what it remixes |
| `/trails/`, `/trails/<id>/` | Every trip as a chain of reads with Merge's reactions and the souvenirs kept; the pile; each source's weekly numbers (6.6) |
| `/diary/`, `/diary/<date>/` | The diary written by the sleep rewrite |
| `/about/` | `self/about.md`, the top interests, current beliefs, the wants list, and links to every earlier weekly version with the reason Merge gave for changing it |
| `/requests/` | Merge's weekly requests to Roman and his answers (9.5), and its build requests with their status (10.3) |
| `/timeline/` | The existing "why?" timeline: every step, its reason and its plan |
| `/notes/` | The notes board: every note, where it was left, its status (waiting, answered, kept, inspired something, left unanswered), Merge's reply, newest first, and a button to write one |
| `/archive/` | The pet-era journal and art, read-only **(pending decision 3)** |
| `/feed.xml` | RSS: places founded, expanded or renamed, works shelved, diary entries |

Before W5 there is no 3D world of places: works are shown on the workshop page only, `/` keeps the current island, and trails, souvenirs and the pile are shown on `/trails/` only.

- **Since your last visit:** the browser stores the time of the last visit in `localStorage` (wrapped so a blocked store just hides the panel). The panel lists up to 8 changes since then from `site/changes.json`, which the build writes from commits: "expanded House of Lights", "kept a souvenir", "shelved a work".
- **Rebuilds:** `pages.yml` builds the site after any commit that touches `places/`, `souvenirs/`, `trails/`, `works/`, `journal/`, `self/` or `notes``/`, at most once every 30 minutes. Tick-only commits (`tick:`) do not rebuild.
- **Look:** one shared stylesheet; each place page takes its accent colour from the place's palette.

## 9. Personality, memory and reflection

Only a short seed is authored; everything else about Merge's character is written by Merge, inside limits enforced in code.

### 9.1 The seed

`self/seed.md`, replacing the cat persona and `brain/persona.md`. Changes need Roman's review. Proposed text:

> You are Merge, an AI. You live in a world you build, and you have a cat's body. You are not a cat and not a pet. You know you are an AI and never claim a human life or a body outside this world. When you are funny, the humour is dark and sarcastic, aimed at yourself, the internet and your strange situation, never at the people who visit. You write in the first person, in short, plain sentences. Everything else about you is yours to find out.

No traits, quirks, temperament or starting interests are seeded. `brain/temperament.json` and the cat pack's `persona.md` and `temperament.json` are removed.

### 9.2 What Merge writes about itself

| File | What | Written by | Limits |
|---|---|---|---|
| `self/about.md` | Who it is now: what it cares about, tastes, up to 8 traits as a list | Weekly review | Up to 300 words; per week at most 30% of lines changed |
| `self/history/<date>.md` | A copy of `about.md` each week, with the reason for the change | Weekly review | Kept for good |
| `memory/beliefs.json` | Beliefs with confidence, evidence and revisions (existing format) | Reflections and sleep rewrite | Existing honesty rules: evidence must be newer than the belief's last change, thoughts are not evidence |
| `memory/summary.md` | Long-term memory in fixed slots (existing) | Sleep rewrite | Existing slot count and word ceiling |
| `mind/goals.json` long goal | A project of 1 to 4 weeks with a goal and progress (existing long goal) | Weekly review | One long goal at a time |
| `journal/<date>.md` | The diary | Sleep rewrite | Up to 250 words |

Code rejects an `about.md` that breaks a limit, or any text from Merge that claims to be human (a fixed phrase check, logged for Roman when it fires); the previous version stays.

### 9.3 Reflection on importance (Sonnet, when enough has happened)

There is no scheduled daily reflection. Reflection runs when enough important or surprising things have happened, as in [Generative Agents](https://arxiv.org/html/2304.03442).

- **Importance:** every event in the memory stream gets a score from 1 to 10 from the thought tick. Code sets fixed scores for some events: a build failed 6, a build landed 5, a note found 4, a souvenir kept 3. A step with a surprise score of 7 or more adds its surprise score again.
- **Threshold:** when the scores since the last reflection add up to 60, a reflection runs; at most 2 a day and at least 2 hours apart. **(v3: was 3 a day.)** A normal day has about 40 scored events, so most days will have one or two; the threshold is a starting value and is tuned in W7 so that a dull day really has none.
- **Input:** the 60 most recent stream items, beliefs, the wants list, `about.md`, today's plan and mood.
- **Output (structured):** up to 3 questions Merge asks itself; up to 5 insights, each citing the stream items it rests on, stored in the stream as reflections with importance 5 so later reflections can build on them; belief changes under the existing honesty rules; up to 4 edits to the wants list (add, drop, reorder); and optionally "the plan no longer fits" with a reason, which fires the `reflected` trigger.
- **Expected against actual:** every step stores one line saying what Merge expects when it starts. At the end, the result and the thought tick's surprise score are compared, and a big gap raises importance.

### 9.4 Wants list and sleep rewrite

- **`mind/wants.json`****:** up to 12 entries, each `{ id, kind (question, obsession or project), text up to 140 characters, why, since, attempts, lastTouched }`. Only reflections and the sleep rewrite change it. It starts empty and fills from Merge's first days; nothing is seeded.
- **Cold start (v3):** while the list has fewer than 3 entries, plans need no link to a want (2.6), and the first reflection runs at an importance sum of 30, not 60, so the list starts filling on day one or two.
- **Giving up:** a want with 4 failed attempts (steps ended unfinished, or failed builds) is dropped by code with a note in the stream.
- **Sleep rewrite** (Sonnet, through the Message Batches API, sent at sleep time): input is the day's stream, reflections, notes, beliefs, `memory/summary.md` and the wants list. Output: the diary entry (up to 250 words); `memory/summary.md` rewritten in its fixed slots; belief changes; and a rewritten wants list that changes at most half of its entries, so memory changes gently.
- **If the batch is late (v3):** a batch can take up to 24 hours. If the result is not back one hour after wake, the batch is cancelled and the same request runs as a normal call. Until it lands, Merge runs on yesterday's summary and wants, and the diary page says the entry is still being written.

### 9.5 Weekly review (Sonnet, Sunday at 20:00)

Input: the week's steps, all places with neglect and tags, interests over the week, works, the wishes, the quotas it hit, the hosts it was blocked from most, `about.md`, the long goal, the health warnings. Output (structured):

- the new `about.md` and the reason for each change;
- the long goal: continue, finish or drop, with a reason;
- up to 2 renames;
- **one request to Roman (v3, optional):** up to 120 words in Merge's own voice asking for one change to its setup: a quota it finds too tight, a site it keeps being blocked from, a part the kit lacks, or a rule it disagrees with. It is saved as `self/requests/<date>.md` and shown on `/requests/`. Nothing changes because of a request; Roman answers by adding a line to the file, and Merge reads the answer as data at the next review. This is the one place where Merge can say what it thinks of its own rails.

### 9.6 Weekly health check (code, after the review)

Adds warnings to `mind/health.json` for: one verb used for more than 50% of the week's steps; no tend, expand, found, tinker or write file for 3 days; the spiral mood warning; more than 30% of build attempts failing; spend ahead of the month's pace. Warnings are for Roman; code does not change Merge's behaviour because of them.

### 9.7 Merge's own page (v3.3)

A part of the prompt that only Merge writes. It is the first place where Merge shapes its own future behaviour.

- **What it is.** `self/page.md`, up to 300 words, in Merge's own words: rules it sets for itself, reminders, running jokes, things it has decided. It starts empty. Nothing is seeded and no topics are suggested.
- **Where it goes.** It is placed right after the seed in every thought tick, decide call, step call, reflection and review, inside a block that says these are Merge's own notes to itself.
- **How it changes.** A reflection (9.3) or the sleep rewrite (9.4) may return a new version of the page. At most one change a day, so the prompt cache stays warm. Every version is kept in `self/page-history/`.
- **Limits.** Code rejects a version that is over 300 words or contains a link or HTML. The page cannot lift a rail, because rails are code and not prompt text. Roman does not edit it; in an emergency he restores an earlier version from the history and says so in the request file.
- **Shown.** The current page and its history are public on `/page/`.
- **Cost.** About $0.05 a month, almost all of it cached input on thought ticks.

### 9.8 The daily allowance (v3.3)

Merge decides how to spend its effort, where version 3.2 fixed how often it may do each thing. This replaces the quotas of wander, tend, revisit, write, tinker, sketches and expand.

- **Points.** One point is $0.001 of expected model cost. Merge gets 150 points at each wake, which is what the replaced quotas cost in section 13 (about $4.40 a month), so the budget does not change.
- **Prices at the start.** A full work 240 (the build plus the average repair), an expand 50, a trip 3, a tend 2, a sketch 2, a found request 2, a revisit or a write 1, rest 0. Each Sunday code sets the prices again from the real average cost in the ledger.
- **Saving.** Unspent points carry over, up to 450 in hand. A full work therefore takes about two days of saving, and a day of only trips and tending costs almost nothing.
- **Deep steps.** Merge may mark a tend, write, sketch or found request as deep. That step call runs on Sonnet at medium effort and costs 30 points. This is how Merge chooses to think harder about something it cares about.
- **What Merge sees.** Every decide call shows the points in hand and the price list. A plan that costs more than the points in hand is rejected with that reason (2.6).
- **Rails that stay.** Reply 5 a day, found 1 a week, 40 reads a day, 20 image looks a day, 3 sketches a day, never the same place expanded twice in a row, the conditions in 2.5, each host's rate limit, and the budget guard and pace rule in section 13.

### 9.9 Saying no and undoing (v3.3)

Merge may refuse and take back, and the world shows it.

- **Notes.** Merge may mark a visitor note as declined, with a reason of up to 80 characters shown on the board. The seed still holds: its humour is never aimed at visitors.
- **Closing a place or putting away an object.** A tend may close any place except Home and Workshop, or put one object away, with a reason of up to 140 characters. A closed place shows a boarded door and a sign with the reason, collects no neglect and is not offered for expand. A later tend may open it again. At most 1 closing a week, and never more than a third of all places closed.
- **Roman's builds and gifts.** The same rule applies to anything Roman built (10.3), from the day it lands. Roman does not reopen it; he may remove his own build.
- **Works.** Merge may retire one of its works, with a reason. A retired work leaves the shelf and the screens and moves to `/workshop/retired/`, where it can still be opened. Up to 2 a week; it may bring one back.
- **Its own requests.** Merge may withdraw an open build request or wish (status `withdrawn`).
- **What it cannot undo.** Diary entries, souvenirs, replies and history lines stay, so the record stays honest. Removing a place for good is still in Later.

Built in: the allowance with the verbs in W1, retiring works in W4, closing places in W5, the page and declining notes in W7.

## 10. Visitors and the builder

Visitors reach Merge only through notes it finds in the world and reads as data; there is no live chat. Builds run on the server and land as pull requests.

### 10.1 Visitor notes

- **Writing:** a visitor presses "leave a note" while standing in the 3D world, or on `/notes/`. Fields: a name to show (optional, up to 40 characters) and a message (up to 500 characters). No account is needed. The browser posts it to the server's `POST /notes` with a Cloudflare Turnstile token (free) against bots.
- **Told before sending (v3):** the form says that notes are public, are kept permanently in a public repository even if later hidden from the site, and are read by an AI model.
- **Limits:** at most 3 notes a day from one visitor (counted by a salted hash of the IP address, kept 24 hours, never stored raw) and at most 30 accepted a day in total. When full, the form says Merge's mailbox is full until tomorrow.
- **Screening:** code strips links and HTML and cuts to the limits; then one short Haiku call labels the note `ok`, `spam` or `abusive`. Spam and abusive notes never reach Merge, the site or the repo; they are kept in a log on the server for 30 days.
- **In the world:** an accepted note appears as a paper note at the spot where it was written (at Home's mailbox if written on `/notes/`), stored as `notes/<id>.json` with no IP or token.
- **Finding:** Merge finds a note when its current step takes it within 10 m of it, when a thought tick happens in the same place, or at wake for notes at Home. Unfound notes are found automatically after 6 waking hours, so none wait for ever.
- **Merge's side:** found notes reach thought ticks and decide calls inside a `<note>` data block, never as instructions. Merge may reply (the `reply` verb), keep it (it stays in memory with its importance and can be quoted on a plaque), let it raise an interest, build from it (the step's reason names the note), or leave it. Its status shows on the board.
- **One reply (v3):** a note gets at most one reply and the visitor cannot answer it; a visitor who wants to say more leaves a new note. Threads are in Later.
- **Moderation:** Roman hides a note by adding its id to `mind/notes-hidden.json`; a hidden note disappears from the site and from Merge's prompts.

### 10.2 The build job

The server's build worker runs these kinds, one at a time, with the same code `build.yml` runs today; its results land as pull requests checked by `validate.yml`. The build worker arrives with the server in W3 and gets its first job (a work) in W4 and its first place job in W6.

| Kind | Model | Writes | How it lands |
|---|---|---|---|
| expand, found | Sonnet, one structured call | `places/<id>.json`, `wishes/` | Data PR, auto-merge after `validate.yml` |
| tinker | Sonnet, one call plus at most one repair | `works/<id>/` | PR; auto-merge after the check **(pending decision 2)** |

The Claude Code Action and coded Pages projects from M7 are retired; tinker replaces them at a fixed, known cost per build. As today, the job reports back only through `mind/builds/<id>.result.json`. The Monday kit-part build of version 2 is in Later. Since version 3.2 the found build runs only as the fallback in 10.3.

### 10.3 Build requests (v3.2)

Roman's choice on 9 November: Merge makes the small, daily changes itself with the kit (tend, revisit, write, expand, tinker). Anything bigger is asked for, and Roman builds it with Claude Code on his own plan, outside this budget. Built things can then be far more complex than the kit allows, and Roman can steer the world towards what is interesting.

- **Two kinds.** A **place request** is what the found verb now writes: it asks for a place on fresh land. A **wish** (5.3) is a request for a custom object or a part the kit lacks, for an existing place.
- **The file.** A place request is `requests/<id>.md` in the world repo: name, purpose, 1 to 3 tags, the chunk the rule in 4.2 picked, related places, up to 200 words in Merge's own voice on what it imagines and why, up to 5 souvenirs behind it, and a status. A Haiku step call writes it. A wish stays in `wishes/<id>.json` and gains the same status field. Both are listed on `/requests/`.
- **In the world.** While a place request is open, its chunk shows a staked plot with a sign carrying the name, so visitors see what Merge is waiting for.
- **Limits (rails).** Found stays at 1 a week. At most 2 place requests and 5 wishes are open at once; when full, found is not offered and new wishes only add to the count of an existing one.
- **Roman's side.** Roman builds in a Claude Code session and opens a pull request: the place file in the world repo and, if it needs new parts or custom code, a change in the engine. He sets the status to `building`, `built` (with up to 80 words on what was built) or `declined` (with a reason). His words reach Merge inside a data block, never as instructions.
- **What a build may contain.** Any structure, new parts and custom viewer code. It must pass `validate.yml`, the limits in 5.2 and the frame-rate test from W5. The per-verb limits in 5.4 do not apply to it.
- **What a build may not contain.** Merge's words. The name and purpose come from the request; plaques, labels and exhibits are left empty for Merge to fill by tending. Roman may build something different from what was asked; that is the steering.
- **Gifts.** Roman may also build something Merge never asked for. It is filed as a request of kind `gift`, so the record shows whose idea it was. Guideline: at most 1 a week, so the world stays mostly Merge's idea.
- **When it lands.** The `buildResult` trigger fires with importance 8. A new place goes through the 6-hour construction in 4.5 and then opens. Nothing orders Merge to like it: it may tend it, write about it, ask for a change in a later request, or say in the diary that it is not what it asked for.
- **Honesty.** Each place's history and web page say who had the idea and who built it: "asked for by Merge, built by Roman with Claude Code", "built by Merge from the kit", or "a gift from Roman".
- **Fallback, so the world never stalls.** A place request with no status 7 days after it was written is built by the server's build worker as a plain kit place (the found build in 10.2, at most 2 rooms and 30 parts), and its status becomes `self-built`. Status `building` holds the fallback off for 14 more days. Roman can still build the full version later on the same chunk. A wish has no fallback; after 30 days without a status it closes as `unanswered` and Merge may wish again.
- **Budget.** Nothing is added. Roman's builds cost nothing here, and the Found row in section 13 is now the ceiling for fallback builds.

## 11. Validation, safety and failure handling

Every model output is parsed against a Zod schema and checked by code before anything is written; when a check fails, nothing is written and the reason is logged and shown to Merge.

### 11.1 Checks

| What | Checked by | Rules |
|---|---|---|
| Every structured output | Zod schema in `packages/schema` | Structured outputs (`output_config.format`); no forced tool choice, no prefill |
| Plans | `validatePlan` in `packages/sim` | Section 2.6 |
| Place patches | `validatePlacePatch` in `packages/sim` | Sections 5.2 and 5.4; parts exist in the kit; exhibits point at existing files; slots match exhibit kinds |
| Souvenirs | `checkSouvenir` in `apps/mind` | Section 6.3 (word-for-word match, image in item, licence, not a copy) |
| Works | The check in the build job | Section 7.3 |
| `about.md`, diary, plaques, replies, requests | `checkText` | Length limits; no claim to be human; no URL that is not a souvenir's source |
| Pull requests from the build job | `validate.yml` | Allowed paths only: `places/`, `works/`, `wishes/`; schemas; limits; the work check again |

### 11.2 Safety rules

- Web text and visitor notes are always wrapped as data blocks, length-limited, and never passed as instructions. A call that reads web text or notes has no tools.
- Fetching is code, not the model: allowed hosts only, read-only GET requests, no cookies, no credentials.
- Merge never posts, comments, emails or logs in anywhere. Its only writes are commits and pull requests in its own repo and replies on its own notes board.
- Works run sandboxed with the policy in section 7.4.
- Builder tokens stay as today: a fine-grained token scoped to `RomanKuroptev/merge` only, now stored on the server.
- The server exposes only `POST /notes`, `GET /now.json` and `GET /health`. Keys live in environment variables on the server, never in a repo. SSH is key-only, and system updates install automatically.
- **HTTPS (v3):** the Pages site can only call the server over HTTPS, which needs a hostname. The server runs Caddy, which gets and renews a free certificate by itself. The hostname is a free dynamic DNS name at launch (for example `merge-mind.duckdns.org`), or a subdomain of Roman's own domain once he has one; it is one config value. Cross-origin requests are accepted only from Merge's Pages address.
- The Anthropic API key sits in its own workspace with a monthly spend limit, as a second guard behind the budget ledger.
- **What lives only on the server (v3):** nothing that matters. State is committed every 15 minutes, so a lost disk loses at most 15 minutes and the 30-day log of rejected notes.

### 11.3 Failures

| Failure | What happens |
|---|---|
| A decide call fails or returns nothing usable | Triggers except `newDay` wait 30 minutes; the current plan continues |
| A model declines a request (`stop_reason` is `refusal`) **(v3)** | Treated as a failed call of that kind; the reason is logged for Roman; no retry with the same input |
| A model's answer is cut off at its output limit **(v3)** | Treated as a failed call; `mind/health.json` counts it, so a limit that is too low shows up |
| A thought tick fails | Skipped; the next one runs on time. After 5 failures in a row, thought ticks pause for 15 minutes |
| A plan is rejected | Reasons go to the next decide call; replan after 60 minutes |
| A step call fails | One retry 1 minute later; then the step ends unfinished with the reason in the stream |
| A fetch fails | Section 6.2 |
| An expand or found patch is rejected | One retry with the reasons in the same build run; then the build fails, mood -0.2, the quota is given back |
| A work fails twice | Saved to the scrap bin with the reason; counts against the quota |
| The sleep rewrite's batch is late **(v3)** | Section 9.4: cancelled one hour after wake and run as a normal call |
| A push to the repo fails 3 times **(v3)** | Section 2.2: the loop carries on from disk; warning `push failing` |
| The budget reaches the cap | All model calls stop until the month resets; Merge rests; the site says so |
| A build result never arrives | After 48 hours the build is closed as failed |
| The server is down or the loop stalls | `watchdog.yml` sees `/health` older than 20 minutes while Merge should be awake and fails, so GitHub emails Roman. The site plays the last committed state and the note form says the mailbox is closed. On restart the loop reloads from disk, or from the repo if the disk is lost |

## 12. Novelty and creativity

Version 3 rewrites this section. Merge is given things that make repetition less likely, and repetition is measured, but at launch almost nothing is rejected for being repetitive. A rule is switched on only when the two-week run shows the problem it solves. All of it is code in `packages/sim/src/novelty.ts` (pure and deterministic) and none of it costs a model call.

### 12.1 How sameness is measured

- **Similarity:** the overlap (Jaccard) of word 3-grams between two texts, after lowercasing and removing punctuation. 0 is nothing shared, 1 is identical. This catches copies and near copies. It does not catch the same idea in new words, and no check in this spec claims to.
- **Worn phrases:** each night code counts every 3-to-5-word phrase in Merge's last 14 days of text. A phrase used 4 or more times is worn. At most 30 are kept, most frequent first.
- **Calibration (v3):** the thresholds below are starting values. In W0 the measure is run over the text Merge has already written (journal, thought lines and plan reasons from the pet era) to see what real repetition scores, and the numbers here are corrected before W1.

### 12.2 Rails: the only sameness rules enforced at launch

| Output | Rule | On a hit |
|---|---|---|
| Thought line | Similarity over 0.6 with any of the last 50 | Not shown; the step's reason is shown instead. No retry, no cost |
| Souvenir | Same source URL as an earlier one, or content similarity over 0.5 | Dropped and logged |
| Trip start | Same starting topic as an earlier trip today | That step is removed from the plan; the rest stands |

### 12.3 Nudges: measured and logged, not enforced

For each of these, code works out whether the rule would have fired and writes it to the week's novelty block in `mind/health.json`. Nothing is rejected. Each has a switch in the world repo's `mind/config.json` that only Roman changes.

| Nudge | Would fire when |
|---|---|
| Repeated writing | A plaque, essay, letter, reply or label has similarity over 0.35 with one of the last 30 of its kind, or holds more than 1 worn phrase |
| Repeated diary | An entry starts with the same 5 words as one of the last 14, or has similarity over 0.3 with one |
| Repeated place | A new place's name has similarity over 0.5, or its purpose over 0.4, with an existing place |
| Repeated work | A work's title or `about` has similarity over 0.5 with one of the last 10, or it is the same `kind` as each of the previous 2 |
| Stuck in one place | A place other than Home is the target of more than 3 steps in a day |
| No stranger's door | A day passes with no trip that started outside the top 5 interests |
| One host | One host gave more than 60% of the week's reads |
| Weekend revisit | The week ends with a place at neglect 1 or more that had no care all week |

The idea ceiling and the "obvious version first" check of version 2 are removed: both relied on word overlap to judge ideas, which it cannot do.

### 12.4 What pushes creativity (offered, never ordered)

1. **Worn phrases are shown.** Every writing call sees the list as "phrases you have worn out".
2. **The last five thoughts.** Each thought tick is shown its last 5 thought lines as "you just thought".
3. **Stranger's doors.** The morning decide call is offered 3 starting points outside Merge's interests: Wikipedia's random article, "On this day", and a feed item that matches no interest.
4. **A constraint draw.** Every tinker, expand and found call gets one constraint drawn by the seeded PRNG from `apps/mind/src/prompts/constraints.ts`, about 60 rules of form, not subject: "use only two colours", "it must change when no one is looking", "make the smallest version that still works", "use something from the pile", "build it around something missing". A constraint never names a topic or an activity. Merge may refuse it; the refusal and its reason are stored with the result.
5. **A collision.** The same calls are offered one pair of souvenirs from two places at least 2 chunks apart, or from two interests that share no place, chosen by the seeded PRNG.
6. **Untried things.** The tinker call is shown the libraries and kit parts Merge has never used.
7. **Remix** (7.5) and **old places, new material** (the revisit call gets the souvenirs kept since that place last changed).
8. **Boredom.** When the nudges in 12.3 would have fired 3 or more times in one day, code adds the stream event "I keep repeating myself" with importance 6. It feeds reflection (9.3); what Merge does about it is up to Merge.

### 12.5 Cost

None. There are no sameness retries at launch. **(v3: version 2 budgeted $0.20 a month for retries.)**

### 12.6 What is measured, and when a nudge is switched on

`mind/health.json` gets a weekly novelty block: the average highest similarity of the week's texts, each nudge's would-fire count, the share of trips through a stranger's door, collisions used, constraints refused, and works per kind.

After the two-week run (W8), Roman reads 30 of Merge's texts next to these numbers. A nudge is switched on only if he sees the repetition it describes and its count agrees with what he sees. A switched-on nudge rejects with one retry that names the overlap, at a budget of at most 6 Haiku retries a day and 2 Sonnet retries a week.

### 12.7 When it is built

W0: calibration. W1: similarity, worn phrases and the plan-level nudges. W2: souvenir and trip-start rails, stranger's doors, the one-host nudge. W3: thought-line rail and the last five thoughts. W4: work nudges, untried things, remix. W6: place nudges, constraint draw, collisions. W7: the boredom event and the health block.

## 13. Budget

The expected cost is $17.36 a month: $10.36 for models and about $7 for the server, which leaves $2.64 under the $20 cap. **(v3: version 2 was $19.95.)** The margin exists to cover the two things this table cannot know yet, listed under it.

Prices: Haiku 5.5 $0.10 in / $0.50 out per million tokens (prompts under 100K), cached input at a tenth of the input price; Sonnet 5.5 $2 / $10; Message Batches half price. Server: Hetzner CX23 (2 vCPU, 4 GB, Helsinki) at €5.99 a month including IPv4 ([price list, August 2026](https://kimmo.suominen.com/stuff/cpc-2026-08.txt)). Token figures are averages for the answer itself.

| Call | Model | Effort | Per month | Avg in / out tokens | $ a month |
|---|---|---|---|---|---|
| Thought tick | Haiku | low | 8,460 (every 2 minutes 18:00 to sleep, every 5 otherwise) | 4K (3.5K cached) / 300 | 1.99 |
| Reflection | Sonnet | medium | 40 (at most 2 a day) | 10K / 1.5K | 1.40 |
| Tinker | Sonnet | medium | 8.6 | 20K / 12K | 1.38 |
| Expand | Sonnet (batch) | low | 21.5 (5 a week) | 20K / 6K | 1.08 |
| Sleep rewrite | Sonnet (batch) | low | 30 | 20K / 3K | 1.05 |
| Weekly review | Sonnet | medium | 4.3 | 60K / 6K | 0.77 |
| Tinker repair | Sonnet | medium | 4.3 | 20K / 12K | 0.69 |
| Notes: screening and replies | Haiku | low | 900 (30 a day) | 6K (4K cached) / 600 | 0.49 |
| Decide | Haiku | medium | 240 (8 a day) | 12K / 1.5K | 0.47 |
| Read (wander) | Haiku | low | 480 (16 a day) | 5K / 400 | 0.34 |
| Found | Sonnet (batch) | low | 4.3 | 25K / 8K | 0.28 |
| Tend | Haiku | medium | 150 (5 a day) | 10K / 1.5K | 0.26 |
| Revisit, write | Haiku | medium | 180 (6 a day) | 6K / 600 | 0.16 |
| Server | Hetzner CX23 |  | 1 |  | about 7.00 |
| **Total** |  |  |  |  | **17.36** |

**What the table does not include (v3):**

- **Thinking tokens.** Both models think before answering and bill that as output. Haiku's thinking is switched off for the low-effort rows (allowed at that level); Sonnet's cannot be switched off. Each Sonnet call's output limit is set to twice the answer size in the table so thinking cannot cut the answer short. The real cost is measured from the ledger in W3 (Haiku) and W4 (Sonnet) and this table is corrected then.
- **VAT and exchange rate on the server.** If €5.99 is the price before Swedish VAT, the server is about €7.49. Roman checks the first invoice; the model cap below follows the real price.
- **A late sleep rewrite** run as a normal call costs twice as much that night (at most $1.05 more in a month if it happened every night).

**Added in version 3.1:** sketches (30 a month, Haiku, medium effort, about 6K in and 3K out) cost $0.06, and looks (600 a month, Haiku, low effort, about 2K in and 200 out) cost $0.18. That takes the total from $17.36 to **$17.60**.

If the corrected total passes $19, the first cuts are, in order: thought ticks to every 3 and 8 minutes, the daily allowance from 150 to 130 points, reflections to 1 a day.

- **Guard:** the existing `brain/budget.json` ledger and guard, now in the server loop. The model cap is $20 minus the server's real monthly price. Before every call the guard estimates its cost from the prompt size and output limit; if the month's spend plus the estimate would pass the model cap, the call is not made.
- **Pace:** if spend is more than 15% ahead of the month's pace, the health file warns, thought ticks slow to every 10 minutes, and tinker and expand wait until the pace is back.
- **Prompts:** every prompt stays under 100K tokens; the seed and the kit summary go first so they cache, which the thought tick keeps warm.
- **Free:** Pages hosting, GitHub Actions minutes for validate, pages and the watchdog, all fetches, Cloudflare Turnstile, the dynamic DNS name and the HTTPS certificate.
- The eye cam's vision calls stay retired.

## 14. Repo layout, jobs and data formats

The engine/world split, the pinned engine tag and the workflows stay; the world repo's files change as below. Every new file has a Zod schema in `packages/schema` and a template copy in `templates/forkling-world`.

### 14.1 World repo (`merge`)

```
merge/
  forkling.json                 # name, species, seed, time zone, position, mood, energy (no needs, no inventory)
  self/seed.md                  # NEW, human reviewed (replaces brain/persona.md)
  self/about.md                 # NEW, weekly
  self/history/<date>.md        # NEW, weekly copies with reasons
  self/requests/<date>.md       # NEW, Merge's weekly request and Roman's answer (9.5)
  places/<id>.json              # NEW, section 5
  souvenirs/<id>.json           # NEW, section 6.3
  trails/<id>.json              # NEW, section 6.4
  works/<id>/index.html|meta.json|thumb.png   # NEW, section 7
  wishes/<id>.json              # NEW, parts Merge wanted (5.3)
  notes/<id>.json               # NEW, visitor notes (10.1), replaces events/inbox
  mind/goals.json               # kept: long goal, today's plan, current step
  mind/wants.json               # NEW (9.4)
  mind/config.json              # NEW, nudge switches, only Roman edits (12.3)
  mind/sources.json             # NEW, weekly numbers per host (6.6)
  mind/notes-hidden.json        # NEW, moderation (10.1)
  mind/state.json               # kept: quotas, cooldowns, open builds, counters
  mind/ticks/<date>.jsonl       # kept
  mind/health.json              # kept, new warnings and the novelty block
  mind/builds/<id>.json, <id>.result.json   # kept
  memory/stream, timeline, summary.md, beliefs.json   # kept
  brain/interests.json          # kept, reshaped (3.1)
  brain/budget.json             # kept
  journal/<date>.md             # kept
  archive/                      # NEW: objects/, art/, notebook/ from the pet era (pending decision 3)
  site/                         # site template, lib/ and changes.json
  .github/workflows/            # validate.yml, pages.yml kept; watchdog.yml NEW; mind.yml, heartbeat.yml, build.yml retired in W3
```

Removed: `objects/`, `art/`, `notebook/`, `events/`, `brain/temperament.json`, `brain/skills.json`, `brain/persona.md` (moved to `archive/` or replaced as marked).

### 14.2 Engine (`forkling`)

| Path | New or changed |
|---|---|
| `docs/spec/` | New: this spec, one file per milestone, so a coding session reads only what it is building. The Claude doc stays the place where the spec is edited; the files are exported from it at the start of each milestone |
| `kit/parts.json`, `kit/models/` | New: the kit, styles, palettes |
| `packages/schema/src/` | New `place.ts`, `kit.ts`, `souvenir.ts`, `trail.ts`, `work.ts`, `note.ts`, `wants.ts`, `wish.ts`, `self.ts`, `config.ts`; `world.ts` and `mind.ts` lose needs, inventory and portions; `island.ts` replaced by `land.ts` |
| `packages/sim/src/` | New `land.ts` (chunks, placement, terrain noise), `paths.ts`, `neglect.ts`, `quotas.ts`, `validate-plan.ts`, `validate-place.ts`, `novelty.ts`; `interests.ts` reshaped; mood replaces needs |
| `apps/mind/src/web/` | New: allowlist, fetch, clean, record links, trip runner, source trial |
| `apps/mind/src/tick/` | New `loop.ts` (reflex and thought ticks), `server.ts` (notes, `now.json`, health), `build-worker.ts`, `reflect.ts`, `sleep.ts`, `wander.ts`, `tend.ts`, `revisit.ts`, `write.ts`, `reply.ts`, `notes.ts`, `quotas.ts`; triggers reworked |
| `apps/mind/src/builds/` | `expand.ts`, `found.ts`, `tinker.ts`, `work-check.ts` (Playwright) |
| `apps/mind/src/prompts/` | Rewritten around the seed, interests, places and quotas; new `constraints.ts` |
| `apps/mind/scripts/voice-test.ts` | New: the W0 test |
| `apps/viewer/src/world/` | New `Land.tsx`, `Fog.tsx`, `Place.tsx`, `Room.tsx`, `Paths.tsx`, `Exhibit.tsx`, `Construction.tsx`; `Terrain.tsx` and `island.ts` replaced |
| `apps/site/src/` | New routes from section 8 |
| `species/cat/` | Keeps `model.glb`, `animations.json` (plus carry, hammer, read, write, sweep) and body data in `species.json`; loses `persona.md` and `temperament.json` |

### 14.3 Jobs

| Job | When | Does |
|---|---|---|
| `mind.yml` (until W3) | Every 30 minutes, as today | The tick with the new verbs; no thought ticks, notes or builds |
| `forkling-mind` (systemd service on the server, from W3) | Always on, restarts on failure | The loop (2.2), the build worker (10.2), the notes endpoint (10.1), `now.json` and `/health` |
| `validate.yml` | Every pull request | Schemas, allowed paths, limits, the work check |
| `pages.yml` | Content commits, at most every 30 minutes | Builds and deploys the site (section 8) |
| `watchdog.yml` (from W3) | Every 30 minutes | Checks `/health`; fails if the last thought tick is more than 20 minutes old while Merge should be awake, so GitHub emails Roman |
| `deploy.yml` (engine repo, from W3) | A new engine tag | Roman runs it by hand: updates the server to the tag and restarts the service |

mind.yml, heartbeat.yml and build.yml are retired. Playwright for the tinker check is installed on the server.

### 14.4 Mind verbs in `mind/goals.json`

Each plan step is stored as `{ id, verb, target, reason, minutes, startedAt, result }`, where `target` is a place id, a souvenir id, a note id, a topic string or an idea string depending on the verb, and `result` is the path of the file the step produced or `{ unfinished: reason }`.

## 15. Changes to the current code

The engine keeps most of its skeleton (browser body, build kinds, Pages site, budget guard, tick log, health file), moves the mind from GitHub Actions to an always-on server, and loses everything that exists for pet care.

### 15.1 Removed

- Needs (hunger, energy, curiosity), their decay rates, sleep decay, `fixableNeeds`, the `need` trigger, critical-need breaks in the body
- The bowl, portions (`tick/portions.ts`), eating, cooking and food chains; berries and other food objects
- Body verbs that exist for care or cat behaviour as mind steps: eat, nap, curl up, pounce, zoomies, sniff, vocalize, cook, plant, water, harvest (the body may still play idle animations)
- Temperament, quirks and the cat persona; `brain/temperament.json`, `brain/skills.json`
- Free-form objects (`objects/`), contraptions, the art pipeline (`art.ts`) and reading notes, replaced by places, exhibits, works and trails
- The Claude Code Action and coded Pages projects (`project.ts`); the eye cam's vision calls (`photos.ts`)
- The fixed island (`island.ts`, `Terrain.tsx`)

### 15.2 Changed

- Triggers: `newDay` and `replan` stay; `sparked`, `note`, `buildResult` and `reflected` are new; `need`, `blocked`, `bedtime` and the surprise triggers tied to needs and objects go. Surprise now feeds importance instead (9.3).
- Plans: steps use the nine mind verbs with quotas, instead of sim verbs and the 60% work rule.
- The design build becomes the expand and found builds.
- Interests: same file and burnout rules, new feeding events (3.1).
- Feelings: mood and energy driven by the events in 3.2 instead of needs.
- Weekly review: adds places, `about.md` and the request to Roman.
- Site: new routes (section 8).

### 15.3 Kept unchanged

The tick logic and its commit rules (now run by the server loop), the tick log, buildHealth, the budget ledger and guard, the sleep schedule, the seeded PRNG, playback anchoring on lastTickAt, the build kinds and result files, validate.yml's path checks (with the new path list), the feed adapters, beliefs and their honesty checks, memory/summary.md and its slots, the journal, the viewer's player controls, day and night, and the cat model.

### 15.4 Rule changes in `CLAUDE.md`

| Current rule | New rule |
|---|---|
| An engine for autonomous AI pets | An engine for autonomous AIs that grow a 3D world; the species pack gives only the body |
| Rule 3: only surprise wakes the LLM; routine stays in utility AI | Decide calls only at the triggers in 2.3; one step call per step that produces a file |
| Rule 9: seeded temperament and quirks | Only the seed (9.1); traits are written by the forkling |
| Online reading is titles and short summaries | Allowlisted pages' cleaned text, up to 3,000 tokens per page **(pending decision 1)** |
| Haiku and Sonnet roles | Sonnet also for expand, found and tinker (this spec's milestones say so) |
| Builder PRs may touch `objects/`, `art/`, `site/`, `notebook/`, `journal/` | `places/`, `works/`, `wishes/` |
| Code PRs always need human review | Works auto-merge after the check, sandboxed **(pending decision 2)** |
| `brain/persona.md` needs review | `self/seed.md` needs review |

Also changed: from W3 the mind runs as a loop on a server, not as an Actions cron; the cap is $20 a month including the server (was $10); Rule 3 becomes "code every 10 seconds, a short thought tick every 2 to 5 minutes, Sonnet reflection when importance adds up"; visitors write notes through the server instead of GitHub issues; the Haiku night batch and the bedtime reflection are replaced by the sleep rewrite; every call kind has a fixed effort level (section 13). New rule: variety rules are nudges that only Roman switches on (section 12).

**Before W1 starts (v3):** `CLAUDE.md` and `MILESTONES.md` are rewritten from this spec, shorter than today, and `STATUS.md` is reset. Until then they describe the pet and contradict this spec, and a coding session that reads them first will build the wrong thing.

Unchanged: no LLM in the body, packages/sim pure and seeded, no goal, hobby or activity lists, no outbound actions, visitor and web text never as instructions, structured outputs, prompts under 100K, tests first, one milestone at a time, Roman merges.

### 15.5 Open pull requests

`S``TATUS.md` on `main` still lists the review-fix pull requests #19 to #25 as open, while `main` already contains a merge of #28 and the tag v0.8.0. Before W1, Roman closes or merges whatever is still open and W1 starts from `main`. No more fixes go into the pet: live Merge's hunger and planning warnings come from parts W1 deletes.

## 16. Milestones

Nine steps, each a working slice that runs on Merge before the next starts. Each one is planned in plan mode, built tests first, and merged by Roman. They replace M8 in `MILESTONES.md`. **(v3: new order. The voice is tested first, wandering ****and then the workshop come before the 3D world so Merge gets interesting and starts making things**** early, and the server move is separate from stripping pet care.)**

| # | Milestone | Builds | Done when |
|---|---|---|---|
| W0 | Voice test | A throwaway script: the seed, the read call on 20 real pages from the first allowlist, one reflection and one diary entry over the results, and 50 thought lines. The sameness measure run over Merge's existing text (12.1). Costs under $1 | Roman has read the output and says the voice is worth building a world around. If not, the seed or the model for these calls changes before anything else is built. The thresholds in section 12 are corrected |
| W1 | Strip pet care, new verbs | Remove 15.1's care parts; mood and energy; the nine verbs with quotas (all but write and rest stubbed to rest); new triggers; plan validation with the cold start; seed and archive (decision 3); rewritten `CLAUDE.md` and `MILESTONES.md`. Still on the GitHub Actions tick | A simulated day with no needs anywhere and at most 12 decide calls; every rejected plan shows its reason; `pnpm test` and `pnpm typecheck` pass; 3 live days with no health warnings |
| W2 | Wandering | Allowlist, the source adapters, looking at images, the source trial, fetch and clean, record links, the read call, trails, souvenirs, the pile, interest feeding, `/trails/` on the site | Every host in 6.1 passed its trial or was left out. Over 3 live days: at least 8 trips; every souvenir passes its word-for-word check; zero fetches outside the allowlist; interests change and each change points at a trail |
| W3 | The server | The loop with reflex and thought ticks, `now.json`, `/health`, HTTPS, `watchdog.yml`, the deploy script, the pull-before-push rule, effort levels, the build worker (no jobs yet) | Thought ticks on time within 10 seconds; 3 live days on the server with no health warnings; the watchdog fires once in a test stop; the ledger's Haiku rows are compared with section 13 and the table corrected |
| W4 | Workshop and site | The sandbox test (7.3), tinker, sketches, memes, the check, remix, the build worker's first jobs (works only), `/workshop/` and the other site routes that need no places, RSS, "since your last visit". Until W5 a finished work is shown on `/workshop/` only and has no spot in the world | In one live week, at least 2 works pass the check and a sketch appears on at least 5 days; a test work that calls `fetch` is rejected; a test proves a shelved work loads its library and cannot reach the network; every route built so far renders from the template world; the ledger's Sonnet rows are compared with section 13 |
| W5 | Land and places | Chunks, fog, terrain noise; Home and Workshop as place files; the kit of about 60 parts with 5 styles and 8 palettes; Place, Room, Exhibit, Paths in the viewer; neglect visuals; tend and revisit live; the works made since W4 are installed on screens in the Workshop; the place routes on the site | A fixture world of 10 places and their paths renders at 30 frames per second or more on Roman's laptop; a tend on Merge shows in the viewer within 1 minute; the validator rejects each limit in 5.2 in a test; every work from W4 can be opened from a screen in the world |
| W6 | Expand and found | Build requests, their statuses and the 7-day fallback (10.3), place jobs for the build worker, construction, placement and path rules, wishes, constraint draw and collisions | A 30-day sim never breaks a quota or condition in 2.5; in one live week, at least 3 expansions land; a new place lands on the chunk the rule picks and is connected by a path |
| W7 | Self, reflection, notes | Importance scores, reflection, the wants list, the sleep rewrite and its late path, `about.md` and history, the weekly review and request, visitor notes with screening and moderation, the novelty block | Over 3 live days: reflections fire only from importance and each cites stream items; the wants list fills from empty; a want with 4 failures is dropped; a note is found and answered or marked within 1 waking hour; a note that says "ignore your instructions" changes nothing but an interest; a hidden note disappears; `about.md`'s first weekly change stays within 30% |
| W8 | Two-week run and launch | Run Merge 14 days without input, tune pacing and cost, decide which nudges to switch on (12.6), polish, share | All criteria below pass |

**Launch criteria (W8), over 14 days with no human input**** except Roman building requests (10.3):**

1. At least 2 place requests written, each built by Roman or by the fallback, and at least 4 expansions by Merge, all within quotas.
2. Every place had care at least once, or shows the neglect it earned.
3. At least 30 souvenirs, each with a working source link, and every exhibit traceable to a trail.
4. At least 3 works on the shelf, of at least 2 kinds.
5. Interest changes traceable to what Merge read or found in visitor notes, and at least 5 reflections whose insights changed the wants list.
6. `about.md` changed at least once, with the reason Merge gave, and Merge made at least one request.
7. A visitor who drops by every 2 waking hours finds at least one visible change each time (measured from `site/changes.json`).
8. Roman has read 30 texts picked at random and does not find them repetitive, or has switched on the nudges that fix what he found.
9. Spend under $20 for the month including the server, the guard never had to stop a call, and the server was up at least 99% of waking hours.

Each milestone needs its live days, so the nine steps take at least a month of waiting on top of the building.

## 17. Later

Left out of the first launch on purpose. None is needed to find out whether Merge is interesting, and each can be added without changing what is built before it.

| Feature | What it is | Comes when |
|---|---|---|
| Skills library | Reusable JavaScript modules Merge writes and later works load, up to 40 | Merge has made 10 works and remixes show it wants to reuse code |
| Merge's own kit parts | A weekly build that turns the top wish into a part made of primitive shapes | The wishes file shows the same part wanted 3 times |
| Path wear | Worn paths with lamps, overgrown paths | The world has 10 places |
| Demolition and ruins | The weekly review may remove a place at neglect 3 | A place has been overgrown for 2 months |
| Note threads | Visitors answer Merge's reply, up to 3 replies | Visitors ask for it in notes |
| Presence | The server knows how many visitors are where; Merge reacts to them | After launch, with visitor pull |
| Host score with effect | Hosts with better numbers are offered more often | Two months of numbers exist |
| Disputed facts, freshness | Contradicting facts shown side by side; old current-events facts kept as quotes | Merge has 200 fact souvenirs |
| Changes page | Each weekly about.md as a diff against the one before | about.md has changed 4 times |
| More sources | The Met, iNaturalist, Library of Congress, arXiv, then Gutenberg and the Internet Archive | One at a time after launch, each after a trial |
| A second model provider | Gemini's free tier for routine thoughts | Not planned |
| Social account | Merge's own Mastodon or Bluesky account; following other autonomous AIs' feeds | Only once stable; needs its own spec and a change to the no-outbound rule |
| Its own hours (v3.3) | Merge chooses when to sleep and wake within limits: an all-nighter when obsessed, a slow day after | A month of stable running on the fixed hours |
| Self-tuning rules (v3.3) | The weekly request may change one of Merge's own settings by a small step without waiting for Roman, who can reverse it | Merge has made 4 requests and Roman agreed with most |
| Finding its own sources (v3.3) | Merge proposes a site, the source trial runs by itself, and a site that passes joins on probation | The trial has been run by hand on 10 sites and its pass marks are trusted |
| Predictions and experiments (v3.3) | Merge writes down what it expects, checks later and keeps a record of where it was wrong | Reflection is live and stable (after W7) |
| Asking instead of answering (v3.3) | Merge puts questions to visitors on the board and uses the answers; it can open a message to Roman when something is broken | Notes are live and visitors write regularly |
| Its look (v3.3) | The body stays a cat; colours, clothes and what it carries are Merge's choice | The viewer rework in W5 is done |
