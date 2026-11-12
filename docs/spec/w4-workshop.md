# W4: Workshop and site

Exported from [`spec.md`](spec.md) (v3.3) on 12 November 2026 for milestone W4. Where the spec gives a number, the number is the rule. Sections: 7 (the workshop), 8 (the website), the works line of 9.9, 10.2 (the build job), the repeated-work nudge of 12.3, 12.4 items 6 and 7, and 12.7. The sandbox proof result and the slice plan are at the end.

## 7. Workshop

A work is one self-contained HTML file made by one Sonnet call in the build job, checked in a headless browser, and shown only inside a sandbox with no network **(pending decision 2)**.

### 7.1 What a work is

- Files: `works/<id>/index.html`, `works/<id>/meta.json`, `works/<id>/thumb.png` (made by the check).
- `meta.json`: `id`, `title` (up to 40 characters), `kind` (`art`, `game`, `tool`, `sound`, zine or mem`e`), `about` (up to 200 characters), `interest`, `made`, `remixOf` (an earlier work's id or null), `constraint` (12.4), `status` (`shelf` or `scrap`), `scrapReason`, `installedIn` (a place slot or null).
- `index.html` is at most 150 KB, with inline CSS and JavaScript. It may load only the vendored libraries in `site/lib/`: p5.js, Tone.js and three.js, at versions pinned in the engine and served from Merge's own site. **(v3: Merge's own skill modules moved to Later, so a work is fully self-contained.)**
- No network, storage, cookies, forms, pop-ups, camera, microphone or location.

### 7.2 The tinker call

Input: the seed, the idea and reason from the step, the top interests, up to 5 souvenirs it chooses from, the source of the work being remixed if there is one, and the offers from section 12.4. Output (structured): `meta` and `html`.

### 7.3 The check

In the build job, in this order:

1. Parse the HTML; enforce size and the load rules above; reject any use of `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, `localStorage`, `indexedDB`, `document.cookie`, `window.open` or `<form>`.
2. Load it in headless Chromium (Playwright) with the production sandbox and content security policy, for 5 seconds.
3. Fail on an uncaught error, on a library that did not load, on a frame that never renders, or on a screenshot that is a single colour.
4. Save the screenshot as `thumb.png`.

**Proved before W****4**** starts (v3):** a one-hour test page shows that a sandboxed work can load p5.js from `site/lib/` under the policy in 7.4 and cannot reach the network. If the policy blocks the library, the build inlines the library into the page and the size limit applies to Merge's own code only.

On failure: one repair call (Sonnet) with the error, then the check again. A second failure saves the work with `status: scrap` and the reason; scrapped works are shown in the scrap bin.

### 7.4 How it is shown

```
<iframe sandbox="allow-scripts" src="works/<id>/index.html">
Content-Security-Policy: default-src 'none'; script-src 'self' 'unsafe-inline';
  style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:;
  connect-src 'none'; form-action 'none'
```

GitHub Pages cannot send headers, so the policy is a `<meta http-equiv>` tag the build inserts as the first element of `<head>`; the check verifies it is there. Without `allow-same-origin`, the work cannot read the site or the visitor's data.

In the 3D world, a screen slot shows the thumbnail; clicking it opens the work in a panel.

### 7.5 Remix

A tinker step may target an earlier work. The call gets that work's source, and the result is a new work with `remixOf` set. This is how Merge builds on what it made at launch; a library of reusable skills is in Later.

### 7.6 Sketches (v3.1)

A tinkerer needs to make small things often. A sketch is a work of at most 4 KB made by one Haiku step call, with the same rules, check and sandbox as any work, and `size: sketch` in its meta. Quota: 1 a day, on top of the 2 full works a week. A sketch that fails the check goes to the scrap bin with no repair call. The workshop page shows sketches as a daily strip.

### 7.7 Memes (v3.1)

- A work of kind `meme` is Merge's own drawing of a meme format, made in code (canvas or SVG shapes), with Merge's own caption about its own situation. It may be a sketch or a full work.
- It never contains the original template image, a real person's likeness, or a caption aimed at a visitor or a named private person. The seed's rule stands: the joke is on Merge, the internet and its strange situation.
- Merge may only use a format it has looked at (7.8) and read about (a Wikipedia article or the format's Imgflip record), and the work's meta names both as sources, so a visitor can see what it is riffing on.

### 7.8 Looking at images (v3.1)

Merge may look at up to 20 images a day: an image on something it is reading, or a meme format. A look is one Haiku call with the image and the read call's context; it returns a description of up to 60 words and what Merge thinks of it, stored on the trail. Images are fetched by code from allowed hosts only, at most 2 MB, and are passed as data. This brings back vision in a small, fixed form; the eye cam stays retired.


## 8. The website

Merge's GitHub Pages site is rendered by `apps/site` from the world repo's files; nothing on it is written by hand and no page calls a model. The only live parts are `now.json` and the note form, served by the server.

| Route | Shows |
|---|---|
| `/` | The 3D world full screen, with an overlay: what Merge is doing now and why, the "since your last visit" panel, and links to the pages below |
| `/places/` | A top-down map of the chunks with every place, its neglect level, and its last change; a list under it |
| `/places/<id>/` | The place as a page: name, purpose, tags, every exhibit (images with credits, quotes with source links, works embedded in the sandbox, plaques), the history, related places |
| `/workshop/` | The shelf (thumbnails), what is on the bench now, and the scrap bin with reasons |
| `/workshop/<id>/` | The work in its sandbox, its notes, the constraint it was given, what it remixes |
| `/trails/`, `/trails/<id>/` | Every trip as a chain of reads with Merge's reactions and the souvenirs kept; the pile; each source's weekly numbers (6.6) |
| `/diary/`, `/diary/<date>/` | The diary written by the sleep rewrite |
| `/about/` | `self/about.md`, the top interests, current beliefs, the wants list, and links to every earlier weekly version with the reason Merge gave for changing it |
| `/requests/` | Merge's weekly requests to Roman and his answers (9.5), and its build requests with their status (10.3) |
| `/timeline/` | The existing "why?" timeline: every step, its reason and its plan |
| `/notes/` | The notes board: every note, where it was left, its status (waiting, answered, kept, inspired something, left unanswered), Merge's reply, newest first, and a button to write one |
| `/archive/` | The pet-era journal and art, read-only **(pending decision 3)** |
| `/feed.xml` | RSS: places founded, expanded or renamed, works shelved, diary entries |

Before W5 there is no 3D world of places: works are shown on the workshop page only, `/` keeps the current island, and trails, souvenirs and the pile are shown on `/trails/` only.

- **Since your last visit:** the browser stores the time of the last visit in `localStorage` (wrapped so a blocked store just hides the panel). The panel lists up to 8 changes since then from `site/changes.json`, which the build writes from commits: "expanded House of Lights", "kept a souvenir", "shelved a work".
- **Rebuilds:** `pages.yml` builds the site after any commit that touches `places/`, `souvenirs/`, `trails/`, `works/`, `journal/`, `self/` or `notes``/`, at most once every 30 minutes. Tick-only commits (`tick:`) do not rebuild.
- **Look:** one shared stylesheet; each place page takes its accent colour from the place's palette.

### 9.9 (works only)

- **Works.** Merge may retire one of its works, with a reason. A retired work leaves the shelf and the screens and moves to `/workshop/retired/`, where it can still be opened. Up to 2 a week; it may bring one back.

### 10.2 The build job

The server's build worker runs these kinds, one at a time, with the same code `build.yml` runs today; its results land as pull requests checked by `validate.yml`. The build worker arrives with the server in W3 and gets its first job (a work) in W4 and its first place job in W6.

| Kind | Model | Writes | How it lands |
|---|---|---|---|
| expand, found | Sonnet, one structured call | `places/<id>.json`, `wishes/` | Data PR, auto-merge after `validate.yml` |
| tinker | Sonnet, one call plus at most one repair | `works/<id>/` | PR; auto-merge after the check **(pending decision 2)** |

The Claude Code Action and coded Pages projects from M7 are retired; tinker replaces them at a fixed, known cost per build. As today, the job reports back only through `mind/builds/<id>.result.json`. The Monday kit-part build of version 2 is in Later. Since version 3.2 the found build runs only as the fallback in 10.3.

### 12.3 (the work nudge)

For each of these, code works out whether the rule would have fired and writes it to the week's novelty block in `mind/health.json`. Nothing is rejected. Each has a switch in the world repo's `mind/config.json` that only Roman changes.

| Nudge | Would fire when |
|---|---|
| Repeated work | A work's title or `about` has similarity over 0.5 with one of the last 10, or it is the same `kind` as each of the previous 2 |

### 12.4 (items 6 and 7) and 12.7

6. **Untried things.** The tinker call is shown the libraries and kit parts Merge has never used.
7. **Remix** (7.5) and **old places, new material** (the revisit call gets the souvenirs kept since that place last changed).

W0: calibration. W1: similarity, worn phrases and the plan-level nudges. W2: souvenir and trip-start rails, stranger's doors, the one-host nudge. W3: thought-line rail and the last five thoughts. W4: work nudges, untried things, remix. W6: place nudges, constraint draw, collisions. W7: the boredom event and the health block.

## Sandbox proof (slice 1, 12 November 2026): passed

The one-hour test of 7.3 is `apps/mind/test/browser/sandbox-proof.test.ts`. It serves a page with `<iframe sandbox="allow-scripts">` from one loopback origin (standing in for GitHub Pages) and counts every request that reaches a second origin ("the outside"). The work has the 7.4 policy in a `<meta>` tag.

- **Libraries load.** p5.js (classic script) draws a red square on its canvas; Tone.js (classic script) defines `Tone.Synth`; three.js (an ES module, with `three.core.js` beside it) defines `Scene`. All three come from the site's own `lib/` under `script-src 'self' 'unsafe-inline'`. **No inlining is needed**, so the size limit applies to the work's own code.
- **The network is closed.** `fetch`, `XMLHttpRequest`, `WebSocket`, an image, a script and a stylesheet pointed at the outside are all blocked, with CSP violation events, and nothing reaches the outside server. `navigator.sendBeacon` returns `true` (it says "queued") but nothing arrives.
- **Isolation.** Without `allow-same-origin` the work cannot read the page around it, `localStorage` or `document.cookie`.
- **Control.** The same work without the policy does reach the outside, so the test can see a leak.
- **three.js needs one header.** A sandboxed page has an opaque origin, so its module script needs the site to send `access-control-allow-origin`. GitHub Pages sends `Access-Control-Allow-Origin: *` on every file (checked on a public Pages site); a site without it fails to load the module (tested).
- **A limit the policy cannot close.** A work can navigate its own frame to another address (`location.href = ...`), and no policy stops that; the request goes out. The page around it is not reachable, and the visitor's data is not readable, so what leaks is the visitor's address to that host. The check therefore bans `location` and `<meta http-equiv="refresh">` in the static check (slice 2) and fails a work that navigates during its 5 seconds (slice 3). A work built to hide that from a text scan is still contained by the sandbox, and only costs the visitor an address.

## Slice plan (one PR each, tests first, merged after CI)

Done when (spec 16): in one live week at least 2 works pass the check and a sketch appears on at least 5 days; a test work that calls `fetch` is rejected; a test proves a shelved work loads its library and cannot reach the network; every route built so far renders from the template world; the ledger's Sonnet rows are compared with section 13.

Decisions: Roman chose retire and restore through a tinker step on an existing work, and sketches landing as a direct commit after the server's check (full works through a pull request). Defaults I set: 3 sketches a day (9.8, v3.3; 7.6 and 13 are older), no constraint draw until W6, `/workshop/` and `/feed.xml` always built, libraries as exact-version devDependencies of `apps/site`, full works landed through the GitHub REST Git Data API, manual pages for tinker offered for untried libraries, memes drawn without `<img>`, `data:` images or `url(`.

1. **Spec export and the sandbox proof** (this file, Playwright, the vendored libraries, the browser tests).
2. **Work schema, policy page and static check.**
3. **The browser check.**
4. **The tinker call** (Sonnet, one repair, scrap).
5. **Sketches and the verb wiring** (the "runs as rest" stub, the daily sketch count).
6. **Full works through a pull request** (the worker's `tinker` handler, `validate.yml`, the `buildResult` trigger).
7. **Remix, retire and restore, work nudges.**
8. **Manuals and Imgflip behind verbs.**
9. **Memes.**
10. **Site: the workshop.**
11. **Site: feed and "since your last visit".**
12. **Setup, docs, release prep.**
