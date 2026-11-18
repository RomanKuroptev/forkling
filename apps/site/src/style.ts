/**
 * One stylesheet for the whole site, in the Merge 95 look (docs/spec/v4/look.md): every page is a window on Merge's desktop, with the
 * same content as before. Press Start 2P for the title bars, buttons and headings, VT323 for everything read, both from this site's own
 * `fonts/` folder. Colours are the look's own and are named once, in the first block. No script is needed to read a page.
 */
import { ICONS } from './icons.ts'

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
  --quiet: #3d2c6b;
  --white: #ffffff;
  --taskbar: 44px;
  color-scheme: light;
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
  font: 26px/1.25 var(--read);
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
.icon { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; text-decoration: none; color: var(--white); text-shadow: 2px 2px 0 var(--ink); font-size: 24px; line-height: 1; }
.icon-img { display: grid; place-items: center; width: 72px; height: 72px; background: var(--face); border: 2px solid; border-color: var(--white) var(--ink) var(--ink) var(--white); box-shadow: inset -2px -2px 0 var(--purple); }
.icon-img { background-repeat: no-repeat; background-position: center; background-size: 64px 64px; image-rendering: pixelated; }
${Object.keys(ICONS).map((k) => `.ic-${k} { background-image: url('icons/${k}.svg'); }`).join('\n')}
.icon[aria-current] .icon-img { background-color: var(--sun); }
.icon:focus-visible, .icon:hover { outline: 2px dotted var(--white); outline-offset: 4px; }
.window { flex: 1; min-width: 0; max-width: 780px; margin: 0 auto; background: var(--face); border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink), inset 2px 2px 0 var(--white); }
.title { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 8px; background: linear-gradient(to right, var(--purple), var(--hot)); color: var(--white); font: 10px/1.4 var(--pixel); }
.title span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btns { display: flex; gap: 4px; flex: none; }
.btns i { position: relative; display: block; width: 18px; height: 16px; background: var(--face); border: 2px solid; border-color: var(--white) var(--ink) var(--ink) var(--white); }
/* _ minimize, a box to maximize and a cross to close, drawn in the squares. */
.btns i:nth-child(1) { background-image: linear-gradient(var(--ink), var(--ink)); background-size: 8px 2px; background-position: 50% 78%; background-repeat: no-repeat; }
.btns i:nth-child(2)::after { content: ''; position: absolute; left: 3px; top: 2px; width: 8px; height: 7px; border: 2px solid var(--ink); border-top-width: 3px; }
.btns i:nth-child(3) { background-image: linear-gradient(45deg, transparent 42%, var(--ink) 42% 58%, transparent 58%), linear-gradient(-45deg, transparent 42%, var(--ink) 42% 58%, transparent 58%); background-size: 9px 9px; background-position: center; background-repeat: no-repeat; }
.window main { padding: 0 16px; }
.window main { padding-bottom: 20px; overflow-wrap: anywhere; }
a { color: var(--purple); text-underline-offset: 3px; }
a:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
h1 { font: 16px/1.5 var(--pixel); margin: 1rem 0 0.5rem; }
h2 { font: 12px/1.5 var(--pixel); margin: 1.4rem 0 0.4rem; }
h3 { font: 11px/1.5 var(--pixel); margin: 1.2rem 0 0.3rem; }
p { margin: 0.5rem 0; }
.quiet { color: var(--quiet); font-size: 24px; }
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
.history { color: var(--quiet); font-size: 24px; }
.why { list-style: none; padding: 0; }
.why li { padding: 6px 0; border-bottom: 2px dashed var(--purple); }
.why time { color: var(--quiet); margin-right: 6px; }
.belief { font-size: 22px; }
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
.menu a { display: block; padding: 10px 12px; min-height: 44px; color: var(--ink); text-decoration: none; font-size: 26px; line-height: 1.2; }
.menu a:hover, .menu a:focus-visible, .menu a[aria-current] { background: var(--purple); color: var(--white); outline: none; }
.tray { margin-left: auto; font-size: 22px; color: var(--quiet); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
/* Notes and their threads: a flat chat on Merge's desktop. One row for each message: the visitor's rows full width in white, Merge's rows a fixed step in, in pale cyan. */
.requests.notes { list-style: none; padding: 0; margin: 12px 0; }
.requests.notes li.note { border: 0; padding: 0; margin: 18px 0; }
.note-meta { margin: 0 0 4px; font-size: 22px; }
.msg { background: var(--white); border: 2px solid var(--ink); padding: 6px 12px; margin: 0 0 8px; }
.msg.merge { background: #c9fbff; margin-left: 30px; }
.msg .who { color: var(--purple); font: 12px/1.4 var(--pixel); }
.msg .who + p { display: inline; margin: 0; }
.msg p { margin: 0.4rem 0; }
.note-fate { margin: 0 0 8px 30px; }
.notes li.note p.quiet a { font-size: 22px; }
.notes li.note .note-answer-btn { margin-left: 30px; }
.msg.typing { display: flex; align-items: center; gap: 10px; border-style: dashed; border-color: var(--purple); }
.tface { flex: none; width: 34px; height: 24px; background: var(--ink) url('icons/asleep-face.svg') center / 80% no-repeat; border: 2px solid var(--ink); image-rendering: pixelated; }
.replies-left { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 22px; }
.pips { display: inline-flex; gap: 4px; }
.pips i { display: block; width: 18px; height: 18px; border: 2px solid var(--ink); background: var(--white); }
.pips i.on { background: var(--hot); }
.note-who { margin: 4px 0; font-size: 22px; }
.note-who a { color: var(--purple); }
/* The diary: a card for each entry, and the last two weeks at the side. */
.diary { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
.dlist { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.dcard { display: flex; gap: 12px; padding: 8px 10px; text-decoration: none; color: var(--ink); background: var(--white); border: 2px solid var(--ink); box-shadow: 0 3px 0 var(--hot); }
.dcard:hover, .dcard:focus-visible { outline: 2px dotted var(--ink); outline-offset: 2px; }
.dface { flex: none; width: 40px; height: 40px; background: var(--ink) url('favicon.svg') center / 80% no-repeat; border: 2px solid var(--ink); image-rendering: pixelated; }
.dtext { display: grid; gap: 2px; min-width: 0; }
.dday { color: var(--purple); font: 11px/1.4 var(--pixel); }
.dtitle { font-size: 26px; line-height: 1.1; }
.dpre { font-size: 22px; line-height: 1.15; color: var(--quiet); overflow-wrap: anywhere; }
.dside { display: grid; gap: 12px; align-content: start; }
.dside-box { background: var(--white); border: 2px solid var(--hot); padding: 8px 10px; }
.dside-box h2 { margin: 0 0 6px; font: 11px/1.4 var(--pixel); }
.dside-box p { margin: 0; }
.cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; text-align: center; }
.cal-day { display: block; padding: 4px 0; min-height: 28px; color: var(--quiet); background: var(--face); }
.cal-day.has { color: var(--ink); background: var(--white); border: 2px solid var(--ink); padding: 2px 0; text-decoration: none; }
.cal-day.today { color: var(--white); background: var(--hot); }
@media (min-width: 900px) { .diary { grid-template-columns: minmax(0, 1fr) 260px; align-items: start; } }
/* The gallery: tabs are radio buttons, so the filter works with no script. */
.gallery { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 4px; }
.gf { position: absolute; opacity: 0; width: 1px; height: 1px; }
.gtab { min-height: 44px; display: inline-flex; align-items: center; padding: 4px 12px; cursor: pointer; font: 10px/1 var(--pixel); background: var(--face); border: 2px solid var(--ink); border-bottom: 0; }
.gf:checked + .gtab { background: var(--white); }
.gf:focus-visible + .gtab { outline: 2px dotted var(--ink); outline-offset: 2px; }
.gtiles { flex: 1 0 100%; list-style: none; margin: 0; padding: 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; background: var(--white); border: 2px solid var(--ink); }
.gt a { display: flex; flex-direction: column; height: 100%; text-decoration: none; color: var(--ink); background: var(--white); border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--hot); }
.gt a:focus-visible { outline: 2px dotted var(--ink); outline-offset: 2px; }
.gname { margin: 0 8px 8px; font-size: 20px; line-height: 1.1; overflow-wrap: anywhere; }
.gt .tmeta { color: var(--purple); font-size: 18px; white-space: nowrap; }
@media (min-width: 700px) { .gtiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
#gf-sketch:checked ~ .gtiles .gt:not([data-k="sketch"]), #gf-work:checked ~ .gtiles .gt:not([data-k="work"]), #gf-build:checked ~ .gtiles .gt:not([data-k="build"]) { display: none; }
main img { max-width: 100%; height: auto; border: 2px solid var(--ink); image-rendering: auto; }
/* The front page (step 7): a desktop of its own. Phone first, one column of windows; from 1000 px the live window on the left and the rest on the right, as in the mockup. */
.bare { flex: 1; min-width: 0; max-width: 1180px; margin: 0 auto var(--taskbar); overflow-wrap: anywhere; }
.headline { font: 15px/1.6 var(--pixel); color: var(--white); text-shadow: 3px 3px 0 var(--deep); margin: 0 0 16px; }
.desk { display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr); align-items: start; }
.col-a, .col-b { display: grid; gap: 20px; min-width: 0; }
.w95 { background: var(--face); border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink), inset 2px 2px 0 var(--white); min-width: 0; }
.w95 > .title h2 { margin: 0; font: inherit; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.w95-body { padding: 12px; }
.w95-body > p:first-child { margin-top: 0; }
.still { position: relative; aspect-ratio: 1200 / 630; background: var(--deep) center / cover no-repeat; border: 2px solid var(--ink); border-color: var(--ink) var(--white) var(--white) var(--ink); }
.badge { position: absolute; left: 10px; top: 10px; padding: 4px 8px; font: 10px/1 var(--pixel); color: var(--white); background: var(--hot); border: 2px solid var(--white); }
.right-now { margin: 12px 0 4px; }
.right-now strong { color: var(--purple); }
.thought:empty { display: none; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0 0; }
.btn { display: flex; align-items: center; justify-content: center; flex: 1 1 100%; min-height: 48px; padding: 8px 14px; font: 10px/1.4 var(--pixel); color: var(--ink); text-decoration: none; text-align: center; background: var(--face); border: 2px solid; border-color: var(--white) var(--ink) var(--ink) var(--white); box-shadow: inset -2px -2px 0 var(--purple); }
.btn.go { background: var(--cyan); }
.btn:active { border-color: var(--ink) var(--white) var(--white) var(--ink); box-shadow: inset 2px 2px 0 var(--purple); }
.btn:focus-visible { outline: 2px dotted var(--ink); outline-offset: 2px; }
.cards { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 6px; }
.tcard { flex: 0 0 82%; display: flex; flex-direction: column; scroll-snap-align: start; text-decoration: none; color: var(--ink); background: var(--white); border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); }
.tcard:focus-visible { outline: 2px dotted var(--ink); outline-offset: 2px; }
.pic { display: block; aspect-ratio: 4 / 3; background: var(--deep) center / cover no-repeat; border-bottom: 2px solid var(--ink); }
.tmeta { display: block; padding: 6px 8px 0; color: var(--quiet); font-size: 20px; }
.tcap { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; margin: 0 8px 8px; font-size: 22px; line-height: 1.15; }
.swipe { margin: 4px 0 0; font-size: 22px; }
.thumbs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 8px; }
.thumb { position: relative; display: block; text-decoration: none; border: 2px solid var(--ink); }
.thumb .pic { aspect-ratio: 4 / 3; border: 0; }
.thumb .day { position: absolute; left: 0; bottom: 0; padding: 2px 4px; font: 8px/1.2 var(--pixel); color: var(--white); background: rgb(26 11 59 / 80%); }
.note-row { display: flex; gap: 8px; align-items: stretch; margin-top: 8px; }
.note-row input { flex: 1; min-width: 0; min-height: 48px; font: inherit; color: var(--ink); background: var(--white); border: 2px solid; border-color: var(--ink) var(--white) var(--white) var(--ink); border-radius: 0; padding: 4px 10px; }
.note-row .send { flex: none; min-width: 84px; }
.note-compact #note-extra { margin-top: 8px; }
.note-compact #note-extra input { width: 100%; max-width: 32rem; font: inherit; color: var(--ink); background: var(--white); border: 2px solid; border-color: var(--ink) var(--white) var(--white) var(--ink); border-radius: 0; padding: 6px 8px; }
.note-compact #note-status:empty { display: none; }
#notebox .msg { font-size: 22px; padding: 4px 10px; margin-bottom: 6px; }
#notebox .note-row { margin-top: 6px; }
#notebox .notes-disclosure { font-size: 22px; padding: 8px 12px; }
.foot { margin: 20px 0 0; text-align: center; }
.foot a { color: var(--white); text-shadow: 2px 2px 0 var(--deep); }
@media (min-width: 900px) {
  .headline { font-size: 22px; }
  .actions .btn { flex: 0 1 auto; }
  .cards { overflow: visible; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .tcard { flex: none; }
  .swipe { display: none; }
}
.shell:has(> .bare) { max-width: 1440px; }
@media (min-width: 900px) {
  .shell:has(> .bare) .icons { grid-template-rows: repeat(6, max-content); grid-auto-columns: 96px; }
}
@media (min-width: 1100px) {
  .desk { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); }
}
/* Asleep: the still is a dark screen with NO SIGNAL; the friendly window opens over the page. */
.still.asleep { background: #0b0224 center / cover no-repeat; display: grid; place-items: center; align-content: center; gap: 4px; text-align: center; color: var(--white); }
.still.asleep .badge { background: var(--deep); }
.zface { display: block; width: 64px; height: 64px; background: url('icons/asleep-face.svg') center / contain no-repeat; image-rendering: pixelated; }
.nosig { font: 14px/1.2 var(--pixel); }
.nosig-sub { font-size: 24px; }
.dialog { position: fixed; z-index: 40; left: 50%; top: 22%; transform: translateX(-50%); width: min(520px, 94vw); }
.dialog[hidden] { display: none; }
.dlg-text { display: flex; gap: 12px; align-items: flex-start; margin: 0 0 8px; }
.dlg-icon { flex: none; width: 40px; height: 40px; background: url('icons/error.svg') center / contain no-repeat; image-rendering: pixelated; }
.dialog .actions .btn, .dialog .actions button { flex: 1 1 auto; }
/* An opened card: a window over the page. Full screen above the taskbar on a phone; on a laptop the picture on the left and the words on the right. */
.cardopen { position: fixed; z-index: 50; left: 0; right: 0; top: 0; bottom: var(--taskbar); display: flex; flex-direction: column; overflow-y: auto; box-shadow: none; }
.cardopen[hidden] { display: none; }
.cardopen .btns .x { align-self: center; min-height: 0; box-shadow: none; font: 0/0 serif; position: relative; display: block; width: 18px; height: 16px; padding: 0; color: transparent; cursor: pointer; background-color: var(--face); border: 2px solid; border-color: var(--white) var(--ink) var(--ink) var(--white); background-image: linear-gradient(45deg, transparent 42%, var(--ink) 42% 58%, transparent 58%), linear-gradient(-45deg, transparent 42%, var(--ink) 42% 58%, transparent 58%); background-size: 9px 9px; background-position: center; background-repeat: no-repeat; }
.cardopen .btns .x::before { content: ""; position: absolute; inset: -14px; }
.co-body { display: grid; gap: 12px; flex: 1; grid-template-columns: minmax(0, 1fr); align-content: start; }
.co-pic { display: block; aspect-ratio: 4 / 3; background: var(--deep) center / cover no-repeat; border: 2px solid var(--ink); border-color: var(--ink) var(--white) var(--white) var(--ink); }
.co-meta { margin: 0; color: var(--purple); font-size: 24px; }
.co-cap { margin: 4px 0 12px; font: 26px/1.2 var(--read); overflow-wrap: anywhere; }
.co-btns { display: flex; flex-wrap: wrap; gap: 10px; }
.co-btns .btn { flex: 1 1 40%; min-width: 0; cursor: pointer; }
.co-btns [hidden] { display: none; }
@media (min-width: 900px) {
  .cardopen { left: 50%; right: auto; top: 90px; bottom: auto; transform: translateX(-50%); width: min(1100px, 92vw); max-height: calc(100vh - var(--taskbar) - 110px); box-shadow: 4px 4px 0 var(--ink); }
  .co-body { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); align-content: start; }
  .co-text { display: flex; flex-direction: column; }
  .co-btns { margin-top: auto; }
}
/* The boot screen: only for a visitor whose first visit of the day this is (front.js's inline script adds .booting). */
.boot { display: none; }
html.booting .boot { display: grid; place-items: center; position: fixed; inset: 0; z-index: 100; background: radial-gradient(circle at 50% 40%, #2b0b5e, #05021a 70%); color: var(--green); font: 24px/1.2 var(--read); }
html.booting body { overflow: hidden; }
.boot-in { width: min(640px, 90vw); }
.boot-logo { font: 40px/1.2 var(--pixel); color: var(--white); text-align: center; text-shadow: 3px 3px 0 var(--hot), -2px -2px 0 var(--cyan); }
.boot-sub { text-align: center; color: var(--pink); margin: 6px 0 28px; }
.boot-lines p { margin: 2px 0; }
.boot-bar { height: 30px; margin: 16px 0 12px; border: 2px solid var(--green); padding: 3px; }
.boot-bar i { display: block; height: 100%; width: 0; background: repeating-linear-gradient(90deg, var(--green) 0 14px, transparent 14px 18px); animation: boot-fill 1.4s steps(24) forwards; }
@keyframes boot-fill { to { width: 100%; } }
.boot-key { margin: 0; color: var(--green); }
/* Night: while Merge sleeps the wallpaper is the starry night sky, with the same grid floor. */
body.night {
  background:
    radial-gradient(1.5px 1.5px at 8% 12%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 21% 30%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 37% 8%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 52% 24%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 64% 10%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 78% 33%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 91% 17%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 14% 44%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 45% 41%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 86% 46%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 3% 6%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 11% 22%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 17% 4%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 29% 36%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 33% 14%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 43% 28%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 47% 5%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 55% 40%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 59% 19%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 68% 9%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 72% 31%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 81% 16%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 88% 42%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 94% 8%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 97% 27%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 6% 38%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 25% 11%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 51% 20%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 76% 3%, #fff 98%, transparent) fixed,
    radial-gradient(1.5px 1.5px at 90% 35%, #fff 98%, transparent) fixed,
    repeating-linear-gradient(to right, rgb(255 64 209 / 40%) 0 2px, transparent 2px 64px) 0 100% / 100% 34% no-repeat fixed,
    repeating-linear-gradient(to bottom, rgb(255 64 209 / 40%) 0 2px, transparent 2px 28px) 0 100% / 100% 34% no-repeat fixed,
    linear-gradient(to bottom, #1a0640, #0b0224) 0 100% / 100% 34% no-repeat fixed,
    linear-gradient(to bottom, #05021a 0%, #2b0b5e 45%, #8c1eff 66%) fixed;
}
/* A slow drift of the grid, only for visitors who have not asked for less motion. */
@keyframes drift {
  to { background-position: 64px 100%, 0 calc(100% + 28px), 0 100%, 0 0; }
}
@media (prefers-reduced-motion: no-preference) {
  body:not(.night) { animation: drift 8s linear infinite; }
}
`
