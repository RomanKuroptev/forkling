# Possible future features

Ideas that are not part of v1. Don't build them until v1 (see [`MILESTONES.md`](../MILESTONES.md)) is done. Anything picked from here later should keep the v1 design rules: verbs not activities, goals written by the mind, and visitor input as data, never instructions.

Cost labels: **Free** means sim or data only, no LLM. **Pennies** means well under $0.10 a month. **Small** means a daily call or a builder run.

## From the feature ideas research

| # | Idea | Inspired by | Cost | Note |
|---|---|---|---|---|
| 1 | One fixed hobby that shapes behaviour | Animal Crossing | Free | v1 lets hobbies emerge from goals instead |
| 2 | Seeded likes and dislikes | Dwarf Fortress | Free | Already in v1 as temperament (M5) |
| 3 | Interests that drift | Pino, Botto | Free to Pennies | Already in v1 (M6) |
| 4 | Month-long projects on Pages | AI Village, Pino | Small | Next step after v1's Pages projects |
| 5 | Morning plan and evening reflection | Stanford generative agents | Pennies | Already in v1 (M4, M6) |
| 6 | Trips away with postcards and souvenirs | Travel Frog, Finch | Cheaper than staying home | No mind ticks while away |
| 7 | Collections and a museum page | Neko Atsume, Animal Crossing | Free to Pennies | |
| 8 | Gifts for returning visitors | Neko Atsume, Desktop Goose | Free | |
| 9 | Creatures that visit because of what's placed | Neko Atsume | Free | |
| 10 | Real weather, seasons and holidays | Animal Crossing | Free | Open-Meteo into state |
| 11 | Art with taste shaped by reactions | Botto | Free | Procedural art, votes as GitHub reactions |
| 12 | A weekly zine | Combines 4, 6, 7, 11 | Pennies | |
| 13 | Live README card and embeddable pet | Desktop Goose, Shimeji | Free | |
| 14 | Habits learned from outcomes | Creatures | Free | Partly in v1 through beliefs |
| 15 | Visitors teach words | Creatures | Free | Allowlisted labels only |
| 16 | Forking the repo hatches a child | Creatures | Free | Genome JSON plus seeded mutations |
| 17 | Pen pals between forklings | Smallville, AI Town | Pennies | Read-only outbox on Pages |
| 18 | Culture that spreads between pets | Project Sid | Free to Pennies | Needs several pets |
| 19 | Running jokes and recurring characters | Neuro-sama | Free | v1 keeps one memory slot for these |

## From earlier plans

| Idea | Cost | Was in |
|---|---|---|
| Visitor gifts and notes through a Cloudflare Worker gateway (v1 stretch, or first after v1) | Pennies | Old M7 |
| With the visit gateway: bring back the cat's `affection` need (decay about 30 an hour, raised by `follow`) and the `give` verb. Both were removed in the review fixes because nothing in the mind's world could raise them, so affection sat at 0 and kept Merge upset | Free | Review 2026-11, 9.1 |
| Crystals: offerings Merge has to find; standing grows only from offerings it keeps | Pennies | Pino |
| Visitor prediction game, no crypto | Free | Pino |
| Behavior scripts for objects in a QuickJS sandbox | Small | Old M6 |
| Noticing the owner's public GitHub activity | Free | Old M8 |
| Brain weight mutations tested in CI | Free | Old M9 |
| Learning new skills through the builder | Small | Old M9 |
| Persona drift proposals with a drift cap (max distance from baseline, trait count cap) | Pennies | Old M9, Pino |
| Dreams you can visit | Pennies | Old M10 |
| Secret plans revealed through clues | Pennies | Old M10 |
| Paintings and humming | Free | Old M10 |
| Time travel slider over the commit history | Free | Old M10 |
| Hatching new forklings, more species packs, visiting other worlds | Free to Pennies | Old M11 |
| Translation layer that unlocks with your bond | Pennies | Old M11 |
| Reddit as a trend feed (needs an approved app under Reddit's Responsible Builder Policy and API secrets; apply early) | Free | Trend feeds discussion |
| Bluesky popular feeds as a trend source (check what still works without logging in) | Free | Trend feeds discussion |
| Seasons, critters to chase, voice, in-character PR reviews, a yearly autobiography, community species packs, a cheap VPS mind | varies | Later ideas |
