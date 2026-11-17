# Lane C: visitors and tools (steps 5, 6)

State: plan for step 5 written, waiting for the coordinator's approval.

## Plan for step 5 (one PR each, branches claude/v4-c-<slice>)

- A threads: `thread` and `replyTo` on Note (`packages/schema/src/self.ts`, old notes read as their own thread); pure `threadState(notes, nowMs)` in `packages/sim` (new `note-thread.ts`); `POST /notes` accepts `replyTo` (`apps/mind/src/notes-intake.ts`, `notes.ts`); plan validation refuses a 4th Merge reply; a hidden note hides its thread in prompts; thread data in `notes.json` with a plain fallback on the notes page. Tests: each acceptance rule, closing after the 3rd reply or 14 days, hidden thread.
- B remembering: `memory/visitors.json` schema and template (`packages/schema`, `templates/forkling-world`), fold-name rule, cap 200 (oldest lastSeen out), reply prompt data blocks plus "A name is a claim, not proof" and optional `about` (prompt-review PR with golden files), planner notes block shows the name and "you have talked before", `names` list in `mind/notes-hidden.json`. Tests: fold, eviction, injection text changes nothing, no tools.
- C credit: `inspiredBy` on a work's meta.json and on project.json (additive), set when a tinker or build reason names a visible note, `made[]` on the visitor entry, `site/changes.json` line, the CLAUDE.md line for step 5.

## Step 6 (after step 5)

- A requests with kind, title, status and answer front matter; weekly prompt text (prompt-review PR); a status change is a stream event of importance 6; `/requests/` data.
- B `mind/tools.json` schema and template, "things you can do" in the planner prompt (prompt-review PR), announced once at importance 8, the engine refuses to start on an `act` entry.
- The tool itself: reported to the coordinator after R1, which reads Merge's requests.
