# Merge 95 site designs (target pictures for L4 and spec v4 step 7)

These are the agreed designs for the website: the front page and every page and state behind it. Each design comes as two files:

- `<name>.png`: what it must look like. Compare your screenshot with this.
- `<name>.html`: the same design as plain HTML and CSS. Open it in a browser. Take the exact colours, sizes, borders, fonts and spacing from it.

The live, zoomable version is the Design artifact "Merge 95 front page" (Roman's account). These files are a copy of it, made on 2026-11-17.

## Rules for using them

1. **The words, pictures and numbers are fake.** "toaster.api", Kim, Anna, the dates, the counts and the memes only show the layout. The real pages fill every slot from Merge's real data (the today cards, project, diary, gallery, retired phases and notes). Never copy example text into the site.
2. **Rebuild them in the existing site builder** (apps/site, render.ts and style.ts). Do not paste these HTML files in as they are. The class names (`m95-win`, `m95-bar`, `m95-btn`, `m95-sunken`, `m95-tile`, `m95-night`) are a good starting set for style.ts.
3. **Colours and fonts come from styles.html**, which matches the colour table in look.md. If they disagree, look.md wins; tell Roman.
4. **Phone first.** On a phone every window opens full screen, and the taskbar stays at the bottom (phone-pages, phone-states). Nothing may scroll sideways at 390 px wide. Touch targets must be at least 44 px.
5. **The 3D parts are pictures here.** In the merge.exe window and world-overlay, the image stands in for the live 3D view. world-overlay only defines the 2D parts drawn on top (back button, centre cursor, "click to say hi", thought pop-up, label on an unfinished building, controls hint, the phone move stick).
6. **No mind or prompt changes.** If a design needs data Merge doesn't produce yet, show it as empty or leave it out. List what is missing in the PR.

## Which file is which

| File | What | Slice |
|---|---|---|
| front-laptop, front-phone | Front page: desktop, merge.exe live window, today.txt cards, project, notes | step 7 |
| styles | Colours, type, window, buttons, LIVE badge, thought pop-up, Merge's faces, card | L4 |
| diary, gallery, workshop, who-am-i, retired | Pages behind the desktop icons, opened as windows | L4 |
| start-menu | "◢ Merge 95" menu opened from the taskbar | L4 |
| card-open | A today card opened big, with "why", prev/next and share | step 7 |
| notes-chat | A visitor chat: up to 3 Merge replies, "Merge is typing", remembers the name | step 7 (spec v4 decision 6) |
| boot | Boot screen, about 1.5 s, first visit of the day only, skipped with reduced motion | L4 |
| asleep | 01:00–08:00 Stockholm: NO SIGNAL in merge.exe plus a friendly error window | step 7 |
| night | After sunset in Stockholm: dark purple windows, cyan grid | L4 |
| world-overlay | The 2D layer on top of the first-person world | L3 / L2 |
| phone-pages, phone-states | Every one of the above at 390 px wide | L4 / step 7 |

## Review

Look slices are not merged without review. Put a laptop (1440x900) and a phone (390 wide) screenshot of every changed page in the PR, next to the matching PNG from this folder.
