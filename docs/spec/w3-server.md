# W3: the server

Exported from [`spec.md`](spec.md) (v3.3) on 12 November 2026 for milestone W3. Where the spec gives a number, the number is the rule. Sections: 2.2, 10.2, 11.2, 11.3, 13 and 14.3. The slice plan is at the end.

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

### 10.2 The build job

The server's build worker runs these kinds, one at a time, with the same code `build.yml` runs today; its results land as pull requests checked by `validate.yml`. The build worker arrives with the server in W3 and gets its first job (a work) in W4 and its first place job in W6.

| Kind | Model | Writes | How it lands |
|---|---|---|---|
| expand, found | Sonnet, one structured call | `places/<id>.json`, `wishes/` | Data PR, auto-merge after `validate.yml` |
| tinker | Sonnet, one call plus at most one repair | `works/<id>/` | PR; auto-merge after the check **(pending decision 2)** |

The Claude Code Action and coded Pages projects from M7 are retired; tinker replaces them at a fixed, known cost per build. As today, the job reports back only through `mind/builds/<id>.result.json`. The Monday kit-part build of version 2 is in Later. Since version 3.2 the found build runs only as the fallback in 10.3.

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


## 13. Budget

The expected cost is $17.36 a month: $10.36 for models and about $7 for the server, which leaves $2.64 under the $20 cap. **(v3: version 2 was $19.95.)** The margin exists to cover the two things this table cannot know yet, listed under it.

Prices: Haiku 5.5 $0.10 in / $0.50 out per million tokens (prompts under 100K), cached input at a tenth of the input price; Sonnet 5.5 $2 / $10; Message Batches half price. Server: Contabo Cloud VPS 4 (4 vCPU, 8 GB, 100 GB SSD, Hub Europe) at €6.88 a month including VAT on a 1-month term, plus a one-off €2.50 setup fee (Roman's order, 12 November 2026; version 3.3 assumed a Hetzner CX23 at €5.99). Token figures are averages for the answer itself.

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
| Server | Contabo Cloud VPS 4 (€6.88 incl. VAT) |  | 1 |  | about 7.00 |
| **Total** |  |  |  |  | **17.36** |

**What the table does not include (v3):**

- **Thinking tokens.** Both models think before answering and bill that as output. Haiku's thinking is switched off for the low-effort rows (allowed at that level); Sonnet's cannot be switched off. Each Sonnet call's output limit is set to twice the answer size in the table so thinking cannot cut the answer short. The real cost is measured from the ledger in W3 (Haiku) and W4 (Sonnet) and this table is corrected then.
- **VAT and exchange rate on the server.** The price is €6.88 a month including VAT (1-month term, €2.50 one-off setup fee). The table's "about 7.00" is a rounded dollar guess and the default `serverUsd` of 7.49 stays as a cautious upper figure: Roman converts the real euro price and sets `serverUsd` in Merge's `brain/budget.json`, and the model cap below follows it.
- **A late sleep rewrite** run as a normal call costs twice as much that night (at most $1.05 more in a month if it happened every night).

**Added in version 3.1:** sketches (30 a month, Haiku, medium effort, about 6K in and 3K out) cost $0.06, and looks (600 a month, Haiku, low effort, about 2K in and 200 out) cost $0.18. That takes the total from $17.36 to **$17.60**.

If the corrected total passes $19, the first cuts are, in order: thought ticks to every 3 and 8 minutes, the daily allowance from 150 to 130 points, reflections to 1 a day.

- **Guard:** the existing `brain/budget.json` ledger and guard, now in the server loop. The model cap is $20 minus the server's real monthly price. Before every call the guard estimates its cost from the prompt size and output limit; if the month's spend plus the estimate would pass the model cap, the call is not made.
- **Pace:** if spend is more than 15% ahead of the month's pace, the health file warns, thought ticks slow to every 10 minutes, and tinker and expand wait until the pace is back.
- **Prompts:** every prompt stays under 100K tokens; the seed and the kit summary go first so they cache, which the thought tick keeps warm.
- **Free:** Pages hosting, GitHub Actions minutes for validate, pages and the watchdog, all fetches, Cloudflare Turnstile, the dynamic DNS name and the HTTPS certificate.
- The eye cam's vision calls stay retired.

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

## Slice plan (one PR each, tests first, merged after CI)

Done when (spec 16): thought ticks run on time within 10 seconds; 3 live days on the server with no health warnings; the watchdog fires once in a test stop; the ledger's Haiku rows are compared with section 13 and the table corrected. The live parts are Roman's: W3 ends with the runbook, not with a server.

1. **Effort levels and stop reasons.** Effort per call kind (`effortFor` in `llm.ts`: medium for morning, decide, bedtime and weekly, low for the rest). Haiku at low effort sends `thinking: {type: "disabled"}` (Haiku 5.5 accepts it at effort `high` or below); Sonnet's thinking is left alone (it cannot be disabled; only `between_tools` turns off up-front thinking). A refusal or an answer cut off at its output limit is a failed call: `stop` on the tick-log call, `refusals` and `cutOff` in `mind/health.json`, a warning at 3 cut-offs a day, no retry with the same input. **Live change:** decide and morning calls move from low to medium effort.
2. **The budget cap and the pace rule.** `serverUsd` in `brain/budget.json` (default 7.49); the ledger refuses a model cap plus server price over $20, and a new world's cap defaults to $12.51 (`modelCapUsd`). `paceAhead` (more than 15% ahead of the month's pace) replaces the $0.50 warning and will slow the thought tick (slice 3). An existing file keeps its `capUsd` of 10 until Roman raises it, so there is no silent live change; the raise is his call at the W3 release, with the real server price.
3. **The thought tick.** `packages/sim/src/thought.ts` (interval, 5-failures pause), the Haiku call, its schema, 140-character lines, importance scores, the replan limit.
4. **The loop.** `tick/loop.ts` with an injected clock (each reflex tick is `runTick` against the disk, so the disk is the live state; a change from the first plan, which held it in memory); `tick/git.ts` (add, commit, pull with rebase, push; `push failing` after 3 failures); `now.json`.
5. **The server and the build worker.** `server.ts` (`GET /now.json`, `GET /health`, `POST /notes` closed until W7, CORS for the Pages origin only), `build-worker.ts` (idle), `serve.ts`.
6. **Deploy files, the watchdog and the runbook.** `deploy/` (systemd unit, Caddyfile, setup and deploy scripts), `deploy.yml`, the template's `watchdog.yml`, `w3-runbook.md`.

Stop after slice 6: no tag, no server, no change to `RomanKuroptev/merge`.
