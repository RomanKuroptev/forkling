# Step 7: the front page

Spec: [`spec-v4.md`](spec-v4.md) sections 0 and 9, and v3.3 section 8 for the routes that stay.

## Why

A first-time visitor lands in a small 3D world with no idea who Merge is, the best things are a walk and a click away, and what changed since last time is a list of text lines. Roman decided on 16 November: one front door that leads with what Merge made today, with the 3D world one tap away.

## Before any code: mockups

**Do not build until Roman has picked a mockup.** The mockups are PNG images (Roman cannot see SVG widgets in his app), at phone width (390 px) and laptop width (1280 px), made from Merge's real content. They are made in the project thread, not by the coding session. The coding session starts from the picked image and this file.

## Build

Three slices, one PR each.

### Slice A: the data

- `site/today.json`, written by the site build from the world repo: `who` (one line, from `self/about.md`'s first sentence, cut to 120 characters), `cards` (up to 3 things from today, newest first, each `{ kind, title, caption, image, href, at }`), `project` (the `building` project worked on most recently: name, aim, latest screenshot, latest caption, session count, link), and `updatedAt`.
- What can be a card, in this order of preference: a project session's screenshot, a new work or sketch (its thumbnail), a change to the world (a new room or place, with a picture from the build step), a souvenir image. Text alone is never a card. With fewer than 3 from today, the newest from earlier days fill up, marked with their day.
- Tests first: the picking order; a day with nothing still gives 3 cards from earlier days; no card without an image.

### Slice B: the page

- `/` becomes the page of spec-v4 section 9, in that order. It must be readable and useful before the 3D world has loaded, and the 3D world must not load until the visitor asks for it ("Walk into Merge's world"), so the page is fast on a phone.
- "Merge live" reads `now.json` every 30 seconds and shows what it is doing and its latest thought. If the server is unreachable it shows the last committed state and says when it was.
- The note box is the existing form.
- The 3D viewer and Merge's site are served from one address. Old links to both keep working (redirects).
- "Since your last visit" becomes picture cards of the same kind, up to 8.
- `/under-the-hood/` holds what leaves the front page: budget and points, health warnings, the timeline of steps and reasons, the tick numbers. Nothing is deleted, only moved.

### Slice C: polish to the mockup

- Match the picked mockup at 390 px and 1280 px. One shared stylesheet, as v3.3 section 8 says.
- Check on Roman's laptop that the 3D world still reaches 30 frames per second (the W5 check that was never done).

### Sharing (inside slices A and B)

- Link previews, the share button, the come-back lines and the visitor counter of [`sharing.md`](sharing.md) S2, S3, S6 and S7. They take their style from the picked mockup and add nothing to the page's layout beyond one small control per card.

## Do not touch

- What Merge does. This step changes only what visitors see. No prompt, price or rule changes.
- The sandbox frame and policy for works and projects.

## Done when

1. All tests pass, and `pnpm test`, `pnpm typecheck` and the site build pass.
2. Screenshots of the built page at 390 px and 1280 px sit next to the mockup, and Roman says they match.
3. On a phone-sized window with a slow connection (browser throttling), the top of the page with the cards is usable in under 3 seconds, and the 3D world has not been downloaded.
4. Old links to the viewer and the site still land somewhere sensible.
