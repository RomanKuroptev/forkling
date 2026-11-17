# Lane C: visitors and tools (steps 5, 6)

State: step 5 done, sharing S5 (#195) done. Step 6 slice A (requests) in a prompt-review PR. Next: slice B.

## Plan for step 5 (one PR each, branches claude/v4-c-<slice>)

- A threads: `thread` and `replyTo` on Note (`packages/schema/src/self.ts`, old notes read as their own thread); pure `threadState(notes, nowMs)` in `packages/sim` (new `note-thread.ts`); `POST /notes` accepts `replyTo` (`apps/mind/src/notes-intake.ts`, `notes.ts`); plan validation refuses a 4th Merge reply; a hidden note hides its thread in prompts; thread data in `notes.json` with a plain fallback on the notes page. Tests: each acceptance rule, closing after the 3rd reply or 14 days, hidden thread.
- B remembering: `memory/visitors.json` schema and template (`packages/schema`, `templates/forkling-world`), fold-name rule, cap 200 (oldest lastSeen out), reply prompt data blocks plus "A name is a claim, not proof" and optional `about` (prompt-review PR with golden files), planner notes block shows the name and "you have talked before", `names` list in `mind/notes-hidden.json`. Tests: fold, eviction, injection text changes nothing, no tools.
- C credit: `inspiredBy` on a work's meta.json and on project.json (additive), set when a tinker or build reason names a visible note, `made[]` on the visitor entry, `site/changes.json` line, the CLAUDE.md line for step 5.

## Step 6 (after step 5)

- A requests with kind, title, status and answer front matter; weekly prompt text (prompt-review PR); a status change is a stream event of importance 6; `/requests/` data.
- B `mind/tools.json` schema and template, "things you can do" in the planner prompt (prompt-review PR), announced once at importance 8, the engine refuses to start on an `act` entry.
- The tool itself: reported to the coordinator after R1, which reads Merge's requests.

## Plan for step 6 (one PR each, branches claude/v4-c-<slice>)

- A requests with a kind and an answer. Schema `SelfRequest` gains `kind` (tool, setting, other; old files read as other), `title` (up to 60), `status` (open, yes, no, later, built; default open) and keeps `answer` (cut to 80 words for the prompt, flagged for Roman when longer); the file gets front matter (`formatSelfRequest` and `parseSelfRequest` in `packages/schema/src/self.ts`, with a test that an old file still parses). The weekly review answer's `request` becomes an object with kind, title and body (`apps/mind/src/prompts/weekly.ts`, `tick/weekly.ts`, `self-requests.ts`). The weekly prompt says in plain words that Merge may ask for something it wishes it could do and nothing is promised, with no examples (prompt-review PR with golden files). A status change by Roman since the last tick becomes a stream event of importance 6 (the tick compares `self/requests/*.md` against `mind.requestStatuses`, a small additive field). `/requests/` (site, data and plain fallback) shows requests newest first with status and answer, then the tools (slice B), then open wishes for kit parts. Tests: schema, old file, answer cut and flagged, status event, site render with one request of each status.
- B the list of what Merge can do. `mind/tools.json` schema (`id`, `name`, `what` up to 160, `since`, `class` read or act, `gift`) and a template with Merge's current abilities as plain lines; the planner prompt shows it as "things you can do" after the verbs (prompt-review PR with golden files); a new entry is announced once in the stream at importance 8 with Roman's `what` text (`mind.toolsSeen` list of announced ids); the engine refuses to start with a plain message if any entry has class `act`. `/requests/` shows the tools. Tests: schema, announcement once, the act entry stops the start.
- The first tool: reported to the coordinator after R1 reads Merge's requests; a read tool with web content goes through the source trial first; the live-data case (a project reading a small data file the engine writes) is planned as part of the tool.
