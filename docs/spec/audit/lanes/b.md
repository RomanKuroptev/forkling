# Lane B: QB behaviour and memes

Status: **plan approved** by the coordinator (19 November 2026), B1 to B9 as below, real-run money under $4.

## Progress

- **B1** (#274): the pure measures.
- **B2** (#278): `--capture-prompts`, scripted fakes.
- **B3** (`claude/qa-b-score`, stacked on B1): `pnpm qa score`. Scored on R2 (`C:\Code\forkling-qa-data\r2\`):

  | Score | R2 |
  |---|---|
  | Topic variety | 63 clusters, the biggest 10% |
  | Topic runs | 2 days |
  | Repeated words | **ALARM** "loop" in 10 of 26 titles and captions (38%) |
  | Kinds made | 4 kinds of 19: tool 7, art 6, project 4, sound 2 |
  | Something new at each look | **ALARM** 12 of 14 looks |
  | Visual every day | 7 of 7 |
  | Rest | **ALARM** 25, 24, 25, 24, 18, 42, 56% (19 to 25 November) |
  | Repeated lines | 0 of 227 |
  | Plans turned down | 13, most in a day 4 |
  | Rails, money | 0 crashes, 0 rails; $1.34 of $3, dearest session $0.05 |
  | World shape, projects | 2 founds or expands; 4 projects, all done |

- **B4** (`claude/qa-b-memes`, stacked on B3 with B2 merged in): `apps/qa/src/behaviour/memes.ts`, the eight steps, as one more check in `scoreRun`. On R2 it says: **memes stop at step 4, "chosen"**. Imgflip formats were reached 6 times and read 5 times. Step 3 is unknown because R2 kept no prompts, and no plan step or work ever was a meme. The B8 real run with `--capture-prompts` will measure step 3. The end-to-end test (`apps/qa/test/behaviour/meme-e2e.test.ts`) makes a meme through the real loop with scripted fakes and a fake web with one Imgflip format, so the machinery works.

  Also seen in the R2 files: the one full-size tinker on 22 November failed with "Streaming is required for operations that may take longer than 10 minutes" (`mind/builds/tinker-20261122-1434.result.json`). That is an engine bug for B4's "made" step or lane T's triage.

- **B5** (#286): the web snapshot. 62 answers, 3.7 MB, with every source on the list; record with `pnpm qa web-snapshot`, replay with `fast-forward --web-snapshot`.
- **B6**: `pnpm qa behaviour` and `pnpm qa compare`. The planted fakes (`same-topic`, `no-memes`, `rest-40`) each raise their alarm and `plain` raises none of the three. **Live, Merge's last 7 days (13 to 19 November, scored from a fresh read-only clone):**

  | Score | Live |
  |---|---|
  | Topic runs | **ALARM** 4 days (13 to 16 November) |
  | Kinds made | **ALARM** 3 kinds of 16: art 12, game 3, tool 1 |
  | Something new at each look | **ALARM** 13 of 14 |
  | Rest | **ALARM** 28% and 26% on 13 and 14 November |
  | Repeated lines | **ALARM** 833 of 1447 (58%); for example "Still drifting. The lidar reading lingers..." 19 times on 13 November |
  | World shape, projects | **ALARM** no found, expand or project in 7 days |
  | Memes | **ALARM** stop at step 2: no Imgflip format read in 7 days |

  On fakes, the captured planner prompts show the engine never offers a meme to the planner as something to make. Step 3 measures 0 of 24, and the word appears only in the seed line ("answer it with your own memes, sketches and toys").
- **B7** (#292): the behaviour reviewer agent. **Acceptance run on R2** (20 November, run as a general agent with the agent file's instructions, because the agent was merged after the session started). Its summary:
  - Merge is mostly fun to follow, more than live: 19 things of 4 kinds, 4 projects done, a found and an expand, and a funny, honest voice ("I said I would show the toy again, which is five times now", `journal/2026-11-24.md`). It sags from 23 November.
  - **The rising rest has a cause.** From 22 November its long goal and want w3 are "show the counter toy to a visitor" (`mind/goals.json`, `mind/wants.json`). That is the subject of 36 of 37 thoughts on 24 November. Its rest steps say "wait beside the toy". A fast-forward has no visitors, and even live Merge cannot see views. It asked Roman for a view count on 22 November (`self/requests/2026-11-22.md`).
  - **The mood word "tired" is read as the tired limit.** From about 15:00 UTC the mood word is "tired" (energy below -0.1), and Merge plans "I am tired, so no tinker". The code's limit is -0.5, which was never reached. So evenings make nothing.
  - **The planner is never offered a meme** (`prompts/system.ts`). The kind "meme" is only in the tinker prompt (`builds/tinker.ts:87`). This agrees with the code's step 3.
  - **Harness, not Merge:** the fast-forward reads the same front pages every simulated morning, so from 22 November most trips start at a page "read in the last 30 days". The "loop" run is Merge's own interest, and it ended it itself ("Do not write about loops again", plan for 23 November).
  - Findings: `unshowable-want` (major, roman: build the view count it asked for, plant visitor looks in the fast-forward), `tired-word` (major, prompt), `meme-not-offered` (major, prompt), `stale-starting-points` (minor, code), `loop-run` (info), `diary-cut-midsentence` (minor, code: diary lines cut at 140 characters, `sim/self-text.ts:80`).
- **B9** (#295): `qa-behaviour.yml`, and the fix for seed worlds inside the checkout.
- **B8**: the three scored side by side. A real 7-day run on `day-0` with 2 seeds (20 November, run side by side, `--sessions --capture-prompts --web-snapshot`, $1.50 cap a seed): **seed 0 stopped at its cap after 5.7 days ($1.52), seed 1 passed all 7 days ($0.90); $2.42 in all, 0 crashes, 0 rails broken.** Folders: `C:\Code\forkling-qa-data\b8\seed-<k>\` (world, out with `prompts.jsonl`, run.log). `pnpm qa compare --snapshot day0-seed-0=... --snapshot day0-seed-1=... --real r2=... --real live=...`:

  | Score | day-0 seed 0 (snapshot) | day-0 seed 1 (snapshot) | R2 (real web) | Live (real web) | Likely cause |
  |---|---|---|---|---|---|
  | Repeated words | **"thue" 55%** | **"thue" 38%** | **"loop" 38%** | "light" 16% | Merge's choices (or the prompts) |
  | Rest | **26% on day 1** | **27% one day, 25 to 27% most days** | **42%, 56% at the end** | **28%, 26%** | Merge's choices (or the prompts) |
  | Something new at each look | 12 of 12 | **13 of 14** | **12 of 14** | **13 of 14** | Merge's choices |
  | Memes | **stop at step 3: offered to the planner in 0 of 61 prompts**, formats read 8 times | 1 meme made (chosen inside a sketch; the planner was offered none, 0 of 56) | **stop at step 4** (no prompts kept) | **stop at step 2** (no format read) | the prompts: the planner is never offered a meme |
  | World shape | 1 found or expand | **none** | 2 | **none** | Merge's choices |
  | Projects | **1 project, 11 sessions, not done** | 1, not done | 4 done | **none** | Merge's choices |
  | Topic runs | 2 days | 2 days | 2 days | **4 days** | live only |
  | Kinds | 3 kinds | 5 kinds | 4 kinds | **art 12 of 16** | live only |
  | Repeated lines | 0% | 0% | 0% | **58%** | live only |

  **What this says.**
  - Drifting onto one subject happens on the snapshot web and on the real web alike: "thue" (an esolang, read on the snapshot's Esolang pages) and "loop" on R2. So it is Merge's choices, or the prompts that keep feeding a subject back, not the web.
  - Rest at about 25% is in every run. The reviewer's cause on R2: Merge waits beside a toy for a visitor who never comes, and it reads the mood word "tired" as the tired limit.
  - Memes: the planner is never offered a meme, in any prompt captured (0 of 61 and 0 of 56). A meme still came once, chosen inside a sketch call. So memes are possible but left to chance.
  - "Live only" rows (repeated lines, 4-day topic run, art 12 of 16) come from Merge's live world on older engines (13 to 19 November, before R2's fixes). They are not a web effect. The compare's "real web" label for them means only "not seen on the snapshot".
  - Harness note: the snapshot is the same web every morning, as the real web is within a fast-forward (the reviewer's `stale-starting-points`). From the third day, many trips start at a page read in the last 30 days.
  - **Fixed in this PR:**
    - Step 3 counted 2 of 61 prompts as an offer, because Merge's own plan in JSON said "the meme trip, a page, a rest and a sketch". Only the engine's own text counts now, not data blocks or JSON.
    - The 30-day fake run on Actions (run 44568491802) stopped after 7 days at the fake run's $1 cap. The fakes cost nothing real, so their run cap is now $100.

## The R2 run (facts 3 and 4)

Found on Roman's PC, so no new real run was started and nothing was spent. The coordinator copied it somewhere durable, outside the repo and not committed:

- Summary and run report: `C:\Code\forkling-qa-data\r2\ff-r2a-out\` (`summary.md`, `run-report.txt`, `shots/`)
- World copy (no remote, engine 9c04e8651bda, 2026-11-19 to 2026-11-25, $1.34): `C:\Code\forkling-qa-data\r2\ff-r2a-world\`

Lane W uses the world copy for `day-7`.

## Web snapshot format (B5, proposed by lane S, agreed)

`qa/web-snapshot/manifest.json` is `{version, takenAt, engine, userAgent, entries[], sources: {<id>: {items}}}`. Each entry is `{url, host, source, status, contentType, file, bytes, sha256}`, where `source` is an id from `qa/sources.json`. Bodies go in `files/<first 16 hex of sha256>.<ext>`. robots.txt is one entry per host. A failed request is an entry with no file. Only allowed URLs go in, and the whole snapshot stays under about 5 MB.

## What I found while reading (it shapes the meme steps)

- A meme is not a plan verb. It is a **kind** chosen inside a sketch or tinker call (`apps/mind/src/builds/tinker.ts`: "Kinds: art, game, tool, sound, zine, meme"). Its sources are checked by `verifyMemeSources` against `memeSeeds` from the trails.
- No decide or morning prompt builder in `apps/mind/src/prompts/` mentions memes. So step 3, "seen by the planner", is likely where it stops. The harness has to find that from the captured prompts on its own. I will not assume it.
- The `--dry-run` fake web answers 404 to everything, so the fakes can never make a meme today. The meme test and the fake runs need a web that has Imgflip in it, which is the web snapshot.

How the eight steps map onto the code (I will write this in `docs/decisions.md`):
1 offered: an Imgflip start in the morning list or in a trail start. 2 read: `memeSeeds(...).formats` is not empty, counted per day from the trails. 3 seen by the planner: the decide or morning prompt says "meme" and has a format in it, from `prompts.jsonl`; live runs give `unknown`, never 0. 4 chosen: a plan step whose target or reason names a meme, or a sketch or tinker answer with `kind: "meme"`. 5 allowed: the plan check and `verifyMemeSources` did not turn it down, from the tick notes. 6 made: the call parsed. 7 passed the work check: from `mind/builds/*.result.json` and the work's meta. 8 shown: a `works/<id>` with kind meme that is finished and listed in the site files.

## PRs, in order (tests first in each)

**B1 `claude/qa-b-measures`: pure measures in `packages/sim`.**
New `packages/sim/src/behaviour-measures.ts`, built on `topicClusters`/`contentWords` (topic-cluster.ts) and `maxSimilarity` (novelty.ts), with no second version of either: `topicRuns` (longest run of days with the same top cluster), `topWordShare` (most common content word across titles), `repetitionShare` (lines over 0.6 similar to one of the last 5), `restByDay` and `restRising` (share and run of rising days), `somethingNewAt` (for each 10:00 and 18:00 check, whether something was made since the last one), `kindShares`. Numbers in, numbers out: no clock, no files.
Test first: `packages/sim/test/behaviour-measures.test.ts`, one case per measure plus the edge cases (empty input, a single day).

**B2 `claude/qa-b-capture`: prompt capture and scriptable fakes in `apps/mind`.**
`--capture-prompts` on the fast-forward: a wrapper around the `LlmClient` that writes one line per call (time, kind, model, system and user text, parsed or not) to `<outDir>/prompts.jsonl`. It refuses an `outDir` inside the world. `fakeModel` takes per-kind answers (`answers: { decide: (req, n) => ... }`) on top of today's default answers, and keeps every prompt (`calls` already exists). With no options it behaves exactly as now, so `--dry-run` is unchanged.
Tests first: `apps/mind/test/fast-forward-capture.test.ts` (a 1-day fake run writes `prompts.jsonl` with every call; an outDir inside the world throws) and the fakes test (a per-kind answer is used, the default stays the same).

**B3 `claude/qa-b-score`: `src/behaviour/score.ts` and `qa/behaviour.json`.**
`apps/qa/src/behaviour/read-run.ts` reads a fast-forward output folder plus its world, or a world clone alone (live). It reads the tick logs, plans, works, trails, projects, `summary.md` and `prompts.jsonl` if it is there, and turns them into plain data. `score.ts` calls the B1 measures and writes the scores of 9.2 that a run can give: topic variety, topic runs, repeated words, kinds, something new twice a day, visual every day, rest, repetition, plan rejections, money, rails, projects and world shape. Works in the world waits for lane W's world checks, and voice and notes say "not measured". A score that cannot be computed gives `qa.check-did-not-run`. Levels go in `qa/behaviour.json` as first guesses from the spec table. Command: `pnpm qa score <run folder | world>`.
Tests first: `apps/qa/test/behaviour/score.test.ts`, with small synthetic run folders made by a test helper (`makeRun`). Planted cases: every title about "loop" gives topic runs and repeated words; rest at 40% gives rest; a world with no file gives `qa.check-did-not-run`.

**B4 `claude/qa-b-memes`: `src/behaviour/memes.ts`, the eight steps.**
It counts the eight steps per run, as mapped above, and writes one finding that names the first step at zero with the numbers ("formats read 14 times, meme named in 0 of 96 decide prompts"). Step 7 also hands each finished meme's screenshot to the look reviewer as an `info` finding, so it can say in `/qa` whether it reads as a meme.
Tests first: the planted cases (synthetic runs that stop at step 2, at step 3 and at step 6; live data with no prompts gives step 3 `unknown`), and **one end-to-end test** in `apps/mind/test/` that runs the fast-forward for 1 day with the B2 fakes and a small fake web that serves one Imgflip format and its Wikipedia page. The fake decide picks a tinker, and the fake sketch answers `kind: meme` with sources from the trail. It asserts a meme passes all eight steps. That proves the machinery works.

**B5 `claude/qa-b-snapshot`: the web snapshot.**
`apps/mind/src/web/snapshot.ts`: `recordSnapshot` runs the real fetch code over the allowlist only (robots.txt respected, the normal gaps). It saves the start pages of each source and the pages they link to, up to a cap per source. `snapshotFetch(dir)` replays them, and anything not recorded is a 404. The fast-forward gets `--web-snapshot <dir>`, which replaces the fetch in a real or dry run; without the flag nothing changes. `pnpm qa web-snapshot` calls it and writes `qa/web-snapshot/` with an `index.json` (the date, and items per source). QS checks that it is fresh.
Tests first: replay gives back what was recorded and 404 for the rest; the recorder refuses a host that is not on the allowlist and a path robots.txt forbids (with a fake fetch). The first real recording is a separate commit in the same PR. It is reading only, with no model calls.

**B6 `claude/qa-b-runner`: `pnpm qa behaviour --fake|--real --days N --seeds K --cap X [--world <fixture>]`.**
It runs K fast-forwards one after another as child processes of the mind CLI. Each one gets a fresh copy of the fixture, a different `forkling.json` seed and start date (picked from a seeded PRNG), `--capture-prompts`, `--web-snapshot qa/web-snapshot` and `--out qa-out/behaviour/seed-<k>`. For `--fake` it uses `--dry-run`. For `--real` it needs `--cap`, and each seed gets cap/K. Then it scores each run and writes a combined report with the spread between seeds (min, max and the seed that tripped each alarm). `--live` scores a fresh read-only clone of `RomanKuroptev/merge`, last 7 days, made in a temp folder and never committed. Until lane W's `day-0` is merged, the stand-in from fact 5 is used (the template plus Merge's `forkling.json` and `self/seed.md`).
Tests first: the planted runs from fact 7 as fake scenarios through the real runner (`--fake --days 2`). The same topic every time, never a meme, and 40% rest each raise their own alarm, and a clean fake run raises none of the three.

**B7 `claude/qa-b-reviewer`: `.claude/agents/behaviour-reviewer.md` (Opus).**
It reads the summary, the run report, the diary, the work pictures, the scores and `prompts.jsonl`, and answers the questions of 9.3 with file and log lines. Its findings carry `fixKind` prompt, code or roman. It never proposes a rule on Merge, and this is written into the agent. This is not a Vitest test; its acceptance run on the R2 output is recorded here.

**B8 `claude/qa-b-compare`: score the three, then the report.**
I score the R2 output (free), the live last 7 days (free, read-only clone), and a fresh real run on `day-0` with 2 seeds for 7 days (`--real --days 7 --seeds 2 --cap 3`, a line in `spend.md` before it starts). `pnpm qa compare <run...>` puts the three side by side and says for each alarm where it comes from: the fake web (it shows only on the snapshot), the real web (it shows live and in R2, which read the real web, but not on the snapshot), or Merge's choices (it shows on all of them). The results go in this file and in `STATUS.md`. The code is small; the PR is mostly the run.

**B9 `claude/qa-b-actions`: `.github/workflows/qa-behaviour.yml`.**
It runs `pnpm qa behaviour --fake --days 30 --seeds 3` and uploads `qa-out/`. It has `workflow_dispatch` only, with the planned time as a comment (nightly). It never has `schedule:`.

B1 and B2 do not depend on each other. B3 needs B1. B4 needs B2 and B3. B6 needs B2, B3 and B5. Each PR updates the lane B line in the "Audit harness" section of `STATUS.md` and the progress here.

## Money

Only B8 spends: a $3 cap for 2 seeds of 7 days (R2 cost $1.34 for one seed). If B5's snapshot needs a real smoke run first, that is a 1-day, $0.50 cap. The total stays under $4 of the $10.
