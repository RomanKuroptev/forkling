/** One small stylesheet, light and dark, readable on a phone. */
export const STYLE = `:root {
  --bg: #fbf8f3;
  --text: #2a2622;
  --quiet: #7a7068;
  --accent: #b5532a;
  --card: #ffffff;
  --line: #e6dfd5;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #1c1917;
    --text: #ece6de;
    --quiet: #a39a90;
    --accent: #e08a5f;
    --card: #26221f;
    --line: #3a342f;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 17px/1.55 Georgia, 'Times New Roman', serif;
}
header, main { max-width: 42rem; margin: 0 auto; padding: 0 16px; }
header { padding-top: 20px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
.name { font-size: 1.4rem; font-weight: bold; color: var(--text); text-decoration: none; }
nav { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 6px; font-family: system-ui, sans-serif; font-size: 0.9rem; }
nav a { color: var(--quiet); text-decoration: none; }
nav a[aria-current] { color: var(--accent); font-weight: 600; }
a { color: var(--accent); }
h1 { font-size: 1.8rem; margin: 1.2rem 0 0.4rem; }
h2 { font-size: 1.2rem; margin: 1.6rem 0 0.4rem; }
h3 { margin: 0 0 0.2rem; }
.quiet { color: var(--quiet); font-size: 0.9rem; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 16px; margin: 12px 0; }
.card h1, .card h2 { font-size: 1.2rem; margin-top: 0; }
.drawing svg { width: 100%; max-width: 24rem; height: auto; background: #fff; border-radius: 4px; }
.play { font: inherit; cursor: pointer; padding: 4px 12px; border-radius: 6px; border: 1px solid var(--accent); background: none; color: var(--accent); }
.script { white-space: pre-wrap; }
.history { color: var(--quiet); font-size: 0.9rem; }
.why { list-style: none; padding: 0; }
.why li { padding: 6px 0; border-bottom: 1px solid var(--line); }
.why time { font-family: system-ui, sans-serif; color: var(--quiet); margin-right: 6px; }
.belief { font-family: system-ui, sans-serif; font-size: 0.8rem; }
li.now { font-weight: bold; }
table { border-collapse: collapse; }
td { padding: 2px 12px 2px 0; }
dt { font-weight: bold; margin-top: 8px; }
dd { margin: 0; }
.pager { display: flex; justify-content: space-between; font-family: system-ui, sans-serif; }
`
