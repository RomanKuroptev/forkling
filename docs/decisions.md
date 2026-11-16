# Decisions

Dated log of choices that shape the project, newest first. Add an entry when a decision is made, with the reason. Dates are from the commit that introduced the decision.

## 2026-11-16: Reading that actually reads (make Merge fun, slice 3)
All 20 trips began as Merge's own interests typed in as Wikipedia titles. Several were 404s ("Absurd_rigorous_joke_papers", "Multi-directional_shading"), and it then wrote pages as if it had read them. So:
- **No search, no invented addresses.** Wikipedia's robots.txt disallows every search route (`/w/`, `/api/`, `/wiki/Special:`), and Merge never ignores robots.txt. A topic is matched with the titles of pages Merge has really been shown links to (a ring of the last 100 in `mind/state.json`: `seen`), then tried as the Wikipedia page of that name. If neither is a page, the trip says "found nothing to read".
- **The write step is told what it read.** Before, it never saw trails. Now it is shown the pages it really read (in a data block), or told plainly that it read nothing ("Do not write as if you had read about it"), or, for a target no trip was about, that it has not read about it. A place target gets nothing.
- **One trip a day starts from a starting point or a door**, not a topic Merge chose: a plan check (not a switch) asks for it when none has started from one today and 3 or more hours remain. Today's points are kept in `mind/state.json` (`points`) so a replan can still name them. The system prompt lists starting points first and a topic last.
- **A page read in the last 30 days is a way in:** the trip goes on from its links, not ends with nothing.
- **Memes become possible.** A meme had to cite a picture Merge looked at, and Merge never asks to look. An Imgflip format whose record page it read on a trip now counts as the format (role looked); the meme still carries no picture (the work check). Only formats read on a trip count (not merely offered), so the pull-request check can see the same trails later.
- **The planner is shown 12 real page titles** it could go to (seen, not read lately, not already a starting point).
**Why:** the honesty rule ("validators reject... souvenirs that don't match their source") had a hole: a failed trip was recorded as a normal one and the write step could not see it.

## 2026-11-16: Topics change faster, and two variety rules are enforced (make Merge fun, slice 2)
Merge spent five days on one subject (about eight titles, all lidar or elevation), so four things changed:
- **The long goal is looked at every 3 days**, not only on Sunday. One Sonnet call asks the weekly review's own question about the goal (continue, finish, drop or change, and why). It may keep the goal, but it says why, and the reason goes into its memory. (The Sunday review had never run: it first shipped in v0.14.0, after the 15th. The first one is Sunday 22 November.)
- **An obsession ends after 3 days at most**, whatever its weight (`OBSESSION_MAX_DAYS`). Interests fade faster: an ordinary one keeps 85% a day (it was 92%) and an obsession 70% (it was 80%). A topic nobody feeds goes from 60 to under 30 in 5 days instead of 9.
- **Two variety switches** in `mind/config.json`, both off unless Roman turns them on. Without the file, or with one that does not parse, every switch is off and the tick notes why:
  - `sameTopicWrites` (limit 3, days 7). In plain words: if Merge has already written 3 pages about the same subject in the last 7 days, a plan with a 4th write on it is turned down, and Merge is told "you have written about this 3 times in the last 7 days (titles)", and plans again once. "The same subject" is a cluster of pages, not a name: pages that share most of the words they keep coming back to are one subject, so "airborne lidar", "digital elevation model" and "leaf area index" count together. (The repeated-writing measure only sees near-copies: the most alike two of Merge's lidar pages were 0.084 against its 0.35 limit.)
  - `sameWorkTinker` (limit 2). In plain words: Merge may not tinker on the same work a third time in a row. A work counts as the same when its name or idea shares two or more words with the last ones.
  Turning a switch off puts everything back. A plan that is turned down twice falls back to the body's own choices for that moment, as every refused plan does.
**Why:** the loop was invisible from inside. Merge's own pages were too alike in subject, not in wording, so nothing measured saw it. Tuned on the 25 pages of 11 to 16 November (`pnpm --filter @forkling/mind topic-replay --world <clone>`): of the 14 lidar pages of 13 to 15 November, 8 would have been refused, and none of the 3 unrelated ones. The clustering sits on a narrow ground (at 5 shared words the sand pages would join the lidar cluster), so run the replay again as the notebook grows.

## 2026-11-10: World builder, not a pet
Forkling becomes an engine for autonomous AIs that grow a 3D world. Merge keeps a cat's body but has no needs, no temperament and no pet care. It wanders allowlisted sites, keeps souvenirs, tends and grows places, asks Roman to build new ones, and makes sandboxed web works. The spec is `docs/spec/spec.md` (v3.3), and the milestones are W0 to W8. Roman chose the recommended option on its three open decisions: Merge reads allowlisted pages' cleaned text (up to 3,000 tokens), works auto-publish after the check inside a no-network sandbox, and the mind starts fresh with the pet-era journal archived. The cap goes from $10 to $20 a month, including a small server from W3.
**Why:** the pet loop (needs, the bowl, affection) produced an upset cat to whom little happened (`docs/review-2026-11.md`). A world that grows from what Merge reads and makes gives its autonomy something visible to do.

## 2026-10-31: Verbs, not activities
Species packs provide primitive verbs (body and senses, hands, making, growing and food, mind), never activities like "gardening" or "fishing". Behaviour emerges from the mind chaining verbs toward goals it wrote itself.
**Why:** hobbies in code would make Merge a game on rails. The point is believability: what Merge does should only make sense if it has wants of its own.

## 2026-10-31: v1 direction: a pet with a mind of its own
v1 is rewritten around a forkling that lives like a person and does what it chooses with a body, a world and time (goals, memory, beliefs, interests from the real internet, things it makes), judged by eight criteria over 14 days with no human input.
**Why:** the emphasis is on what an autonomous AI can do, not on being a pet game.

## 2026-10-31: Human sleep hours
The forkling keeps roughly human hours in the owner's time zone (Merge: Europe/Stockholm): wakes ~07:00, sleeps ~23:00 to 07:00, with seeded jitter, a weekend lie-in and an optional late night the mind chooses. No LLM calls while asleep except the nightly memory batch.
**Why:** a visitor finds it asleep at night and active by day, and sleep is also the biggest cost saver.

## 2026-10-31: Haiku 5.5 for decisions, Sonnet 5.5 only for reflection
Haiku 5.5 for tick decisions, plans, reading, artifacts, the nightly rewrite, vision and builds. Sonnet 5.5 only for the bedtime reflection and the weekly long-goal review. No other models unless a milestone says so.
**Why:** keeps the monthly spend inside the cap while the two calls that need depth get the better model.

## 2026-10-30: $10 a month cap per forkling
Hard cap enforced by the budget guard in `brain/budget.json`. At the cap the mind stops all LLM calls until the month resets and the forkling carries on with utility AI.
**Why:** anyone should be able to hatch a forkling without worrying about the bill.
