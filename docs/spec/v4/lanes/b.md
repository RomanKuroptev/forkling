# Lane B: the sandbox (step 3), then projects (step 4)

Worktree `.claude/worktrees/lane-b`. Plan approved by the coordinator on 17 November, with the socket-activated unit instead of `systemd-run` (see `docs/decisions.md`, 2026-11-17).

## Step 3

- **3A, project files:** `apps/mind/src/builds/project-files.ts` (`checkProjectPath`, `resolveProjectPath`, `listProjectFiles`, `checkWrite`; tests 1 and 2 in `apps/mind/test/project-files.test.ts`), the decision entry and the pointer in `step-3-sandbox.md`. Branch `claude/v4-b-project-files`. PR open.
- **3B, one browser path:** next.
- **3C, the server side (units, socket client, probe, `/health` sandbox, `sandbox-proof`, deploy):** after 3B.
- **3D, the runbook:** after 3C.

## Step 4

Not started. The `build` verb in `mind-plan.ts` waits for lane A's step 1 slice B.
