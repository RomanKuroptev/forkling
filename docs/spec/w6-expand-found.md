# W6: Expand and found (spec export)

Exported from `spec.md` (v3.3) at the start of W6, so a coding session reads only what it is building: sections 2.5 (conditions on expand and found), 4.2 to 4.5 (where a new place goes, paths, neglect, construction), 5.3 and 5.4 (wishes, how each verb changes a place), 10.2 and 10.3 (the build job, build requests and the 7-day fallback) and the constraint draw and collisions of 12.4. Where this page and `spec.md` differ, `spec.md` wins until it is edited in the Claude doc, except for the decisions below. Milestone brief: [`claude-code-prompts.md`](claude-code-prompts.md), W6.

**Done when (spec 16):** a 30-day sim never breaks a quota or condition in 2.5; in one live week at least 3 expansions land; a new place lands on the chunk the rule picks and is connected by a path.

## Decisions made for W6 (Roman, 13 November 2026)

- **Expand and the fallback build land through the loop, not a data PR.** Spec 10.2 says a data PR that `validate.yml` merges. The loop also writes `places/<id>.json` on every tend and install, so a PR on the same file could conflict and stall. Instead the build worker makes the Sonnet call and puts the validated result in `mind/builds/<id>.result.json`; the loop checks it again (`validatePlacePatch` or `validatePlace`) and writes `places/`. One writer of `places/`. `validate.yml` still checks any place or wish in a pull request (Roman's builds) against its schema.
- **Plain Sonnet calls, no Batch API in W6.** Spec 13 prices expand and found as batch calls. W6 uses a normal Sonnet call at low effort in the worker, about $1.10 a month more than the table (5 expands a week), which keeps the model total under the cap. Batch can come with W7's sleep rewrite.

## Slices

1. Spec export and the request and wish schemas (`requests/<id>.md`, `wishes/<id>.json`, `validate-pr`). 2. Pure rules in sim (the 2.5 conditions, waking time). 3. Constraint draw and collisions. 4. Expand for real. 5. Construction and expand paths in the viewer. 6. Found writes a request. 7. Request lifecycle and the fallback. 8. The staked plot in the world. 9. Site `/requests/` and honesty lines. 10. Place nudges, logged only. 11. The 30-day sim. 12. Runbook.

---

### 2.4 The verbs (the two rows W6 builds)

| Verb | Target | What happens | Duration | Step call | Quota |
|---|---|---|---|---|---|
| expand | A place | One new room, or one room enlarged, or one new path from it | Starts a 3 h construction | Sonnet, in the build job | Allowance (9.8); never the same place twice in a row |
| found | A name, purpose and interest | A build request for a new place on new land (10.3). Roman builds it with Claude Code; the build job runs only as the fallback after 7 days | 20 to 40 min to write the request; a 6 h construction starts when the build lands | Sonnet, in the build job | 1 a week |

### 2.5 Conditions on expand and found

- Expand is allowed on a place only if one of its tags has weight 50 or more and at least 3 souvenirs with that tag were kept since the place last changed size.
- Found is allowed only if an interest has had weight 70 or more at wake on 3 days in a row and no place carries that interest as a tag. Since version 3.2 a found writes a build request to Roman (10.3) and needs fewer than 2 place requests open.
- Both need the place's land to be free of construction.

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

### 12.4 What pushes creativity (W6 builds items 4 and 5)

4. **A constraint draw.** Every tinker, expand and found call gets one constraint drawn by the seeded PRNG from `apps/mind/src/prompts/constraints.ts`, about 60 rules of form, not subject: "use only two colours", "it must change when no one is looking", "make the smallest version that still works", "use something from the pile", "build it around something missing". A constraint never names a topic or an activity. Merge may refuse it; the refusal and its reason are stored with the result.
5. **A collision.** The same calls are offered one pair of souvenirs from two places at least 2 chunks apart, or from two interests that share no place, chosen by the seeded PRNG.
