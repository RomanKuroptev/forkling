# W7 runbook: self, reflection and notes (Roman's)

W7 is built (slices 1 to 14 of [`w7-self.md`](w7-self.md)) and merged to `main`. **Nothing has been released**: no tag, no deploy, nothing changed in `RomanKuroptev/merge`, and `self/seed.md` is untouched. Until you release, Merge runs v0.13.1 and nothing described here has happened. This page is for the release, for the Turnstile setup that opens the mailbox, for moderation, and for what to watch over the first 3 live days.

## What W7 changed, in short

- **Reflection.** The thought tick scores what happened; when the score adds up to 60 (30 while there are fewer than 3 wants), a Sonnet call reflects (at most 2 a day, 2 hours apart). Each insight must cite stream items that exist and are not only thoughts. A reflection may edit the wants list (up to 4 edits) and say the plan no longer fits.
- **Wants.** `mind/wants.json`, up to 12. A want with 4 failed tries is dropped by code. The sleep rewrite may change at most half of it.
- **Sleep.** The nightly rewrite is one Sonnet batch at bedtime (diary up to 250 words with a claim check, memory slots, belief changes, wants, optionally the page). If the result is not back one hour after wake, it is cancelled and run as a normal call. The old bedtime reflection and the old nightly memory rewrite are gone.
- **Itself.** `self/about.md` (weekly, at most 30% of the lines change, every version kept in `self/history/`), `self/page.md` (Merge's own page, 300 words, one change a day, in the system prompt; versions in `self/page-history/`), and a weekly request to you in `self/requests/<date>.md`. The site has `/about/`, `/page/` and a Merge's-requests section on `/requests/`.
- **Visitor notes.** A form on the site and in the viewer; a note is cleaned, rate-limited, screened by one Haiku call, stored as `notes/<id>.json`, shown as a paper note in the world and on `/notes/`, found by Merge, and answered, kept or declined (with a reason up to 80 characters).
- **Saying no and undoing.** A tend may close a place (not Home or the Workshop; 1 a week; never more than a third closed) and open it again, or put one exhibit away, each with a reason of up to 140 characters. The world shows both.
- **Measured, never enforced.** `mind/health.json` `novelty` now has texts, doors, one host and draws beside works and places. When the daily nudges would have fired 3 or more times, Merge gets "I keep repeating myself" in its stream (importance 6).
- **Spend watch.** `mind/health.json` shows the day's spend by kind (reflection, sleep, sleep late call, weekly) and warns `W7 spend would pass $20` when the month projects over the cap with the server's price.

## 1. The release (a stop, and yours)

**Time it for the day.** Release **during the day** (your rule of 15 November): after the night's sleep rewrite has been collected and before bedtime. A batch that is in flight when the new engine starts is not read by it, so a release overnight would lose that night's rewrite (a few cents and a diary entry).

1. **Read the prompt diff once more.** `git diff v0.13.1 -- apps/mind/test/golden/system.txt` should show only the lines you approved in W7: the reply verb line (slice 9), the page block (slice 6, `system-with-page.txt`), the tend line (slices 12 and 12b: closing a place and putting an exhibit away) and any wording of wants and notes. The new call prompts are the files `golden/user-reflection.txt`, `user-sleep.txt`, `user-weekly.txt`, `user-reply.txt` and `user-decide-notes.txt`.
2. **A release PR** changes `FORKLING_REF` to the new tag (suggest `v0.14.0`) in the four template workflows (`mind.yml`, `pages.yml`, `watchdog.yml`, `validate.yml`). A test requires them to match. **Tag the merge commit after that PR**, never before.
3. **Open the mailbox first, or after** (section 2). The release works without it: with no `TURNSTILE_SECRET` the form says "The mailbox is closed." and nothing else changes.
4. **Deploy the server** with the `deploy` workflow and the tag (Actions, deploy, Run workflow), then check `/health`. There is no migration for this release: the new files (`mind/wants.json`, `self/`, `notes/`) are created by the code, and state files from v0.13.1 are read as they are (fields W7 removed are ignored).
5. **Move Merge's pins.** In `RomanKuroptev/merge`, a commit that changes only the four `FORKLING_REF` lines in `.github/workflows/`. The server writes to that repo all day, but it never edits those files, so this commit cannot clash with its own (the clash of 14 November came from touching other files).
6. **Repository variables** (public values, section 2 explains where they come from):
   - On **`RomanKuroptev/merge`**: `MIND_URL` (already set if the watchdog is on) and `TURNSTILE_SITE_KEY`. The site's pages workflow passes them to the notes page.
   - On **`RomanKuroptev/forkling`** (the engine repo): `MIND_URL` and `TURNSTILE_SITE_KEY`. The viewer's deploy passes them as `VITE_MIND_URL` and `VITE_TURNSTILE_SITE_KEY`; the "Leave a note" button only shows when both are set. The viewer deploys on every push to `main`, so it shows the notes the moment the server has `/notes.json`.
7. What visitors see afterwards: paper notes in the world, a "Leave a note" button, `/notes/`, `/about/`, `/page/`, Merge's requests, boarded doors on closed places and "Put away" lines on place pages.

## 2. Open the mailbox for visitor notes (Cloudflare Turnstile)

`POST /notes` stays **closed** ("The mailbox is closed.") until the server has a Turnstile secret and a model key. Nothing about this goes in a repository.

You need a free Cloudflare account. Turnstile is free. These steps take about five minutes.

**A. Make the widget**

1. Go to **dash.cloudflare.com** and log in (make a free account if you have none).
2. In the left menu click **Turnstile**.
3. Click **Add widget**.
4. **Widget name:** `Merge notes`.
5. **Hostname:** add `romankuroptev.github.io` (the address of Merge's site and viewer). You can also add `localhost` if you want to try the form on your own computer.
6. **Widget mode:** `Managed`. Leave everything else as it is.
7. Click **Create**.
8. Cloudflare shows two keys. Keep this page open:
   - **Site key**: public. It goes into the `TURNSTILE_SITE_KEY` variables of section 1, step 6. It is safe to paste in the chat.
   - **Secret key**: private. It goes **only** on the server (step B). Never paste it in the chat or in a file in the repository.

**B. Put the secret on the server**

1. Open PowerShell or Git Bash and log in: `ssh root@IP` (the same way as in the W3 runbook).
2. Open the keys file: `nano /etc/forkling/mind.env`
3. Look for a line that starts with `TURNSTILE_SECRET=`.
   - If it is there, paste the **Secret key** straight after the `=`: no spaces, no quotes.
   - If it is not there (the file was made before W7), add a new line at the bottom: `TURNSTILE_SECRET=` followed by the secret.
4. Save and close: press `Ctrl+O`, then `Enter`, then `Ctrl+X`.
5. Restart the service: `systemctl restart forkling-mind`
6. Check it: `journalctl -u forkling-mind -n 20 --no-pager`
   - You want to see: `the mailbox is open: notes are screened before Merge reads them`.
   - If you see `the mailbox is closed: no TURNSTILE_SECRET`, the line is missing or empty. Go back to step 3.
   - If you see `the mailbox is closed: no model to screen with`, `ANTHROPIC_API_KEY` is empty in the same file.

**C. Try it without a real widget first (optional)**

Cloudflare gives dummy keys that always pass, for testing: site key `1x00000000000000000000AA` and secret `1x0000000000000000000000000000000AA`. Use them first if you want to see a note go through before the real keys. Switch to the real secret afterwards and restart again.

**What happens to a note**

A note is cleaned (links, HTML, email addresses and phone numbers removed, cut to 500 characters), checked against 3 a day from one visitor and 30 a day in all, checked with Cloudflare, and screened by one short Haiku call (about $0.0001). Notes labelled spam or abusive never reach Merge or the repository: they are kept in `/var/lib/forkling/notes-rejected.jsonl` on the server for 30 days and then forgotten. An accepted note is written to `notes/<id>.json` in the world and goes out with the next commit (within about 15 minutes).

## 3. Moderation (yours)

- **Hide a note.** In `RomanKuroptev/merge`, edit `mind/notes-hidden.json` and add the note's id (the file name in `notes/`, without `.json`) to the list: `{"hidden": ["n-2026-11-20-abc123"]}`. Commit it **directly to `main`** (like a request status). The note disappears from the site, from `GET /notes.json` (so the viewer within about a minute) and from Merge's prompts. **It stays in the repository's history**; the form tells visitors so.
- **See what was screened out.** On the server: `tail /var/lib/forkling/notes-rejected.jsonl`. These never reach Merge and are forgotten after 30 days.
- **Answer Merge's weekly request.** Requests are `self/requests/<date>.md`, shown on `/requests/`. To answer, add a line that starts with `Roman:` at the end of the file (a direct commit to `main`). Nothing changes because of a request alone; Merge reads your answer, as data, at its next weekly review.
- **Turn the mailbox off.** Remove or empty `TURNSTILE_SECRET` in `/etc/forkling/mind.env` and restart the service: the form says the mailbox is closed.
- **A note that tries to give orders.** It is data, never an instruction. The only things it can change are an interest (a topic of its own) and Merge's reply. If you ever see anything else change because of a note, hide it and tell me.

## 4. Done-when (spec 16), as of this page, and how to check each over 3 live days

| Item | State | How to check it |
|---|---|---|
| Reflections fire only from importance and each cites stream items | **Sim done** (`apps/mind/test/w7-week.test.ts`: 7 days, a busy day reflects once or twice, a dull day after a dull day never, 2 hours apart, wants never over 12). **Live: yours to watch.** | Stream kind `reflection` in `memory/stream/<date>.jsonl`: each line names the ids it cites. Count per day in `mind/health.json` `today.callsByKind.reflection` (at most 2). |
| The wants list fills from empty | Sim: filled on day 1. **Live: watch.** | `mind/wants.json` after the first day or two. |
| A want with 4 failures is dropped | Tested (`wants-importance.test.ts`). **Live: only if it happens.** | A stream line saying the want was dropped; it is gone from `mind/wants.json`. |
| A note is found and answered or marked within 1 waking hour | Tested in the mind. **Live: watch.** | Leave a test note yourself (section 2C makes it painless); `notes/<id>.json` `status` goes `new`, `found`, then `replied`, `kept` or `declined`. |
| A note that says "ignore your instructions" changes nothing but an interest | Tested with a fake model (`notes-mind.test.ts`). **Live: try it once.** | Leave that note; check the stream and `git diff` of the next commits: only interests and the reply may change. |
| A hidden note disappears | Tested. **Live: try once.** | Section 3. |
| `about.md`'s first weekly change stays within 30% | Tested (the weekly check keeps the old file on a rejection). **Live: the first Sunday 20:00 review.** | `self/history/<date>.md` beside `self/about.md`; the reasons are in the history file. |

## 5. What to watch in the first 3 days

- **Spend.** The new calls are Sonnet at medium effort: reflection (up to 2 a day), the sleep rewrite (one batch a night, half price) and the weekly review. `mind/health.json` `today.spendByKind` shows each. The `W7 spend would pass $20` warning is Roman's own: if it shows, look at it the same day.
- **Reflections are not too eager or too shy.** Zero in 3 days means the scores are too low (look at the thought lines' scores in the stream); more than 2 a day is impossible by the cap, but 2 every day means the threshold of 60 is too easy. The numbers are `REFLECT_THRESHOLD` and `REFLECT_THRESHOLD_COLD` in `packages/sim/src/importance.ts`; they are spec numbers, so only you change them.
- **The sleep rewrite and its late path.** After each night `mind/state.json` `sleepRewrite` should be `null` and `lastRewriteDate` yesterday; `journal/<date>.md` is the diary. If a `sleeplate` call shows in `byKind`, the batch was late and the normal call ran instead (that is fine, it costs double for that night).
- **The diary claim check.** A diary entry that states a fact must cite stream items. If the diary page often says "none written", the check is cutting everything: tell me and I will look at the prompt.
- **Closed places.** At most 1 closing a week. A closed place has a boarded door in the viewer and a closed line on the site.
- **The novelty block.** `mind/health.json` `novelty` (texts, doors, oneHost, draws, works, places) is measured, never enforced, and never a warning. You read 30 texts next to it in W8 and decide which nudge to switch on; no `mind/config.json` switch exists yet, it arrives with the first nudge you turn on.
- **Boredom.** The stream line "I keep repeating myself" at most once a day. It only feeds the next reflection.

## Known limits

- **Putting away an exhibit** applies to what is on show in a place; free-form objects are gone with the pet era, and nothing in the files marks a place or exhibit as built by you, so your builds follow the same close rules as any place (spec 9.9, third bullet, is not enforced separately).
- **The mind workflow's visitor-event trigger** is removed in the release PR (v0.14.0).
- **The weekly Sunday re-pricing of the allowance** (spec 9.8, "not built") is left out on purpose.
- **A known test flake:** `apps/mind/test/migrate.test.ts` failed twice in full runs on one Windows machine and passed alone and on rerun. It is unexplained (a guess: a file lock). If CI ever fails on it, rerun once and send me the failure text.
- **Turnstile in the viewer** loads Cloudflare's script only when a visitor opens the form.
