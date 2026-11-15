# W7 runbook (Roman's)

Slice 14 finishes this page (the release, moderation, what to watch over the 3 live days). The Turnstile steps are here first, because slice 8 needs them.

## Open the mailbox for visitor notes (Cloudflare Turnstile)

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
   - **Site key**: public. It goes into the site and the viewer later (slices 10 and 11). Send it to me when you are done. It is safe to paste in the chat.
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

A note is cleaned (links and HTML removed, cut to 500 characters), checked against 3 a day from one visitor and 30 a day in all, checked with Cloudflare, and screened by one short Haiku call (about $0.0001). Notes labelled spam or abusive never reach Merge or the repository: they are kept in `/var/lib/forkling/notes-rejected.jsonl` on the server for 30 days and then forgotten. An accepted note is written to `notes/<id>.json` in the world and goes out with the next commit (within about 15 minutes).

## Release timing

Release W7 **during the day** (Roman, 15 November), so no overnight batch is lost: tag and move Merge's pins after the night's sleep rewrite has been collected and before bedtime.
