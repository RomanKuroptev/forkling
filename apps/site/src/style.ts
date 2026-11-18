/**
 * One stylesheet for the whole site, in the Merge 95 look (docs/spec/v4/look.md): every page is a window on Merge's desktop, with the
 * same content as before. Press Start 2P for the title bars, buttons and headings, VT323 for everything read, both from this site's own
 * `fonts/` folder. Colours are the look's own and are named once, in the first block. No script is needed to read a page.
 */
export const STYLE = `@font-face { font-family: 'Press Start 2P'; src: url('fonts/press-start-2p.woff2') format('woff2'); font-display: swap; }
@font-face { font-family: 'VT323'; src: url('fonts/vt323.woff2') format('woff2'); font-display: swap; }
:root {
  --deep: #2b0b5e;
  --purple: #8c1eff;
  --hot: #ff3fa4;
  --pink: #ff6ad5;
  --peach: #ffb36b;
  --sun: #fff27a;
  --teal: #7fe3d8;
  --cyan: #01cdfe;
  --face: #ffd6f1;
  --ink: #1a0b3b;
  --green: #39ff88;
  --quiet: #5a4a80;
  --white: #ffffff;
  --taskbar: 44px;
  --pixel: 'Press Start 2P', monospace;
  --read: 'VT323', monospace;
}
* { box-sizing: border-box; }
html { background: var(--deep); }
body {
  margin: 0;
  min-height: 100vh;
  padding-bottom: calc(var(--taskbar) + 16px);
  color: var(--ink);
  font: 20px/1.3 var(--read);
  /* The sunset down to the horizon, then the pink grid floor. */
  background:
    repeating-linear-gradient(to right, rgb(255 64 209 / 55%) 0 2px, transparent 2px 64px) 0 100% / 100% 34% no-repeat fixed,
    repeating-linear-gradient(to bottom, rgb(255 64 209 / 55%) 0 2px, transparent 2px 28px) 0 100% / 100% 34% no-repeat fixed,
    linear-gradient(to bottom, #3a1280, var(--deep)) 0 100% / 100% 34% no-repeat fixed,
    linear-gradient(to bottom, var(--deep) 0%, var(--purple) 25%, var(--hot) 50%, var(--peach) 66%) fixed;
}
.shell { display: flex; align-items: flex-start; gap: 24px; max-width: 1180px; margin: 0 auto; padding: 16px; }
.icons { display: none; }
@media (min-width: 900px) {
  .icons { display: grid; grid-template-rows: repeat(5, max-content); grid-auto-flow: column; grid-auto-columns: 112px; gap: 12px 8px; flex: none; position: sticky; top: 16px; align-content: start; }
}
.icon { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; text-decoration: none; color: var(--white); text-shadow: 2px 2px 0 var(--ink); font-size: 20px; line-height: 1; }
.icon-img { display: grid; place-items: center; width: 64px; height: 64px; background: var(--face); color: var(--ink); border: 2px solid; border-color: var(--white) var(--ink) var(--ink) var(--white); box-shadow: inset -2px -2px 0 var(--purple); font: 16px var(--pixel); text-shadow: none; image-rendering: pixelated; }
.icon[aria-current] .icon-img { background: var(--sun); }
.icon:focus-visible, .icon:hover { outline: 2px dotted var(--white); outline-offset: 4px; }
.window { flex: 1; min-width: 0; max-width: 780px; margin: 0 auto; background: var(--face); border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink), inset 2px 2px 0 var(--white); }
.title { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 8px; background: linear-gradient(to right, var(--purple), var(--hot)); color: var(--white); font: 10px/1.4 var(--pixel); }
.title span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btns { display: flex; gap: 4px; flex: none; }
.btns i { display: block; width: 16px; height: 14px; background: var(--face); border: 2px solid; border-color: var(--white) var(--ink) var(--ink) var(--white); }
.window header, .window main { padding: 0 16px; }
.window main { padding-bottom: 20px; overflow-wrap: anywhere; }
header { padding-top: 10px; padding-bottom: 6px; border-bottom: 2px dashed var(--purple); }
.name { font: 14px/1.4 var(--pixel); color: var(--ink); text-decoration: none; }
a { color: var(--purple); text-underline-offset: 3px; }
a:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
h1 { font: 16px/1.5 var(--pixel); margin: 1rem 0 0.5rem; }
h2 { font: 12px/1.5 var(--pixel); margin: 1.4rem 0 0.4rem; }
h3 { font: 11px/1.5 var(--pixel); margin: 0 0 0.3rem; }
p { margin: 0.5rem 0; }
.quiet { color: var(--quiet); font-size: 19px; }
.provenance { color: var(--quiet); font-style: italic; margin-top: -0.2rem; }
.notes-disclosure ul { margin: 0.2rem 0; padding-left: 1.2rem; }
#note-form input, #note-form textarea { width: 100%; max-width: 32rem; font: inherit; color: var(--ink); background: var(--white); border: 2px solid; border-color: var(--ink) var(--white) var(--white) var(--ink); border-radius: 0; padding: 6px 8px; }
#note-form label { color: var(--quiet); }
.note-ok { color: var(--ink); }
.note-error { color: var(--hot); font-weight: bold; }
.notes blockquote, blockquote { margin: 0.4rem 0; padding: 6px 12px; background: var(--white); border: 2px solid var(--ink); }
.requests { list-style: none; padding: 0; }
.requests li { border-top: 2px dashed var(--purple); padding: 0.8rem 0; }
.card { background: var(--white); border: 2px solid var(--ink); padding: 12px 16px; margin: 12px 0; }
.card h1, .card h2 { margin-top: 0; }
.photo { margin: 0; }
.photo img { width: 100%; max-width: 24rem; height: auto; border: 2px solid var(--ink); }
.photo figcaption { color: var(--quiet); }
.drawing svg { width: 100%; max-width: 24rem; height: auto; background: var(--white); border: 2px solid var(--ink); }
button, .play, .note-answer-btn { font: 10px/1 var(--pixel); min-height: 44px; padding: 4px 14px; cursor: pointer; color: var(--ink); background: var(--face); border: 2px solid; border-color: var(--white) var(--ink) var(--ink) var(--white); box-shadow: inset -2px -2px 0 var(--purple); border-radius: 0; }
button:active, .play:active { border-color: var(--ink) var(--white) var(--white) var(--ink); box-shadow: inset 2px 2px 0 var(--purple); }
.script { white-space: pre-wrap; }
.history { color: var(--quiet); font-size: 19px; }
.why { list-style: none; padding: 0; }
.why li { padding: 6px 0; border-bottom: 2px dashed var(--purple); }
.why time { color: var(--quiet); margin-right: 6px; }
.belief { font-size: 17px; }
li.now { font-weight: bold; }
table { border-collapse: collapse; }
td { padding: 2px 12px 2px 0; }
dt { font-weight: bold; margin-top: 8px; }
dd { margin: 0; }
.pager { display: flex; justify-content: space-between; }
.shelf, .strip { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.strip { grid-template-columns: 1fr; }
.strip > li > .shelf { margin-top: 4px; }
.work img { display: block; max-width: 100%; height: auto; border: 2px solid var(--ink); }
.work-frame iframe { display: block; width: 100%; max-width: 640px; height: 480px; border: 2px solid var(--ink); background: var(--white); }
.taskbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; height: var(--taskbar); display: flex; align-items: center; gap: 12px; padding: 0 8px; background: var(--face); border-top: 2px solid var(--white); box-shadow: 0 -2px 0 var(--purple); }
.start { position: relative; }
.start-toggle { position: absolute; opacity: 0; width: 1px; height: 1px; }
.start-btn { display: flex; align-items: center; gap: 8px; cursor: pointer; min-height: 36px; padding: 6px 10px 5px 8px; font: 10px/1 var(--pixel); color: var(--ink); background: var(--face); border: 2px solid; border-color: var(--white) var(--ink) var(--ink) var(--white); box-shadow: inset -2px -2px 0 var(--purple), inset 2px 2px 0 var(--white); }
.start-toggle:checked + .start-btn { border-color: var(--ink) var(--white) var(--white) var(--ink); box-shadow: inset 2px 2px 0 var(--purple); }
.start-toggle:focus-visible + .start-btn { outline: 2px dotted var(--ink); outline-offset: 2px; }
.menu { display: none; }
.start-toggle:checked ~ .menu { display: flex; }
.logo { display: grid; grid-template-columns: 7px 7px; gap: 1px; transform: skewY(-6deg); }
.logo i { display: block; width: 7px; height: 7px; background: var(--hot); }
.logo i:nth-child(2) { background: var(--cyan); }
.logo i:nth-child(3) { background: var(--sun); }
.logo i:nth-child(4) { background: var(--green); }
.menu { position: absolute; left: 0; bottom: calc(var(--taskbar) - 4px); flex-direction: column; min-width: 14rem; max-width: 92vw; padding: 4px; background: var(--face); border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); }
.menu a { display: block; padding: 10px 12px; min-height: 44px; color: var(--ink); text-decoration: none; font-size: 22px; line-height: 1.2; }
.menu a:hover, .menu a:focus-visible, .menu a[aria-current] { background: var(--purple); color: var(--white); outline: none; }
.tray { margin-left: auto; font-size: 18px; color: var(--quiet); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
`
