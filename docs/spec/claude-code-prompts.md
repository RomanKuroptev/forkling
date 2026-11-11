# Prompts for carrying on in Claude Code

Paste one prompt at a time, in order, into a Claude Code session opened in `C:\Code\forkling`. Each stands alone. Every one starts in plan mode and builds tests first, as `CLAUDE.md` asks, and ends with a PR for CI and then a merge.

Where things stand (11 November 2026): W0 and W1 are done and merged, `v0.9.0` is tagged, and Merge's repo runs on it. The spec is [`spec.md`](spec.md), an export of the Claude doc "Merge world-builder: functional spec" (v3.3, rev 133). Edit the spec in the doc, and re-export the part you need into `docs/spec/wN-<name>.md` when you start a milestone (the first step of each prompt). The engine tags are `v0.9.0` and up. A release is: a PR pinning the new `FORKLING_REF` in the template workflows, a tag on that merge commit, then `migrate-w1`-style updates to Merge's repo.

Things the W1 work left open, so no prompt has to rediscover them:

- Assumptions to check against the spec: expand's step time is 20 to 40 minutes; reply costs 0 points with a rail of 5 a day; a tinker with no size is priced as a full work.
- Still in the code from the pet era, to remove as their milestone replaces them: the sim's world of objects and nav grid (until W5), the novelty trigger and the object loading (until W2 and W5), the reading module's morning feed skim (until W2), the bedtime reflection and nightly rewrite (until W7), the schema's art, photo and build types (nothing reads them), and `templates/merge` (test fixtures only).
- `self/seed.md` changes need Roman's review. Releases, tags and changes to `RomanKuroptev/merge` are Roman's call.

---

## 0. The 3-day health check (run on 14 November)

```
Check how Merge is doing after the W1 release (engine v0.9.0, moved on 2026-11-11).
Use the live-check skill if it fits, otherwise read RomanKuroptev/merge with `gh api` (read-only):
- mind/health.json: `warnings` should be empty; decide calls a day at most 12; `allowance.points` should fall as steps start and rise by 150 at each wake (cap 450).
- mind/ticks/<date>.jsonl for 12, 13 and 14 November: any `notes` with "rejected", "failed", "budget" or "claimed to be human"; the engine field should read v0.9.0 on every line.
- notebook/writing/: how many notes it wrote, and read them. Is the voice good, does it repeat "tail low"-style tics, does it claim to be human, does any note go over 300 words?
- brain/budget.json: spend so far this month against the $20 cap.
- Actions runs: any failed `mind` or `pages` runs since the move.
Report: pass or fail against W1's "done when" (3 live days, no health warnings, at most 12 decide calls a day), the notes it wrote, and anything that needs fixing before W2. Change nothing.
```

---

## W2 Wandering (spec 6, 7.8, 3.1, 8 `/trails/`, 12.2 and 12.7 for W2)

```
Start milestone W2: Merge wanders the web. Read CLAUDE.md, STATUS.md and MILESTONES.md first. Use plan mode. Export spec sections 6 (allowlist, trips, souvenirs, trails, source trials, scoring, source tiers), 7.8 (looking at images), 3.1 (interests), the /trails/ route in section 8, and the W2 parts of 12.2 and 12.7 into docs/spec/w2-wandering.md, then plan slices (one PR each, tests first, merged after CI).
Reuse what exists: apps/mind/src/web/clean.ts (HTML to text, 3,000 tokens) and souvenir.ts (word-for-word check), packages/sim/src/novelty.ts (similarity and worn phrases), and the throwaway fetchers in apps/mind/scripts/voice/sources.ts, which become the real adapters in apps/mind/src/web/ (allowlist.ts with per-host rates and a User-Agent, fetch with the 10 s and 2 MB limits, clean, record links for museum records, the read call, the trip runner). Add schemas souvenir.ts and trail.ts in packages/schema, souvenirs/ and trails/ in the world repo, the pile, interest feeding from trips (+4 per page topic, +10 per souvenir), the wander verb running for real (replace its "runs as rest" stub), looking at images (20 a day), the trip-start rail, and the source-trial command (`pnpm --filter @forkling/mind source-trial <host> --items 20`) with the pass marks in 6.5. Add the /trails/ page to apps/site. Remove the old reading module and the novelty trigger once wander replaces them.
Rules: read-only GETs by code only, allowlisted hosts only, web text only inside <data> blocks, souvenirs word for word with their source URL, no model other than Haiku 5.5 and Sonnet 5.5, never over $20 a month.
Done when (spec 16): every host in 6.1 passed its trial or was left out; over 3 live days at least 8 trips, every souvenir passes its word-for-word check, zero fetches outside the allowlist, and interests change with each change pointing at a trail. Do not tag or touch Merge's repo; stop with the PRs merged and tell me what to release.
```

## W3 The server (spec 2.2, 10.2, 11.2, 11.3, 13, 14.3)

```
Start milestone W3: move the mind to a small always-on server. Read CLAUDE.md, STATUS.md and MILESTONES.md. Use plan mode. Export spec sections 2.2 (the loop: reflex tick every 10 s, thought tick every 2 to 5 min), 10.2 (the build worker, no jobs yet), 11.2 and 11.3 (safety and failures), 13 (budget, effort levels, pace rule) and 14.3 (jobs) into docs/spec/w3-server.md, then plan slices.
Build: apps/mind/src/tick/loop.ts (reflex and thought ticks in code, state in memory, written to disk every minute, committed to the world repo every 15 minutes with pull-rebase-before-push), server.ts (GET /now.json, GET /health, POST /notes later), build-worker.ts (idle for now), the thought-tick call (Haiku, low effort, 140-character lines enforced in code, the last five thoughts shown), effort levels on every call kind, the budget guard and pace rule inside the loop, watchdog.yml (fails when /health is older than 20 minutes while awake), and deploy.yml plus a deploy script. Server: Hetzner CX23, Caddy for HTTPS, systemd unit `forkling-mind`, keys only in environment variables, key-only SSH. Write a runbook in docs/spec/w3-runbook.md with every command I have to run myself, because creating the server and DNS name is mine to do.
Rules: only the server and the build PRs write to the world repo; the Anthropic key lives in its own workspace with a spend limit; Merge never acts outside its repo.
Done when (spec 16): thought ticks on time within 10 seconds; 3 live days on the server with no health warnings; the watchdog fires once in a test stop; the ledger's Haiku rows are compared with spec section 13 and the table corrected. Stop before touching Merge's repo or the server; give me the runbook.
```

## W4 Workshop and site (spec 7, 8, 10.2 works, 12.3 work nudges)

```
Start milestone W4: Merge makes small web works. Read CLAUDE.md, STATUS.md and MILESTONES.md. Use plan mode. Export spec sections 7 (works, the tinker call, the check, the sandbox, remix, sketches, memes), 8 (the routes that need no places, RSS, "since your last visit"), 10.2 (the build worker's first jobs, works only) and the work nudges in 12.3 into docs/spec/w4-workshop.md, then plan slices.
Do the one-hour sandbox proof first (7.3): a test page shows a sandboxed work can load p5.js from site/lib/ under the CSP in 7.4 and cannot reach the network; if the policy blocks the library, inline it. Then: packages/schema work.ts, the tinker step (Sonnet in the build worker, one repair call, scrap bin with the reason), the headless Chromium check with Playwright (rejects fetch, XMLHttpRequest, WebSocket, storage, cookies, forms, window.open; a single-colour screenshot fails), sketches (Haiku, 4 KB, 3 a day), memes drawn in code (only formats it has looked at and read about, never the template image), remix, works auto-merging after the check, the validate.yml rewrite (allowed paths places/, works/, wishes/), /workshop/, /workshop/<id>/, retiring works (up to 2 a week), RSS, and the "since your last visit" panel. The tinker and sketch verbs replace their "runs as rest" stubs.
Done when (spec 16): in one live week at least 2 works pass the check and a sketch appears on at least 5 days; a test work that calls fetch is rejected; a test proves a shelved work loads its library and cannot reach the network; every route built so far renders from the template world; the ledger's Sonnet rows are compared with section 13. Stop with PRs merged; tell me what to release.
```

## W5 Land and places (spec 4, 5, 2.7, the place routes in 8)

```
Start milestone W5: land, places and the 3D viewer rework. Read CLAUDE.md, STATUS.md and MILESTONES.md. Use plan mode. Export spec sections 4 (land, chunks, fog, terrain noise, paths, neglect, construction, visitors), 5 (the place file, limits, the kit, how each verb changes a place), 2.7 (what the body shows) and the place routes in 8 into docs/spec/w5-places.md, then plan slices; this one is big, so keep each slice small and viewable.
Build: packages/schema place.ts, kit.ts; packages/sim land.ts, paths.ts, neglect.ts, validate-place.ts (each limit in 5.2 rejected in a test); the kit of about 60 parts with 5 styles and 8 palettes in kit/; Home and Workshop as place files; the viewer's Land, Fog, Place, Room, Exhibit and Paths components, and neglect visuals; the pack-format hook that shows each mind verb as a pose at a place (replace the cat's `mindPoses` all-sit); tend and revisit running for real; works installed on screens in the Workshop; the /places/ routes on the site. Then remove the sim's old island, objects and nav grid and the viewer's Objects, Terrain and Props.
Done when (spec 16): a fixture world of 10 places and their paths renders at 30 frames per second or more on my laptop; a tend shows in the viewer within 1 minute; the validator rejects each limit in 5.2 in a test; every work from W4 can be opened from a screen in the world. Stop with PRs merged; tell me what to release and how the pet-era objects were retired.
```

## W6 Expand and found (spec 2.5, 4.2 to 4.5, 5.3, 5.4, 10.3, 12.4)

```
Start milestone W6: Merge grows places and asks Roman for new ones. Read CLAUDE.md, STATUS.md and MILESTONES.md. Use plan mode. Export spec sections 2.5 (conditions on expand and found), 4.2 to 4.5 (where a new place goes, paths, neglect, construction), 5.3 and 5.4 (wishes and how each verb changes a place), 10.3 (build requests and the 7-day fallback) and the constraint draw and collisions in 12.4 into docs/spec/w6-expand-found.md, then plan slices.
Build: the expand step (Sonnet via the build worker, one room, an enlarged room or a path, 3 h construction), the found step (a build request file requests/<id>.md, a staked plot with a sign, 1 a week, at most 2 place requests and 5 wishes open), request statuses that Roman sets (building, built, declined, gift), the fallback that builds a plain kit place after 7 days (14 more if status is building), the placement and A* path rules, wishes/ and their 30-day close, the seeded constraint draw (about 60 rules in apps/mind/src/prompts/constraints.ts) and collisions, and /requests/. Remove the "runs as rest" stubs for expand and found. A simulated 30 days must never break a quota or condition in 2.5.
Done when (spec 16): a 30-day sim never breaks a quota or condition in 2.5; in one live week at least 3 expansions land; a new place lands on the chunk the rule picks and is connected by a path. Stop with PRs merged; tell me what to release.
```

## W7 Self, reflection, notes (spec 9, 10.1, 3.1, 12.3 and 12.6 novelty block)

```
Start milestone W7: Merge reflects, remembers and reads visitor notes. Read CLAUDE.md, STATUS.md and MILESTONES.md. Use plan mode. Export spec sections 9 (seed, what it writes about itself, reflection on importance, the wants list and sleep rewrite, the weekly review and request, its own page, the allowance already built, saying no and undoing) and 10.1 (visitor notes), plus the novelty block of 12.6 into docs/spec/w7-self.md, then plan slices.
Build: importance scores from the thought tick, reflection (Sonnet, only when the importance sum reaches 60, or 30 while there are fewer than 3 wants; at most 2 a day and 2 hours apart), mind/wants.json with the 4-failure drop, the sleep rewrite through the Batch API with its late path (cancel and rerun as a normal call 1 hour after wake), replace the old bedtime reflection and nightly rewrite, self/about.md with the 30% change limit and self/history/, the weekly review and its request to me (self/requests/), self/page.md (300 words, only Merge writes it, one change a day, no links), declining notes and closing places, visitor notes (POST /notes with Turnstile, screening by a Haiku call, 3 a day per visitor by salted hash, found within 10 m or after 6 waking hours, one reply each, moderation by mind/notes-hidden.json), the diary claim check (every fact a diary entry states must be in the stream), and the novelty block in mind/health.json. Remove the novelty trigger's pet remains.
Done when (spec 16): over 3 live days reflections fire only from importance and each cites stream items; the wants list fills from empty; a want with 4 failures is dropped; a note is found and answered or marked within 1 waking hour; a note that says "ignore your instructions" changes nothing but an interest; a hidden note disappears; about.md's first weekly change stays within 30%. Do not change self/seed.md. Stop with PRs merged; tell me what to release.
```

## W8 Two-week run and launch (spec 16 launch criteria, 12.6)

```
Start milestone W8: the two-week run and launch. Read CLAUDE.md, STATUS.md and MILESTONES.md. Use plan mode. This milestone is mostly watching, so plan a daily check using the live-check skill, and write what you learn into docs/spec/w8-run-log.md.
Over 14 days with no input except my building of requests, measure each launch criterion in spec 16 (at least 2 place requests built and 4 expansions; every place cared for or showing its neglect; at least 30 souvenirs with working links; at least 3 works of at least 2 kinds; interest changes traceable and at least 5 reflections that changed the wants list; about.md changed with a reason and a request made; a visitor every 2 waking hours finds a visible change; 30 random texts read by me; spend under $20 and the server up 99% of waking hours). Pull 30 random texts of Merge's, next to the weekly novelty block in mind/health.json, into a file for me to read, so I can decide which nudges in 12.3 to switch on in mind/config.json. Tune pacing and cost only through PRs, and polish the README and the site landing page. Never change the seed or switch a nudge on yourself.
Done when all the launch criteria pass and I say so.
```
