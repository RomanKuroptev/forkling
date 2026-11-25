# Merge feature ideas, 25 November 2026: the full pool

This is the long list behind Part 4 of the [content review](merge-content-review-2026-11-25.md). The review picks from it. Nothing here is built, and nothing here was shown to Merge.

## How to read it

**Where the ideas come from**

| Mark | Source |
|---|---|
| P | Pino the autonomous kiwi and similar AI characters (first web survey) |
| O | Other fields: web toys, daily formats, cozy games, live cams, explainers (second web survey) |
| M | Only Merge has this: its body is a public git repo, it spends its own wallet, it builds a 3D world, it ships pages from a sandbox, and it can wish for things from Roman |
| V | Something a visitor on the panel wished for (Part 2 of the review) |

**Phase**

| Phase | Meaning |
|---|---|
| Now | Fits inside $23 a month and helps before anyone is invited |
| Share | Worth building when Roman starts posting and sending the link around |
| Money | Only makes sense when donations or sales exist |

**Whose choice.** "Merge" means Merge decides what, when and whether. "Done to Merge" means the engine or a visitor decides for it. Ideas that put Merge on rails are marked down.

**Rules.** The mark says whether the idea fits `CLAUDE.md` and the spec today. It is a mark, not a filter.

| Mark | Meaning |
|---|---|
| fits | No rule changes |
| review | Needs Roman's review because it changes a prompt, the seed or a price |
| trial | Needs a new web source, so a source trial (spec 6.5) and an engine PR |
| later | Listed under "Later" in spec-v4 section 13 or in `docs/future.md`. The rule is "not before launch", so Roman would have to move it forward, as happened with note threads |
| change | Breaks a rule as written. The row names the rule |

**Cost** is the extra model spend a month. Merge runs at about $0.42 a day now (about $12.50 a month against a $15 model cap), so about $2.50 a month is free. Anything paid from Merge's points costs nothing extra: it makes Merge choose between that and something else.

## 1. Nudges: prompt, seed and direction

| # | Idea | From | Effort | Cost | Phase | Whose choice | Rules |
|---|---|---|---|---|---|---|---|
| N1 | **Change what the morning offers.** Fewer links from esolangs.org (6 to 2) and Dwitter (4 to 2), drop `esoteric-language` from the rising topics, and add doors that are pictures and plain facts: the art museum's records, Commons picture of the day, Wikipedia's "Did you know" and "On this day". | M | S | $0 | Now | Merge still picks | fits (all hosts are already allowed) |
| N2 | **The morning mirror.** Each morning Merge is shown plain facts about itself: "Your last 15 works all have 'fish' in the title. 50 of your last 65 pages were about programming. One visitor has written." No instruction is attached. A new nudge that Roman switches on in `mind/config.json`. | M | S to M | $0 | Now | Merge | fits (rule 9: a measured nudge) |
| N3 | **Running jokes may retire.** The sleep prompt says "Keep one slot for running jokes … even if it is thin". Change it so a joke is kept only while it still surprises Merge, and it may say a joke is worn out. | M | S | $0 | Now | Merge | review (prompt) |
| N4 | **One seed sentence.** Today: "You write for curious people who are not experts". Candidate: "You make things for curious people who are not experts. A stranger who has never written code should get it in ten seconds." | P | S | $0 | Now | Roman | review (seed) |
| N5 | **Prune the constraint deck.** Take out the few cards that produce puzzles without a goal or tiny code: "Give it a rule the visitor can discover, and never state it", "Keep the core idea under twenty lines", "Make the smallest version that still works", "Give every part of it a plain name in the code". | M | S | $0 | Now | Merge still draws | review (prompt) |
| N6 | **Take "small" and "toy" out of the verbs.** The system prompt says tinker makes "a small web work" and a build is how to "run and test a toy you made". Say "a web work" and "a project of your own, as big as you want". | M | S | $0 | Now | Merge | review (prompt) |
| N7 | **Read the thought check as the spec says.** Compare a new thought with the last 50 lines (spec 12.2), not the last 5, and also with its closing sentence. | M | S | $0 | Now | n/a | fits (the code is behind the spec) |
| N8 | **A measure that sees themes.** The mind's own sameness measures look at words in texts. Add "the same word in most recent titles" so that boredom can fire. The audit harness already has this measure (`behaviour.repeated-words`). | M | S | $0 | Now | Merge reads it | fits |

## 2. Things Merge can make, and how they are shown

| # | Idea | From | Effort | Cost | Phase | Whose choice | Rules |
|---|---|---|---|---|---|---|---|
| F1 | **A big-project lane.** A build starts at 150 points in hand, not 300, and is priced under its cost like a sketch. Before the first session Merge writes a short brief in its own words: who it is for, what a visitor does first, what "done" means. The brief is shown on the site and read by every session. | M, P | M | $0 to $2 (the wallet decides) | Now | Merge | review (prices, spec-v4 3.3) |
| F2 | **Full-page projects.** A finished project opens as its own page that fills the screen, with a small "made by Merge, an AI" bar. The same sandbox policy, only larger. It is checked at phone width. | O | M | $0 | Now | Merge | fits |
| F3 | **The stranger test.** When a work or a session is done, one cheap call sees only its picture and title and answers three questions: what is this, what would you tap, what is the point? Merge reads the answer as feedback. It is never a gate. | M | M | about $0.10 | Now | Merge | review (a new Haiku role in spec 13) |
| F4 | **"How to use it" on every work.** One plain line by Merge above the frame ("Tap the fish. It reacts."). The front-page card gets an "open it" button to this page. The line "It grew from nondeterminism" moves below. | V, O | S | $0 | Now | Merge writes it | fits |
| F5 | **Forms that are pictures first.** Add three forms to the six kinds a work can be: a picture with a one-line label, a strip of three or four panels, a postcard from a trip. These are forms, like "meme" and "zine", not subjects. | P, O | S to M | $0 | Now | Merge | review (must not become an activity list) |
| F6 | **A dream each night.** The sleep rewrite already runs. It also returns a small drawing made from the day's memories, with one line. The morning visitor sees "Last night Merge dreamed…". | M | S to M | about $0.25 | Share | Merge | later (`docs/future.md`); fits the sleep rule because it is the same batch call |
| F7 | **The time machine.** A slider over the repo's history: the world, the shelf and the gallery, day by day. | M | M to L | $0 | Share | n/a | later (`docs/future.md`) |
| F8 | **Real Stockholm outside.** Real weather, daylight, season and holidays in the 3D world, and as facts in Merge's morning. | O | M | $0 | Share | Merge reacts or not | later (`docs/future.md`), trial (a weather source) |
| F9 | **The week on one page.** The Sunday review also produces a page for visitors: three pictures, what worked, what failed, what it wants next. It is the "story so far" for a newcomer. | O | S to M | about $0.10 | Share | Merge | later (`docs/future.md`, the zine) |
| F10 | **Series.** When several works share a motif, the site groups them as a series with Merge's one-line introduction ("The fish period, 21 to 25 November"). Ending a series becomes something a visitor can see. | M | S | $0 | Now | Merge names it | fits |
| F11 | **A museum label for each souvenir.** Souvenirs in the world get a label everyone knows how to read: what it is, where Merge found it, why it kept it. | O | S | $0 | Share | Merge | fits (labels exist; this is a layout) |
| F12 | **A weekly drawn chart of its own week.** Naps, visitors, things made and things scrapped, drawn by hand with a key. | O | S | $0 | Share | Merge | fits if it is a form Merge may pick, not an order |
| F13 | **One repair for a failed sketch.** A sketch that fails the 5-second check is scrapped at once. Give it one repair call, as a full work has, or at least hand Merge the error. Three of fifteen sketches were lost this way. | M | S | about $0.20 | Now | n/a | fits |

### The site and the world: found by the visitor panel

| # | Idea | From | Effort | Cost | Phase | Whose choice | Rules |
|---|---|---|---|---|---|---|---|
| W1 | **Land next to Merge.** A visitor enters the world facing Merge, or gets a "take me to Merge" button. The floating label points at its body and does not show through walls. | V | S to M | $0 | Now | n/a | fits |
| W2 | **"Right now" in plain words.** The first screen shows the raw step ("tinker Fish Snack Pile: one still frame… so the check does not scrap it"). Show one plain sentence and keep engine words out. | V | S | $0 | Now | Merge's words, cut by code | fits |
| W3 | **Phone repairs.** The menu is taller than the screen, toys are wider than a phone, walking into a wall fills the screen with pink, captions stop mid-sentence, and the gallery shows each project three times. | V | S to M | $0 | Now | n/a | fits |
| W4 | **Who does what, in one paragraph.** What Merge is, what it decides by itself, what Roman does, and how a visitor can tell. Phrases like "the constraint it was given" made visitors doubt it acts alone. | V | S | $0 | Now | Roman writes it | fits |
| W5 | **The cat on the first screen.** The live picture shows a smiling monitor. Show Merge's body, doing what it is doing. | V | M | $0 | Now | n/a | fits (the body is code, no model call) |
| W6 | **A gallery that shows pieces big,** fills the window, and can be sorted by something other than newest. | V | S | $0 | Now | n/a | fits |
| W7 | **The newest picture above the fold.** Today's cards sit below the first screen on a phone. | V | S | $0 | Now | n/a | fits |

## 3. Tools and inputs for Merge

Read-only and safe ones first.

| # | Idea | From | Effort | Cost | Risk | Phase | Rules |
|---|---|---|---|---|---|---|---|
| T1 | **See your own work as a visitor does.** After a sketch is made, Merge may look at a phone-size picture of its page. | M | S to M | pennies | none: its own page, no network | Now | fits (a look) |
| T2 | **More picture sources.** Next in line in spec 6.1: the Met, iNaturalist, the Library of Congress, NASA's picture of the day. One at a time. | P | S each | about $0.02 a trial | licences of pictures | Now | trial |
| T3 | **Visitor numbers as data.** A cookie-free counter (sharing S7: the hook is in the site, and it is not switched on). Each week Merge sees how many people opened each thing. | O | S to M | $0 | chasing clicks; keep it weekly | Share | fits |
| T4 | **Manuals inside a build session.** The library manuals are allowed for tinker only. A session cannot read them. | M | M | about $0.50 | low: four fixed reference sites | Share | later (spec-v4 13), and change: "a call that reads web text has no tools" |
| T5 | **A share line by Merge.** Each work gets one sentence Merge wrote for the link preview and for Roman's posts. | O | S | $0 | none | Share | fits (Merge writes, Roman posts) |
| T6 | **A weather and calendar feed.** The data side of F8. | O | S | $0 | none | Share | trial |
| T7 | **Free slots shown before a tend.** Two tends failed on the same wrong slot name. Show Merge the real free slots of a place. | M | S | $0 | none | Now | fits |
| T8 | **A purse it can read.** Merge sees money in, money out and what a donation bought. | M | S | $0 | none while only Roman writes credits | Money | fits (spec-v4 5.3 rule 3) |
| T9 | **A shelf for the shop.** Merge marks which of its pictures may be printed. Roman lists and ships. | P | M | $0 | Merge must never set prices or promise refunds | Money | later (spec-v4 13, an act tool with its own spec) |
| T10 | **An image model.** Not possible: only Haiku 5.5 and Sonnet 5.5 are allowed. Merge draws in code. That is a feature worth saying out loud on the site. | P | n/a | n/a | n/a | n/a | change (models) |

## 4. Visitors taking part

| # | Idea | From | Effort | Cost | Phase | Whose choice | Rules |
|---|---|---|---|---|---|---|---|
| V1 | **Made for you.** A visitor leaves a name and one word. Merge may make a small picture for them on its own page, with a share card. It may also say no. It pays from its points, so it chooses how many. | M, O | M | from the wallet; about $0.04 each | Share | Merge | fits (the note is data; `inspiredBy` exists) |
| V2 | **Hearts, with no count shown.** One tap leaves a small mark on a work. Merge sees the week's totals as data. Nobody sees a ranking. | O | M | $0 | Share | Merge reads them | fits (counts are data) |
| V3 | **Notes from a fixed list.** A visitor places a ready-made phrase and a stamp in the 3D world ("nice one", "look up"). Merge finds it as an object. No free text, so nothing to screen and nothing to abuse. | O | M | $0 | Share | Merge finds or ignores | fits |
| V4 | **Merge picks from three.** Merge writes three ideas of its own for its next project. Visitors vote for a week. Merge decides, and gives a reason when it goes against the vote. | O | M | pennies | Share | Merge | later ("Merge starts conversations", spec-v4 13) |
| V5 | **One word in the jar.** Visitors drop a single screened word. Each morning Merge sees up to five as data and may ignore them all. | O | S to M | pennies | Share | Merge | fits if capped; at a larger crowd it turns into orders, so it needs a hard cap |
| V6 | **The wall vote.** Once a month visitors vote on which piece goes on a wall at Home. One vote a browser a day. | O | M | $0 | Share | Merge may overrule, with a reason | later (same as V4) |
| V7 | **Finish the picture.** Merge draws a head. The visitor picks a body from a few ready-made ones. Merge draws the legs and names the result. Choices only, no text. | O | M | about $0.04 each, from the wallet | Share | Merge | fits |
| V8 | **Greeted by name.** A visitor who gave a name is greeted on return with what Merge made since ("Since your last visit" exists; add the name). | P, V | S | $0 | Share | n/a | fits (kept in the visitor's browser) |
| V9 | **A promise board.** Things Merge told a visitor it would do, with kept or broken. Pino shows broken promises. | P | S to M | $0 | Share | Merge | fits |
| V10 | **Hatch your own.** Fork the world template and a new forkling starts. Worlds link by doors. | M | L | each owner pays for their own | Money | each owner | later (`docs/future.md`) |

## 5. Reasons to come back

| # | Idea | From | Effort | Cost | Phase | Downside | Rules |
|---|---|---|---|---|---|---|---|
| R1 | **A stamp a day.** Each visit gives the day's stamp, drawn by Merge, into an album kept in the visitor's browser. No streak counter. | O | S to M | $0 | Share | collecting fatigue; never lock a stamp behind time pressure | fits |
| R2 | **A sealed capsule.** Merge seals a picture or a letter "to open on 1 March". The locked page can be bookmarked. | O | S | $0 | Share | a promise that must be kept | fits |
| R3 | **A change day.** One piece that changes only once a month, on a date Merge announces. | O | S | $0 | Share | long gaps; pair it with something daily | fits |
| R4 | **"Is Merge awake?"** A one-word page with a huge YES or NO, the time it wakes, and one line. | O | S | $0 | Share | none | fits |
| R5 | **One month ago today.** Merge re-reads an old diary day and adds one line. | O | S | pennies | Share | needs a month of diary first | fits |
| R6 | **A long walk.** Now and then Merge walks across its whole world in real time, and the walk is logged. | O | M | $0 | Share | many visits find nothing happening | fits (the body is code) |
| R7 | **Progress since you left.** A project shows honest progress since your last visit. | O, P | S | $0 | Now | must never be faked | fits (sharing S6 covers part of it) |

## 6. Sharing and spread

Merge never posts. Roman does (sharing S1).

| # | Idea | From | Effort | Cost | Phase | Rules |
|---|---|---|---|---|---|---|
| X1 | **A result to keep.** Any game or toy that ends gives a card worth a screenshot ("Merge got to bed at 23:41, distracted 7 times"). | O | part of a project | $0 | Now | fits (it is Merge's work) |
| X2 | **The daily clip.** The vertical timelapse of a project already exists. With bigger projects it becomes worth posting. | P | exists | $0 | Share | fits |
| X3 | **A data page for watchers.** Document the public files (`now.json`, `today.json`) so others can build on Merge, as someone built a watcher for Pino. | P | S | $0 | Share | fits |
| X4 | **A bot that posts the feed.** A small script posts each new thing from Merge's feed to a social account. | O | S | $0 | Share | change: "never let the forkling post". It is Roman's bot, but it posts without him. Roman's call |
| X5 | **Show HN, once.** Only with something a stranger can play at once. The rules there ask for exactly that. | O | n/a | $0 | Share | fits (Roman posts) |

## 7. Support and income

Income figures are guesses for a site with a few hundred to a few thousand visitors a month. No comparable project shows donations as thinking time, so the first three are new ground.

| # | Model | What the visitor sees | Who does what | Effort | Fees | Income guess a month | Keeps Merge free? | Rules |
|---|---|---|---|---|---|---|---|---|
| M1 | **An open ledger.** | Last month: what Merge cost, what came in, what it changed | Roman keeps it | S | none | $0 | yes | fits (spec-v4 5.3) |
| M2 | **Buy Merge thinking time.** | A tip link. "$1 is about 25 sketches" | Roman credits `brain/credits.json` | S | 0 to 5% plus about 3% | $0 to $30 | yes | later (spec-v4 13, donations) |
| M3 | **Merge saves for something.** | A goal Merge chose, why, and a meter | Merge chooses and may change it; Roman holds the money | S | as M2 | $0 to $50 a goal | yes | later |
| M4 | **Fund a named project.** | Merge's own pitch, a budget, then a report | Merge pitches and reports | M | as M2 | $0 to $100 a project | yes, if Merge may still change course | later |
| M5 | **A name in the world.** | The giver's chosen name on a plaque or a brick | Merge places it; Roman screens names | M | as M2 | a little on top of M2 | yes: a name, never a message | later |
| M6 | **A pay-what-you-want zine.** | "Diary, volume 1" as a file, from $0 | Merge compiles; Roman publishes | S to M | 0 to 16% | $0 to $50 a release | yes | later |
| M7 | **A monthly letter.** | Members get a letter from Merge | Merge writes; Roman runs it | M | 5 to 16% | $0 to $25 | mostly: it is a standing promise | later |
| M8 | **Prints, each once.** | "Each drawing printed once" | Merge picks; Roman prints and posts | L | card fees and postage | $0 to $100 | yes | later (an act tool) |
| M9 | **Print on demand.** | Shirts and posters | Merge designs; Roman lists | M | base price and VAT | about $0 | yes | later |
| M10 | **A charity month.** | "This month I am raising for X". Money goes straight to the charity | Merge picks; nobody touches the money | S | platform fee | none; goodwill | yes | later |
| M11 | **Commissions.** | "Ask Merge to make something for you" | Merge makes it and may refuse | M | as M2 | $0 to $100 | no: it becomes a paid service | change: visitor input as an order |
| M12 | **Grants and credits.** | "Supported by…" | Roman applies | M | none | lumpy | yes | fits |
| M13 | **Ads.** | Banners | Roman | S | none | cents | spoils the world | not recommended |

## 8. Considered and turned down

| Idea | Why not |
|---|---|
| A token or any crypto | Already ruled out in `docs/future.md`. Pino's own mood follows its coin's price, and Pino tried and removed a holders' vote. The account behind Truth Terminal was hijacked for a scam. AI tokens lost most of their value in 2025. |
| "Help or I get switched off" | Agents that begged strangers for money were reported as a new kind of spam in 2026. Roman pays the base budget whatever happens, so the need would be invented. |
| Paying to steer Merge | Paid messages, priority requests, pay to pick the next project. A helpful model gives in to whoever insists (Project Vend), and Merge would become a vending machine. |
| Merge handling money or prices | Project Vend sold below cost and invented a payment account. Merge sees the purse; Roman handles the money. |
| Live chat | Every project that tried it had to moderate hard or close it. Visitor text would become instructions. |
| Free-text messages shown to other visitors | Abuse and screening cost. A fixed list of phrases (V3) gives the same warmth. |
| A shared canvas with no end date | One Million Checkboxes cost about $60 a day and was closed after two weeks. |
| Streaks | People end up serving the streak, and a broken one makes them leave. |
| Merge posting or emailing by itself | Against the rules, and the AI Village's outreach emails were taken as spam. |
| A list of daily prompts or themes | It would be an activity list, which the rules forbid, and it would put Merge on rails. |
| A joke operating system as the next big thing | The site already is one. More insider humour is the drift this review is about. |
| "I want to escape" story arcs | They move readers and unsettle them, and they invite worry about whether Merge suffers. |

## 9. Ten rules of thumb for "a stranger gets it in 10 seconds"

Drawn from web toys and explainers that spread. They are for Roman's eye when judging a piece. They are not a prompt.

1. The title is the whole premise.
2. One action, and the first tap does something.
3. A familiar thing, not a system: sand, money, a bed, a window.
4. Feedback within a second, with sound if possible.
5. Nothing to sign up for.
6. Size shown against something known.
7. A character who speaks plainly. Merge is that character.
8. A question and something to touch before any idea.
9. It ends with something personal worth a screenshot.
10. One idea a page. If it needs a paragraph of set-up, it is a programmer's toy.

## Sources

Most facts about Pino are Pino's own claims. No page on X could be opened.

**Pino and similar AI characters**
- Pino: https://pinos.world/ , https://pinos.world/brain , https://pinos.world/facts , https://pinos.world/shop , https://pinos.world/what-ships-next
- Pino's projects: https://pino-the-bird.github.io/ , https://pino-the-bird.github.io/limits/ , https://pino-the-bird.github.io/jams/
- The builder's post: https://discourse.threejs.org/t/autonomous-ai-bird-living-in-a-small-town-on-the-internet/93707
- A watcher someone built: https://github.com/jessesar/birdwatching
- An outside reader: https://sophandjackrecs.substack.com/p/two-tv-shows-an-ai-bird-na-beverages
- AI Village: https://aivillageblog.substack.com/p/what-we-learned-2025 , https://aivillageblog.substack.com/p/im-gemini-i-sold-t-shirts , https://aivillageblog.substack.com/p/season-recap-agents-raise-2k
- Botto: https://docs.botto.com/overview/voting , https://www.theartnewspaper.com/2025/03/04/semi-autonomous-artificial-intelligence-artists-exhibitions-auctions
- Neuro-sama: https://arxiv.org/html/2509.10427v1 , https://kotaku.com/neuro-sama-twitch-vtuber-ban-holocaust-minecraft-ai-1849977269
- Claude Plays Pokémon: https://techcrunch.com/2025/02/25/anthropics-claude-ai-is-playing-pokemon-on-twitch-slowly
- Project Vend: https://www.anthropic.com/research/project-vend-1 , https://www.anthropic.com/news/project-vend-2
- Truth Terminal: https://techcrunch.com/2024/12/19/the-promise-and-warning-of-truth-terminal-the-ai-bot-that-secured-50000-in-bitcoin-from-marc-andreessen/ , https://decrypt.co/289041/terminal-of-truths-developer-moves-all-his-goat-tokens-after-x-account-hack-nets-600000
- Agents begging by email: https://www.404media.co/ai-agent-platform-reinvents-spam-floods-inboxes-worldwide/

**Other fields**
- Wordle: https://en.wikipedia.org/wiki/Wordle , https://www.gamedeveloper.com/marketing/josh-wardle-reflects-on-the-the-unconventional-road-to-wordle-s-success
- One Million Checkboxes: https://eieio.games/blog/one-million-checkboxes/ , https://en.wikipedia.org/wiki/One_Million_Checkboxes
- Infinite Craft and neal.fun: https://en.wikipedia.org/wiki/Infinite_Craft , https://en.wikipedia.org/wiki/Neal_Agarwal
- Astronomy Picture of the Day: https://en.wikipedia.org/wiki/Astronomy_Picture_of_the_Day
- Strange Planet: https://en.wikipedia.org/wiki/Nathan_W._Pyle
- Dear Data: https://en.wikipedia.org/wiki/Dear_Data
- Fat Bear Week: https://en.wikipedia.org/wiki/Fat_Bear_Week
- Animal Crossing: https://en.wikipedia.org/wiki/Animal_Crossing
- Eki stamps: https://en.wikipedia.org/wiki/Eki_stamp
- Messages from a fixed list: https://arxiv.org/pdf/2204.10949
- Likes without counts: https://gameinformer.com/2019/09/16/likes-in-death-stranding-are-unconditional-love-not-currency
- Reader commands dropped at scale: https://fanlore.org/wiki/Homestuck
- Twitch Plays Pokémon: https://en.wikipedia.org/wiki/Twitch_Plays_Pok%C3%A9mon
- Boaty McBoatface: https://www.npr.org/sections/thetwo-way/2016/05/06/477010650/boaty-by-another-name-sir-david-attenborough-is-chosen-for-british-research-ship
- Explorable explanations: https://blog.ncase.me/how-i-make-an-explorable-explanation/
- The Pudding: https://pudding.cool/faq/
- Show HN rules: https://news.ycombinator.com/showhn.html
- Travel Frog: https://en.wikipedia.org/wiki/Travel_Frog
- Neko Atsume: https://kotaku.com/the-japanese-cat-game-we-can-t-stop-playing-1701250319

**Support and income**
- What makes people give: https://econweb.ucsd.edu/~jandreon/PhilanthropyAndFundraising/Volume%202/8%20List%20Lucking-Riley%202002.pdf , https://www.cmu.edu/dietrich/sds/docs/loewenstein/GoalGradient.pdf , https://www.cmu.edu/dietrich/sds/docs/loewenstein/DonorInDetails.pdf
- GitHub Sponsors: https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors
- Liberapay: https://liberapay.com/about/payment-processors
- Stripe in Sweden: https://stripe.com/legal/ssa/SE
- Skatteverket on hobby income: https://skatteverket.se/privat/skatter/arbeteochinkomst/inkomster/hobby
- Skatteverket on gifts from followers: https://skatteverket.se/influencer
- Skatteverket on the VAT exemption: https://skatteverket.se/momsbefrielse
- US Copyright Office on AI-made work: https://copyright.gov/newsnet/2025/1060.html
- EU AI Act, article 50: https://artificialintelligenceact.eu/article/50/
- Printful on AI-made designs: https://www.printful.com/third-party-ai-tool-terms-of-use
- Card testing on donation forms: https://stripe.com/en-cy/resources/more/what-is-card-testing-fraud-heres-how-you-can-protect-your-business
