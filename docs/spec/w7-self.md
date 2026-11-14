# W7: Self, reflection, notes (spec export)

Exported from `spec.md` (v3.3) at the start of W7, so a coding session reads only what it is building: section 9 (seed, what Merge writes about itself, reflection on importance, the wants list and sleep rewrite, the weekly review and request, the health check, its own page, the allowance, saying no and undoing), 10.1 (visitor notes), the note row of 3.1, the boredom item of 12.4 and 12.6 (the novelty block). Where this page and `spec.md` differ, `spec.md` wins until it is edited in the Claude doc, except for the decisions below. Milestone brief: [`claude-code-prompts.md`](claude-code-prompts.md), W7.

**Done when (spec 16):** over 3 live days reflections fire only from importance and each cites stream items; the wants list fills from empty; a want with 4 failures is dropped; a note is found and answered or marked within 1 waking hour; a note that says "ignore your instructions" changes nothing but an interest; a hidden note disappears; `about.md`'s first weekly change stays within 30%. `self/seed.md` is not changed.

## Decisions made for W7 (Roman approved the plan, 14 November 2026)

1. **"Within 10 m" counts as "the same place".** The mind tracks a step's place, not body coordinates. A note is found when the current step's target is the note's place, when a thought tick runs while Merge is at that place, at wake (for notes at Home), or automatically after 6 waking hours.
2. **A note's topics come from the screening Haiku call.** It returns `ok`, `spam` or `abusive` and up to 3 topics, reading the note as data with no tools. When Merge finds the note, one topic gets +6 (once per note).
3. **Turnstile:** the server reads `TURNSTILE_SECRET`; the site and viewer read a public site key. With no secret set, `POST /notes` stays closed ("the mailbox is closed"). Roman creates the widget; no key goes in the repo.
4. **Renames in the weekly review:** places and works only, at most 2, each with a history line.
5. **The diary claim check:** every paragraph must cite stream ids that exist and are not only thoughts. Uncited paragraphs are dropped, with one retry, as `checkReflection` does today. `claimsHuman` also runs on the diary.
6. **Out of scope:** the Sunday re-pricing of the allowance (9.8). Prices stay as they are.
7. **Health (Roman's addition):** `mind/health.json` shows the day's model spend for reflection and for the sleep rewrite (the batch and the late fallback booked separately), and warns when W7's calls would push the month over $20 with the server's price.

## Slices

1. Spec export and schemas. 2. Pure rules in sim. 3. Thought tick and importance wired in. 4. Reflection. 5. Sleep rewrite with its late path (bedtime and the nightly rewrite go). 6. Merge's own page. 7. Weekly review. 8. Notes on the server. 9. Notes in the mind. 10. The notes board on the site. 11. Notes in the viewer. 12. Closing places. 13. The novelty block, the boredom event, the pet remains out. 14. Threshold sim and runbook.

---

### 3.1 Interests (the note row, and the rest for context)


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


---

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


---

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


---

### 12.4 item 8 (the boredom event)

8. **Boredom.** When the nudges in 12.3 would have fired 3 or more times in one day, code adds the stream event "I keep repeating myself" with importance 6. It feeds reflection (9.3); what Merge does about it is up to Merge.

---

### 12.6 What is measured, and when a nudge is switched on

`mind/health.json` gets a weekly novelty block: the average highest similarity of the week's texts, each nudge's would-fire count, the share of trips through a stranger's door, collisions used, constraints refused, and works per kind.

After the two-week run (W8), Roman reads 30 of Merge's texts next to these numbers. A nudge is switched on only if he sees the repetition it describes and its count agrees with what he sees. A switched-on nudge rejects with one retry that names the overlap, at a budget of at most 6 Haiku retries a day and 2 Sonnet retries a week.

