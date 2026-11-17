# Step 6: tool requests, and the first tool

Spec: [`spec-v4.md`](spec-v4.md) sections 0, 1 and 8, and v3.3 sections 9.5 and 6.5.

## Why

Roman, 16 November: "My idea for things that I would build was more like tools and expanding what it has access to. Tools on the web. Integrations. Big stuff." So Merge builds the things and Roman builds what Merge can do. This step is the channel between them and the list of what Merge has been given.

## Build

Two slices, one PR each. Then one tool, chosen by Roman.

### Slice A: requests with a kind and an answer

- The weekly request (`self/requests/<date>.md`) gains front matter: `kind` (`tool`, `setting` or `other`), `title` (up to 60 characters), `status` (`open`, `yes`, `no`, `later` or `built`) and `answer` (Roman's words, up to 80). The body stays up to 120 words in Merge's voice. Old request files read as kind `other`.
- The weekly review prompt says, in plain words, that Merge may ask for something it wishes it could do, and that nothing is promised. It gives no examples of tools and no list to pick from.
- Roman's answer reaches the next review as data. A status change is a stream event with importance 6, so Merge may react to it.
- `/requests/` shows requests newest first with their status and answer, then the tools Merge has (slice B), then open wishes for kit parts.
- Tests first: the schema; an old file parses; an answer over 80 words is cut for the prompt and flagged for Roman.

### Slice B: the list of what Merge can do

- `mind/tools.json` in the world repo per spec-v4 section 8, with its schema and a template holding what Merge already has, written as plain abilities (for example: read a few web sites, look at images, make web sketches and works, build projects, grow and found places, answer notes). Only Roman edits it.
- The planner's prompt shows the list as "things you can do", after the verbs. A new entry is announced once in the stream with importance 8 and the text Roman wrote in `what`.
- Class `act` is accepted by the schema, and the engine refuses to start if any entry has it. That refusal is removed only by a later spec change.
- Tests first: the schema; the announcement fires once; an `act` entry stops the start with a plain message.

### The first tool (Roman chooses; its own small plan)

Roman picks one from Merge's own requests, or gives one as a gift. It is built as its own PR, after its own short plan that Roman reads. A *read* tool that brings in web content goes through the source trial of v3.3 6.5 first. Good first candidates, only as a starting point for the talk with Roman: Hacker News through the Algolia API (the old route was dropped for robots rules), a Lemmy or Mastodon pulse, a search over the pages Merge has already seen, or live open data such as weather or ISS position for projects to use.

A tool that a **project** uses at run time is a special case: a finished project runs in the visitor's browser with no network. Live data therefore has to be fetched by the engine and written into the world repo as a small data file the project may read. Plan that as part of the tool, not as a hole in the sandbox.

## Do not touch

- Wishes for kit parts: they stay exactly as they are and are only shown on the same page.
- Any outbound action. No tool in this step posts, sends, logs in or handles money.

## Done when

1. All tests pass, and `pnpm test` and `pnpm typecheck` pass.
2. `/requests/` renders from the template world with one request of each status and a tools list.
3. Roman has read the changed weekly prompt and the first `mind/tools.json` and said yes.
4. One tool is built, announced to Merge, and Merge's first days with it are reported to Roman.
