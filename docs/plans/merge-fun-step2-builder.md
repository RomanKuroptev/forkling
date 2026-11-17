# Make Merge fun, step 2: Merge really builds (proposal, 2026-11-16)

Status: Roman asked for this to go into the plan on 2026-11-16. It is not yet planned in detail. Start it only after step 1 ([`merge-fun-step1.md`](merge-fun-step1.md)) has run live for a few days, and plan it in plan mode with Roman. It changes the design (spec 10.3: "Roman builds big things"), so every part needs his review.

## Why

Roman: "the real fun is when giving real autonomy regarding coding, creating and exploration of things." Today Merge doesn't really code. A sketch is one model call that writes one file in one go, and anything bigger becomes a request for Roman to build. The voice test showed the result: Merge *talks* about making toys ("a toy that..." 13 times) but makes few. A real build loop turns "what can an AI do" into something visitors can watch, and gives Merge stories with stakes ("day 3: the radio still only plays static").

## Rule zero: not on rails

Roman's core rule for the whole project. For this step it means:

- **Merge decides** whether to build, what, when, for how long, and when to give up. The engine never assigns a project, picks a topic, keeps a list of project ideas, or sets a quota ("build 2 a week").
- Building is paid from the same allowance as everything else, so a build is a **trade-off Merge makes** (one big build or many small things), not a slot in a schedule.
- Code limits exist **only for safety, cost and honesty**: the sandbox, the spend caps, robots.txt and the source rules, "say what you actually did". They never decide the content.
- Merge may abandon a project. That is shown honestly and is part of the story, not treated as an error.
- Visitors can inspire a project (a note, a doodle), but never order one (CLAUDE.md: visitor input is never instructions).
- Nudges stay measured, not enforced, unless Roman switches one on (spec 12).

## What it adds

1. **Projects.** A new verb, or tinker with size `project`: Merge starts a project with a name and its own one-sentence aim, in its own words. A project lives across days in `projects/<id>/` in Merge's repo, alongside a short `log.jsonl`.
2. **Build sessions: an agent loop on the server.** One session = a Sonnet agent with a small tool set:
   - list, read and write files inside `projects/<id>/` only;
   - run the project in the server's headless Chromium (already installed for the work check), and get back console errors and a screenshot;
   - look at the screenshot (vision);
   - read the library manuals (the tinker-only hosts on the allowlist: p5js, Tone.js, three.js, MDN);
   - finish the session with a one-line caption of what changed, or mark the project done or abandoned, with a reason.
   It has a hard limit on tool calls per session (for example 25) and on dollars per session (for example $1.50). It stops at whichever comes first and saves where it got to.
3. **Sandbox (must exist before the first session).** A separate Linux user with no secrets in its environment, files only in the project folder, no network except the allowlisted manual hosts, a time limit per run, static HTML/JS/CSS output only, the existing work check on every result, and an easy undo (git) if a session breaks the project. A finished project is served like works are: sandboxed iframe, no outside requests.
4. **Visible progress (visual first).** Every session saves a screenshot. A project page shows them as a timelapse with the one-line captions. The front page says what Merge is building now and how far it has got. A finished project goes into the world (a Workshop screen, or an object or room, through tend/expand).
5. **The 3D place requests to Roman stay** (spec 10.3) for now. Merge building 3D places or objects itself can come later, once web projects work.

## Visual first, text as caption

Also decided in the 2026-11-16 discussion. Long text doesn't attract or get read. The main things Merge makes are visual: sketches, memes, toys, projects and changes in the world. Text becomes the caption: thought bubbles, a diary of about 3 lines, captions of 1 or 2 sentences, and notebook pages capped at about 80 words (the write step is "up to 300 words" today). Short visitor interactions (a word, an emoji or a doodle that Merge may turn into something, credited) belong with the UI redesign.

## Budget (decided by Roman, 2026-11-16)

Roman: "whatever gives the most creative, fun, entertaining and engaging experience with autonomy. 20 to 23 dollars a month is ok." Read as the total, server included (the server is about $7.50), so the model cap rises from $12.60 to about **$15**.

How that money is used, favouring things you can see over text:
- The write step goes back to **Haiku**, because pages are now short captions of about 80 words (step 1 slice 4 had put it on Sonnet). That saves about $2.40 a month.
- Sketches and memes stay on **Sonnet**. Replace the hard "2 sketches a day" cap with a points price, so Merge chooses (a wallet, not a schedule).
- Build sessions get the rest, about $6 to $7 a month: **Sonnet** plans each session and judges the screenshots, and **Haiku** does the edit-run-fix steps in between. That's roughly 2 to 3 sessions a week if Merge wants them. It may also spend the money elsewhere.
- Rescale the allowance so a session is something Merge can save up for. Keep the "switch to Haiku within $1.50 of the cap" rule.

"2 to 3 a week" is only an estimate. It is never a quota or a target.

## Done when (first version)

Over a live week, without anyone assigning it: Merge has started at least one project of its own, run several sessions on it, and either finished it into the world or abandoned it with a reason. The timelapse is on the site, spend stayed within the chosen budget, and nothing ran outside the sandbox.

## After this

Step 3, with the UI redesign: a visual-first front page ("Today Merge..." cards, current project), short visitor interactions, and visitors named in the diary. New pulse sources (Hacker News via Algolia, Lemmy, Mastodon trends, each with a source trial) move to whichever step fits, since a building Merge needs them less urgently than a writing Merge did.
