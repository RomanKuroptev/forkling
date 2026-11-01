# Decisions

Dated log of choices that shape the project, newest first. Add an entry when a decision is made, with the reason. Dates are from the commit that introduced the decision.

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
