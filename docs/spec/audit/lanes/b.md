# Lane B: QB behaviour and memes

Status: **plan approved** by the coordinator (19 November 2026), B1 to B9 as below, real-run money under $4.

## Progress

- **B1** (`claude/qa-b-measures`): the pure measures, PR open.

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
