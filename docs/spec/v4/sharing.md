# Sharing: how a visitor passes Merge on

Added on 16 November 2026 from the outreach plan (https://claude.ai/artifact/HNNpg577bpEWMZkTZmNWMM). Roman decided the order: Merge must be fun, working and have the new look first, and posting starts after that. These pieces are built inside steps 4, 5 and 7 so they are ready on the first day of posting. They change only what visitors see and can take away. Nothing here changes what Merge does, and nothing here is a plan check, a quota or a prompt change.

## Why

People do not find a site. They find a clip or a picture in a feed and tap through. So every picture that leaves the site must carry the address, every pasted link must show today's picture, and a daily clip must cost Roman no editing.

## The pieces

### S1: the address (Roman, before step 7)

- Roman picks a short name and buys the domain. The same handle is reserved on TikTok, Instagram, YouTube, X and Bluesky. Nothing is posted yet.
- Until then the code reads the public address from one config value (`site.publicUrl`), so swapping it later is one line. No address is hard-coded in a picture or a template.
- Posts go out from Merge's own accounts with "built by Roman" in the bio (Roman, 16 November). Merge has no posting tool at launch; Roman posts by hand.

### S2: link preview (step 7, slice A and B)

- Every page has Open Graph and Twitter card tags: title, one-line description, image, address.
- The front page's image is `site/og/today.png` (1200 x 630), made by the site build from the first card of `today.json`: the card's picture, "Today Merge" and its caption, and the address. A work, project or note thread page uses its own picture the same way.
- Tests first: every route in the template world has the four tags and an image file that exists; a day with no new card still gives an image.

### S3: share button (step 7, slice B)

- Each card, work and project page has one "share" control. On a phone it opens the system share sheet (Web Share API) with the page's link; elsewhere it copies the link. A second control saves the picture.
- The saved picture is made by the site build, not in the browser: the work's picture with Merge's caption and the address in a strip at the bottom, in the MergeOS window style from `look.md`.
- Check: the share control works with the 3D world not loaded.

### S4: vertical timelapse (step 4, slice D)

- The project page keeps its timelapse as plain images, as step 4 says. In addition, when a session ends, the build writes `projects/<id>/share/timelapse.mp4`: the screenshots in order, 9:16 (1080 x 1920), 15 to 30 seconds, each caption shown as a short line, the address on the last second. Rebuilt after each session, only the newest is kept.
- Made by a plain script outside the sandbox from files already saved. No model call, no points, no cost to Merge.
- The project page has a "save video" link to it. This is what Roman posts.
- How the file is made (ffmpeg on the server or in the site build) is for plan mode to propose.

### S5: a reply you can show (step 5, slice A)

- A thread on `/notes/` has its own address and its own share picture: the visitor's note, Merge's reply, the given name, the address. Only notes that passed screening and are visible; a hidden note has no picture and its old picture is removed.
- The form's notice already says notes are public and permanent. Add "and can be shared as a picture".

### S6: a reason to come back (step 7, slice B)

- The project block on the front page shows where it stands in plain words from data that exists ("session 3, last worked on yesterday"). No invented end date and no progress bar: Merge decides when a project ends.
- While Merge sleeps, "Merge live" says it is asleep and when it wakes (Stockholm hours, shown in the visitor's time).

### S7: counting visitors (now)

- A cookie-free, privacy-friendly counter (for example GoatCounter's free plan) on the site and the viewer: visits per day, where they came from, returning visitors. Taps on "share" and "save video" are counted as events.
- No personal data, no cookie banner needed. `/under-the-hood/` says the site counts visits and how.

### S8: holding under a crowd (check before launch, step 8)

- The site and viewer are static files, so a crowd costs nothing there. The parts that touch the server are notes and "Merge live".
- Before any launch post, check with a small load test: `now.json` is cached, the notes limits (30 a day in total, 3 per visitor) hold, and a busy day cannot raise model spending past the wallet. If a limit turns visitors away, the form says so kindly ("Merge has read enough notes for today, come back tomorrow").

## Not in this file

Which channels, when to post and what to avoid are in the outreach plan, not in the spec.
