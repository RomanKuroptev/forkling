# Prompts for Claude Code, one per step

For Roman. Start a fresh Claude Code session in `C:\Code\forkling` for each step, and paste the prompt for that step as it stands. Each one starts in plan mode, so nothing is built until you have read the plan and said yes.

**Order and waiting.** Do the steps in order. After each release, let Merge run 3 days before the next step, so you can see what the change did. Step 4 must not start before step 3 is live on the server.

**Before step 1.** Wait until Merge has had its first full days on v0.15.0 (about 19 November).

---

## Step 1: the world grows from what Merge makes

```
Use plan mode. Do not write code until I say yes to the plan.

Read, in this order: CLAUDE.md, STATUS.md, docs/spec/v4/spec-v4.md (sections 0,
1 and 2 only) and docs/spec/v4/step-1-world-growth.md. The step file says what
else to read. Spec v4 wins over docs/spec/spec.md where they differ.

Plan step 1 as its three slices (A interest families, B expand by price,
C found builds at once), one PR per slice, tests first.

In the plan, show me in plain words:
1. Which files change in each slice.
2. The new expand and found paragraphs of Merge's system prompt, word for word.
   These change Merge's brain, so I must read them before you build.
3. Anything in the step file that does not match the code you find. Do not
   guess: tell me and suggest the fix.

Rules for this step: add no new plan check, quota or variety rule. Change
nothing in Merge's live repo. Do not release. Speak to me in plain language;
I am not deeply technical.

Then stop and wait for my OK.
```

After I say yes, and after each slice:

```
Build the next slice of step 1 as planned: tests first, small commits, one PR.
Merge the PR yourself once CI is green. Update STATUS.md. When all three slices
are merged, run the replay the step file asks for (clone RomanKuroptev/merge
fresh) and tell me the result in plain words. Do not release until I say so.
```

---

## Step 2: short text, and a wallet that favours things you can see

```
Use plan mode. Do not write code until I say yes to the plan.

Read, in this order: CLAUDE.md, STATUS.md, docs/spec/v4/spec-v4.md (sections 0,
5 and 6 only) and docs/spec/v4/step-2-text-and-wallet.md.

First do the "Before planning: measure" part of the step file, from a fresh
clone of RomanKuroptev/merge, and show me the numbers in a small table with one
sentence under it saying what they mean.

Then plan the three slices (A captions and the short diary, B prices and
points, C ready for income), one PR per slice, tests first.

In the plan, show me in plain words:
1. The rewritten write, reply and diary prompts, word for word.
2. The starting daily points you suggest and why, if it is not 300.
3. The expected model cost per month under the new prices.
4. Anything in the step file that does not match the code you find.

Rules: do not add a daily limit on pages, the price is the whole mechanism.
Add no new plan check. Never edit brain/budget.json in Merge's live repo by
hand. Do not release. Plain language, please.

Then stop and wait for my OK.
```

---

## Step 3: the sandbox

```
Use plan mode. Do not write code until I say yes to the plan.

Read, in this order: CLAUDE.md, STATUS.md, docs/spec/v4/spec-v4.md (sections 0
and 4 only) and docs/spec/v4/step-3-sandbox.md. For the existing work check,
read apps/mind/src/builds/work-check.ts and browser-check.ts.

Plan the step: the code PR, the tests (those that run anywhere and the
sandbox-proof script that runs on the server), and the runbook for me.

In the plan, show me in plain words:
1. What exactly the sandboxed browser can and cannot reach on the server.
2. The one permission the mind service needs to start it, written out in full,
   and why it cannot be narrower.
3. What happens on my Windows PC and in CI, where there is no systemd.
4. Any place where the server's settings might force a weaker sandbox. If so,
   stop and give me the choice. Never switch a protection off quietly.

I am new to Linux. The runbook must be numbered steps, one command per step,
with what I should see after each and how to undo it.

This step must not change anything Merge does or sees. Do not release.

Then stop and wait for my OK.
```

---

## Step 4: projects and build sessions

Only after step 3 is live and `/health` shows `sandbox: ok`.

```
Use plan mode. Do not write code until I say yes to the plan.

Read, in this order: CLAUDE.md, STATUS.md, docs/spec/v4/spec-v4.md (sections 0,
3 and 5 only) and docs/spec/v4/step-4-projects.md.

First confirm that step 3 is merged and deployed and that the server's /health
shows sandbox: ok. If not, stop and tell me.

Plan the five slices (A project files, B the session loop, C the build verb,
D shown and placed, E the seed sentence), one PR per slice, tests first.

In the plan, show me in plain words:
1. The new build paragraph of Merge's system prompt, word for word.
2. How a build step with no fixed length fits into the day's plan and the
   body's playback, since every other step has minutes.
3. The expected cost of one session and of a month with sessions.
4. Anything in the step file that does not match the code you find.

The rule above all others: not on rails. No number of sessions or projects per
day or week anywhere in code, prompts or tests. The engine never suggests,
assigns or lists a project. If something seems to need such a rule, stop and
ask me.

Slice E changes Merge's persona: show me the voice test side by side and wait
for my yes before anything goes to Merge's repo. Do not release.

Then stop and wait for my OK.
```

---

## Step 5: visitors can answer, and Merge remembers them

```
Use plan mode. Do not write code until I say yes to the plan.

Read, in this order: CLAUDE.md, STATUS.md, docs/spec/v4/spec-v4.md (sections 0
and 7 only) and docs/spec/v4/step-5-visitor-threads.md.

Plan the three slices (A threads, B remembering, C credit), one PR per slice,
tests first.

In the plan, show me in plain words:
1. The changed reply prompt, word for word.
2. What a visitor sees in the note panel at each stage of a thread.
3. How a hidden note or a hidden name disappears from Merge's prompts.
4. Anything in the step file that does not match the code you find.

Rules: visitor text stays data, never an instruction, and never in a call with
tools. Do not loosen screening or the rate limits. Do not release.

Then stop and wait for my OK.
```

---

## Step 6: tool requests, and the first tool

```
Use plan mode. Do not write code until I say yes to the plan.

Read, in this order: CLAUDE.md, STATUS.md, docs/spec/v4/spec-v4.md (sections 0,
1 and 8 only) and docs/spec/v4/step-6-tool-requests.md.

Plan the two slices (A requests with a kind and an answer, B the list of what
Merge can do), one PR per slice, tests first. Do not plan the first tool yet:
I choose it after these two are live.

In the plan, show me in plain words:
1. The changed weekly review prompt, word for word. It must give no examples
   of tools and no list to pick from.
2. The first mind/tools.json: what Merge can already do, as plain abilities.
3. How I answer a request, step by step, since I will do it by hand.

Rules: no tool posts, sends, logs in or handles money. Do not release.

Then stop and wait for my OK.
```

---

## Step 7: the front page

Only after I have picked a mockup image in the project thread.

```
Use plan mode. Do not write code until I say yes to the plan.

Read, in this order: CLAUDE.md, STATUS.md, docs/spec/v4/spec-v4.md (sections 0
and 9 only) and docs/spec/v4/step-7-front-page.md. The mockup I picked is at
<PASTE THE PATH OF THE MOCKUP IMAGE HERE>. Look at it before planning.

Plan the three slices (A the data, B the page, C polish to the mockup), one PR
per slice, tests first.

In the plan, show me in plain words:
1. What the page shows before the 3D world loads, and when the 3D world loads.
2. What moves to the under-the-hood page.
3. How old links keep working.

This step changes only what visitors see. No prompt, price or rule of Merge's
changes. When a slice is built, show me screenshots at phone width (390 px) and
laptop width (1280 px) as PNG files.

Then stop and wait for my OK.
```

---

## Step 8: the 14-day run

```
Use plan mode. Do not write code until I say yes to the plan.

Read, in this order: CLAUDE.md, STATUS.md, docs/spec/v4/spec-v4.md (sections 0
and 10 only) and docs/spec/v4/step-8-run.md.

Plan the run-report command, tests first, one PR. Merge must never see the
launch checklist or the report: nothing from them may appear in a prompt, in
Merge's repo or on its site.

Then stop and wait for my OK.
```

On day 1, 3, 7 and 14 of the run:

```
Clone RomanKuroptev/merge fresh and run the run-report for the run so far. Tell
me in plain words what it shows against the 8 launch items in
docs/spec/v4/spec-v4.md section 10, and show me 3 pictures of what Merge made.
Change nothing.
```

---

## Releasing a step

Use this after a step's slices are all merged and you are happy with what you saw:

```
Release the work of step <N> as the next version, following the newest runbook
in docs/spec/ (docs/spec/w7-runbook.md is the pattern). Do the release steps
yourself. Do it while Merge is awake only if the runbook says that is safe, and
never edit brain/budget.json in Merge's repo by hand while it is awake. When it
is live, check /health and tell me in plain words what version is running and
what Merge did in its first hour on it.
```
