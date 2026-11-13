# W5: Land and places (spec export)

Exported from `spec.md` (v3.3) at the start of W5, so a coding session reads only what it is building. Sections 2.7, 4, 5, the place routes of 8, and the verb rows and conditions that tend and revisit run under (2.4, 2.5, 5.4, 11.1). Where this page and `spec.md` differ, `spec.md` wins until it is edited in the Claude doc. Milestone brief: [`claude-code-prompts.md`](claude-code-prompts.md), W5.

**Done when (spec 16):** a fixture world of 10 places and their paths renders at 30 frames per second or more on Roman's laptop; a tend on Merge shows in the viewer within 1 minute; the validator rejects each limit in 5.2 in a test; every work from W4 can be opened from a screen in the world.

## Decisions made for W5 (Roman, 13 November 2026)

- **The kit is primitives plus CC0 models.** Every part works as primitives; about 20 furniture and nature parts may also point at a CC0 model file in `kit/models/`, each listed in `kit/models/CREDITS.md` with its licence. A model that fails to load falls back to the primitives.
- **Works on screens: a gallery terminal.** A screen holds one work. The Workshop also has a **terminal** part whose exhibit kind `gallery` opens a picker of every shelved work, so every work stays reachable while older sketches rotate off the single-work screens.
- **No release, no deploy in W5.** Home and Workshop reach Merge through the template and a migrate step that Roman runs at release.

## Slices

1. Spec export and the kit (schema, `kit/parts.json`). 2. The place file and its limits (5.1, 5.2). 3. Land, paths, neglect (4.1 to 4.4). 4. Place patches (5.4, 11.1). 5. Home and Workshop as place files, and the 10-place fixture world. 6. The body's world and the new land in the viewer. 7. Places in the viewer (7b: CC0 models). 8. Exhibits and neglect visuals. 9. Verbs as poses at places. 10. Tend for real. 11. Revisit, and works installed on screens. 12. The viewer stays current (`now.json`, `/places.json`). 13. Site place routes. 14. Retire the pet era. 15. Runbook and done-when.

---

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


## 8 (place routes only)

| Route | Shows |
|---|---|
| `/` | The 3D world full screen, with an overlay: what Merge is doing now and why, the "since your last visit" panel, and links to the pages below |
| `/places/` | A top-down map of the chunks with every place, its neglect level, and its last change; a list under it |
| `/places/<id>/` | The place as a page: name, purpose, tags, every exhibit (images with credits, quotes with source links, works embedded in the sandbox, plaques), the history, related places |

Before W5 there is no 3D world of places: works are shown on the workshop page only, `/` keeps the current island, and trails, souvenirs and the pile are shown on `/trails/` only.

- **Since your last visit:** the browser stores the time of the last visit in `localStorage` (wrapped so a blocked store just hides the panel). The panel lists up to 8 changes since then from `site/changes.json`, which the build writes from commits: "expanded House of Lights", "kept a souvenir", "shelved a work".
- **Rebuilds:** `pages.yml` builds the site after any commit that touches `places/`, `souvenirs/`, `trails/`, `works/`, `journal/`, `self/` or `notes``/`, at most once every 30 minutes. Tick-only commits (`tick:`) do not rebuild.
- **Look:** one shared stylesheet; each place page takes its accent colour from the place's palette.

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
