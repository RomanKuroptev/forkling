# A forkling world

This repo is a [Forkling](https://github.com/RomanKuroptev/forkling) world: one autonomous pet's state, memories and everything it has built, stored as files.

- `forkling.json`: who it is and what it is doing right now
- `objects/`: every object in its world, one JSON file each
- `memory/`: what it remembers
- `journal/`: one diary entry per day
- `mind/`: its goals (`goals.json`) and what it has already noticed (`state.json`)
- `brain/`: its own personality (`persona.md`) and what its thinking has cost this month (`budget.json`)
- `events/inbox/`: visitor events waiting for its next tick

## Hatching your own

1. Click **Use this template** to make your own copy.
2. Edit `forkling.json`: give it a `name`, set `timezone` to yours (for example `Europe/Stockholm`) and change `seed` to any whole number. The seed decides its sleeping hours and its tie-breaks, so no two forklings share one.
3. Visit `https://romankuroptev.github.io/forkling/<your-user>/<your-repo>`.

## Giving it a mind

Without this step your forkling still wanders on its own, but it never sets a goal.

1. **Give it access to Claude.** Pick one:
   - **An API key (quickest).** Settings, Secrets and variables, Actions: a repository secret named `ANTHROPIC_API_KEY`.
   - **Workload identity federation (no stored secret).** In the Claude Console, go to Workload identity, then Connect workload, then GitHub Actions. Pin the rule to this repo and its `main` branch, with audience `https://api.anthropic.com`. GitHub puts numeric ids into the token subject, so the subject prefix looks like `repo:<owner>@<owner-id>/<repo>@<repo-id>:ref:refs/heads/main`, not `repo:<owner>/<repo>:…`. If the exchange fails with `match_subject_prefix` in the Console's history tab, copy the exact `subject` shown there. Then add four repository *variables* (not secrets): `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID` and `ANTHROPIC_WORKSPACE_ID`. The workflow then trades GitHub's identity token for a short-lived Anthropic one on every tick. If both are set, the API key wins, so delete the secret when you switch.
2. **Let Actions write.** Settings, Actions, General, Workflow permissions: "Read and write permissions".
3. **If `main` is protected,** let the `github-actions` app bypass the rule, so the mind can commit its state.
4. **Enable the workflow.** Actions tab, then `mind`, then "Enable workflow". Scheduled workflows start switched off in repos made from a template. GitHub also pauses them after 60 days without repository activity, though the mind's own commits count as activity.

From then on it wakes every 10 minutes while awake and once an hour while asleep. Most ticks do nothing and cost nothing: it only calls a model when something is new, surprising, urgent or a step of its plan has run out.

**If it never ticks.** Open the Actions tab and look at the `mind` runs. Runs labelled `workflow_dispatch` are manual ones; a working schedule shows `schedule`. GitHub's cron is best effort: it can start late, drop runs at busy minutes (so the schedule here uses `:03`, `:13`, ... instead of `:00`, `:30`), and on some accounts a new schedule may take hours to start, or not start at all. If you see no `schedule` runs after an hour, switch on the heartbeat: add a repository *variable* (not a secret) `MIND_HEARTBEAT` with the value `true`, then Actions, `heartbeat`, Run workflow. It dispatches `mind` itself every 10 minutes and restarts itself every 5 hours. It keeps one runner idle between ticks, which is free for public repositories.

**Cost.** It cannot spend more than $10 a month: `brain/budget.json` is the ledger, and at the cap it stops calling a model until the month turns over and carries on with its instincts. Each tick's spend shows in the Actions job summary.

**Personality.** `brain/persona.md` is yours to write. The mind reads it on every call.

Edit any file and refresh the viewer to see the change. If a file doesn't fit the format, the viewer tells you which one and why.
