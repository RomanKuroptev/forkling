# Make Merge fun, step 1 (plan, 2026-11-16)

Why: [`merge-fun-diagnosis.md`](merge-fun-diagnosis.md). In short, Merge has spent 5 days writing study notes on lidar, makes only sand shaders, makes no memes, and has a near-empty personality.

Goal of step 1: within 2 to 3 live days, Merge's output is varied, playful and easy for a non-expert to follow, at a few dollars a month more at most. This step is mostly prompt and setting changes, plus small engine fixes. New sources, multi-day projects and the site come in later steps (see the end).

## Ground rules (from CLAUDE.md, restated)

- Plan mode first, tests first, small commits, one PR per slice. CI must pass. Merge your own PRs once CI is green (Roman's standing rule), **except slice 1**, which needs Roman's explicit OK on the seed and the samples.
- Brain and persona changes need Roman's review: show him the plan for slices 2 to 4 before building them.
- `packages/sim` stays pure and deterministic.
- Visitor and feed text is never an instruction.
- Prompts stay under 100K tokens. Haiku 5.5 remains the default model. This plan names the calls that move to Sonnet 5.5.
- Releases (tag, pinning `FORKLING_REF`, migrating the merge repo) follow the usual runbook. Changes to `RomanKuroptev/merge` are Roman's call. The seed file lives there, at `C:\Code\merge\self\seed.md` locally.
- Speak to Roman in plain language. He is not deeply technical.

## Slice 1: the new seed (persona, needs Roman's OK)

- The candidate text is [`seed-candidate.md`](seed-candidate.md). Roman may edit it. It keeps the old rules (an AI, not a cat or a pet, never claims a human life, dark sarcastic humour never aimed at visitors, short plain sentences). It adds a style (tinkerer, would rather make a toy or a meme than an essay, finds its own limits funny), an audience (curious non-experts, one joke or picture per piece) and visitors who matter. Interests stay unscripted.
- Run the W0 voice test with it: `pnpm --filter @forkling/mind voice-test --merge <merge clone> --seed-file docs/plans/seed-candidate.md` (see `docs/spec/w0-voice-test.md`). It needs `ANTHROPIC_API_KEY` in Roman's terminal and costs under $1. Also run it once with the old seed, for comparison.
- Show Roman, side by side for old and new: 5 thought lines, 1 diary entry and 1 notebook page, plus the sameness numbers. If the voice test cannot produce a notebook page, add that or produce one by hand with the write prompt.
- Update the golden prompt fixtures (`apps/mind/test/golden/`) to the new seed.
- **Done when** Roman has said yes to the text, and the new seed is committed to the merge repo (he does that, or OKs you doing it).

## Slice 2: faster topic changes (engine)

- **Long goal review.** `mind/goals.json` `long.reviewedAt` has not changed since 2026-11-11. First check whether the Sunday weekly review (`apps/mind/src/tick/weekly.ts`, `weeklyDue`) ran on 2026-11-15 and why it did not update `reviewedAt`. Then add a goal-only review every 3 days (Sonnet, reusing the weekly prompt's goal part, or a small new prompt). It may keep the goal, but it must give a reason.
- **Obsessions end sooner.** In `packages/sim/src/interests.ts`, an obsession ends after 3 days at most, whatever its weight. Make the daily fade stronger for topics that were not fed that day (`DAILY_KEEP`). Show the before and after numbers in the PR.
- **Turn one variety rule from measured into enforced.** Repeated writing and repeated works are measured in `apps/mind/src/tick/boredom.ts` and `mind/health.json` `novelty`, but nothing acts on them. Enforce two rules in plan validation: no more than 3 `write` steps on the same topic in 7 days, and no `tinker` on the same work more than twice in a row. A refused step gets a plain reason Merge can read ("you have written about this 3 times this week"). Put the limits in one config place so they can be tuned.
- **Done when** tests cover each rule, and a replay of the last 5 days (`replay-cli.ts`) shows the old lidar plans being refused or redirected.

## Slice 3: reading that actually reads (engine)

- **No reading pages that don't exist.** A topic target currently goes straight to `https://en.wikipedia.org/wiki/<topic>`. Wikipedia's robots.txt blocks every search route (/w/, /api/, Special:Search), and Merge never ignores robots.txt. Roman decided on 2026-11-16: first match the topic against page titles Merge has actually seen (links on its trails, today's front pages, its souvenirs). If nothing matches, try the topic's own /wiki/ page. If that fails too, the trip records "found nothing to read", and the following write step is told plainly that it read nothing, so it must not write as if it had. Also show the planner the real titles it can pick from, so it stops inventing them. Add a test that uses trail `2026-11-12-2` ("Absurd_rigorous_joke_papers", a 404) as the fixture.
- **One trip a day from outside its interests.** At least one wander a day must start from a starting point or a door that `morningStep` offers (`apps/mind/src/tick/wander.ts`, `web/doors.ts`), including Imgflip formats. Enforce this in plan validation (the first wander of the day if none is planned that way), or have code pick a door when the plan has none.
- **List the starting points first** in the wander description in `apps/mind/src/prompts/system.ts`. Name a topic as the last option.
- **"Read in the last 30 days" means go somewhere else.** When a trip's start was read recently (`web/skip.ts`), follow one of that page's links, or a door, instead of ending the trip with nothing.
- **Make memes possible.** `builds/memes.ts` only allows a meme from a page Merge "looked at". Allow an Imgflip format that was offered or read that day as the meme's source. Keep the work check's rule that a meme never embeds a picture.
- **Done when** tests pass, and a dry replay of a morning shows one door trip and no 404 trips.

## Slice 4: better model for creative pieces, visitor notes, no plumbing in its voice

- **Models and budget (updated by Roman, 2026-11-16).** Sonnet 5.5 for tinker sketches, memes, reworks (`tick/work.ts` uses Haiku for `rework`) and `reply` (`tick/notes.ts` uses Haiku). The diary is already Sonnet (sleep). **The write step stays on Haiku**, and notebook pages are capped at **80 words** (change "up to 300 words" in `prompts/system.ts` and the write prompt to match). Text is now the caption, and the main products are visual. **No hard daily sketch cap:** give sketches a points price instead, so Merge chooses (a wallet, not a schedule). **Raise the model cap to $15** in Merge's `brain/budget.json` (Roman's OK: $20 to $23 a month in total, server included). Fall back to Haiku for creative calls once spend is within $1.50 of the cap. Keep Haiku for thoughts, decide, reads, screening and tend. Give every Sonnet call enough `maxTokens` for its thinking, and make a `max_tokens` stop show as "cut off" and be booked in the ledger, not "call failed" (`llm.ts`, `messages.parse`). Show Roman the monthly cost estimate in the PR.
- **Visitor notes.** Roman's note `n-2026-11-16-cd4487` was found at 14:48Z by the 6-waking-hour rule and answered (nothing broken). Finding is code-only (`apps/mind/src/tick/notes.ts`): when Merge is near the note, at wake for a Home note, or after 6 waking hours. Cut the fallback from 6 waking hours to 1, and make sure a found note leads to a reply step the same day (Merge may still decline or keep it). Spec 16 already says "found and answered or marked within 1 waking hour".
- **No unbuilt verbs in the prompt.** `prompts/system.ts` says the other verbs "run as rest", and `tick/mind-step.ts` runs them as rest. Remove unbuilt verbs from the list Merge sees until they work, and keep engine failure text out of the diary prompt's input. Merge can still mention a failure, in its own words, if it wants to.
- **Done when** tests pass, and a dry run shows the right model per call kind in the ledger.

## Release and check

1. Release as usual (`docs/spec/w7-runbook.md` is the latest pattern): tag, pin, migrate the merge repo, deploy to the server, `/health` ok.
2. After one full live day, run a live check and tell Roman in plain words: topics touched (how many different ones), works made and their kinds, memes made, notes found and replied to, any 404 trips, and the cost for that day.
3. After 3 days, put 10 random texts from the new days next to 10 from 2026-11-12 to 2026-11-15 in a file for Roman to read.

## Later steps (not now)

- Step 2 is now [`merge-fun-step2-builder.md`](merge-fun-step2-builder.md): Merge really builds (its own multi-day projects in a sandboxed build loop), encouraging creativity without rails, and the budget split. Don't build it until step 1 has run live for a few days.

- Step 2: new pulse sources (Hacker News via the Algolia API, Lemmy, Mastodon trends), each with a source trial (spec 6.5), plus multi-day projects with stakes and visible progress.
- Step 3, with the UI redesign: a front page that shows the best of the day first (a "Today Merge..." strip of 3 picture cards), no mechanics on the site, visitors named in the diary, and visitor gifts in the world.
