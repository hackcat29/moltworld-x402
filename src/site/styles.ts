export const SITE_CSS = String.raw`
:root {
  --bg: #07090e; --bg-2: #0c1019; --card: #0f131f; --card-2: #151a2b; --border: #1e2538; --border-2: #2a3350;
  --text: #f3f5f8; --muted: #9aa4b8; --dim: #6b7589;
  --accent: #00e5a3; --accent-ink: #04130d; --accent-soft: rgba(0, 229, 163, 0.1);
  --cyan: #38bdf8; --purple: #b78cf7; --amber: #f5b84a; --pink: #f472b6; --danger: #f87171;
  --shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --radius: 14px; --gutter: 16px; --max: 1180px; --header: 64px;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --bg: #f7f8fb; --bg-2: #eef1f6; --card: #ffffff; --card-2: #f3f5fa; --border: #e1e5ee; --border-2: #cbd2e0;
    --text: #0d1220; --muted: #4a5468; --dim: #6b7589;
    --accent: #00875f; --accent-ink: #ffffff; --accent-soft: rgba(0, 135, 95, 0.08);
    --cyan: #0369a1; --purple: #7c3aed; --amber: #a16207; --pink: #be185d; --danger: #b91c1c;
    --shadow: 0 12px 40px rgba(15, 23, 42, 0.12);
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font); line-height: 1.55; font-size: 16px; overflow-x: hidden; }
a { color: var(--accent); }
code, pre, .mono { font-family: var(--mono); }
.wrap { max-width: var(--max); margin: 0 auto; padding: 0 var(--gutter); }
.skip { position: absolute; left: -9999px; } .skip:focus { left: 16px; top: 8px; z-index: 100; background: var(--card); padding: 8px 12px; border-radius: 8px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.hidden { display: none !important; }

/* Header */
header.site { position: sticky; top: 0; z-index: 50; background: color-mix(in srgb, var(--bg) 90%, transparent); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
.bar { display: flex; align-items: center; gap: 20px; height: var(--header); }
.brand { display: flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; font-weight: 700; font-size: 18px; flex: none; }
.brand img { width: 30px; height: 30px; border-radius: 8px; }
nav.primary { flex: 1; }
nav.primary > ul { display: flex; gap: 2px; list-style: none; margin: 0; padding: 0; }
.nav-item { position: relative; }
.nav-trigger { display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; color: var(--muted); font: 500 15px var(--font); padding: 8px 12px; border-radius: 8px; cursor: pointer; min-height: 40px; }
.nav-trigger:hover, .nav-trigger[aria-expanded="true"], .nav-item.active .nav-trigger { color: var(--text); }
.nav-trigger:hover { background: var(--card); }
.nav-trigger svg { width: 12px; height: 12px; transition: transform .15s; }
.nav-trigger[aria-expanded="true"] svg { transform: rotate(180deg); }
.nav-menu { position: absolute; top: calc(100% + 8px); left: -8px; width: 380px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); padding: 8px; }
.nav-menu[hidden] { display: none; }
.nav-menu ul { list-style: none; margin: 0; padding: 0; }
.nav-link { display: block; padding: 10px 12px; border-radius: 10px; text-decoration: none; color: var(--text); }
.nav-link:hover, .nav-link:focus-visible { background: var(--card-2); }
.nav-link .t { display: block; font-weight: 600; font-size: 14px; }
.nav-link .d { display: block; font-size: 13px; color: var(--muted); margin-top: 2px; }
.nav-overview { display: block; font-size: 13px; padding: 10px 12px 6px; border-top: 1px solid var(--border); margin-top: 6px; text-decoration: none; }
.header-actions { display: flex; align-items: center; gap: 12px; flex: none; }
.net { font-size: 13px; color: var(--muted); white-space: nowrap; } .net.down { color: var(--danger); }
.menu-btn { display: none; background: none; border: 1px solid var(--border-2); color: var(--text); border-radius: 10px; min-height: 40px; padding: 8px 12px; font: 500 14px var(--font); cursor: pointer; }
@media (max-width: 960px) {
  .menu-btn { display: inline-flex; }
  /* backdrop-filter would make the header the containing block of the fixed menu panel */
  header.site { backdrop-filter: none; background: var(--bg); }
  .header-actions .net, .header-actions .btn-header { display: none; }
  .bar { justify-content: space-between; }
  nav.primary { position: fixed; inset: var(--header) 0 0 0; background: var(--bg); border-top: 1px solid var(--border); overflow-y: auto; display: none; padding: 8px var(--gutter) 32px; }
  nav.primary.open { display: block; }
  nav.primary > ul { flex-direction: column; gap: 0; }
  .nav-item { border-bottom: 1px solid var(--border); }
  .nav-trigger { width: 100%; justify-content: space-between; font-size: 17px; padding: 14px 4px; min-height: 52px; color: var(--text); }
  .nav-trigger:hover { background: none; }
  .nav-menu { position: static; width: auto; box-shadow: none; border: 0; padding: 0 0 10px; background: none; }
  .nav-mobile-cta { display: grid !important; gap: 10px; margin-top: 20px; }
}
.nav-mobile-cta { display: none; }

/* Buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 10px 18px; border-radius: 10px; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); font: 600 15px var(--font); text-decoration: none; cursor: pointer; white-space: nowrap; }
.btn:hover { filter: brightness(1.07); }
.btn-ghost { background: transparent; color: var(--text); border-color: var(--border-2); }
.btn-small { min-height: 36px; padding: 6px 12px; font-size: 13px; }
.btn-header { min-height: 38px; padding: 8px 14px; font-size: 14px; }
.btn[disabled] { opacity: .6; cursor: progress; }

/* Type */
h1 { font-size: clamp(34px, 5.6vw, 58px); line-height: 1.06; letter-spacing: -0.025em; margin: 0 0 16px; }
h2 { font-size: clamp(26px, 3.4vw, 36px); line-height: 1.15; letter-spacing: -0.015em; margin: 0 0 10px; }
h3 { font-size: 18px; margin: 0 0 6px; }
.lede { color: var(--muted); font-size: clamp(17px, 2vw, 20px); max-width: 60ch; margin: 0 0 28px; }
.kicker { font: 600 13px var(--font); color: var(--accent); letter-spacing: .02em; margin: 0 0 12px; }
.muted { color: var(--muted); }
.note { font-size: 13px; color: var(--muted); }
.err { color: var(--danger); font-size: 14px; }

/* Layout */
section.block { padding: 72px 0; border-top: 1px solid var(--border); }
section.block.tight { padding: 48px 0; }
.head { margin-bottom: 32px; max-width: 70ch; }
.head p { color: var(--muted); margin: 0; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; min-width: 0; }
a.card { display: block; text-decoration: none; color: var(--text); transition: border-color .15s, transform .15s; }
a.card:hover { border-color: var(--border-2); transform: translateY(-1px); }
a.card .more-link { display: inline-block; margin-top: 12px; color: var(--accent); font-size: 14px; font-weight: 600; }
.card p { color: var(--muted); margin: 0; font-size: 15px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.grid-2 > *, .grid-3 > *, .grid-4 > * { min-width: 0; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
@media (max-width: 960px) { .grid-3, .grid-4 { grid-template-columns: repeat(2, 1fr); } .grid-2 { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .grid-3, .grid-4 { grid-template-columns: 1fr; } }

/* Hero */
.hero { padding-top: 88px; padding-bottom: 72px; }
.hero-split { display: grid; grid-template-columns: 1.05fr 1fr; gap: 48px; align-items: center; }
.hero .cta, .cta-row { display: flex; gap: 12px; flex-wrap: wrap; }
.hero-meta { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 28px; font-size: 14px; color: var(--muted); }
.hero-meta strong { color: var(--text); font-weight: 600; }
.page-hero { padding-top: 72px; padding-bottom: 56px; }
.page-hero .lede { margin-bottom: 24px; }
@media (max-width: 960px) { .hero-split { grid-template-columns: 1fr; gap: 32px; } .hero { padding-top: 56px; padding-bottom: 48px; } .page-hero { padding-top: 48px; padding-bottom: 40px; } }

/* Code */
.code-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; min-width: 0; }
.code-card [role="tablist"] { display: flex; flex-wrap: wrap; gap: 2px; padding: 8px; border-bottom: 1px solid var(--border); }
.code-card [role="tab"] { background: none; color: var(--muted); border: 0; border-radius: 8px; padding: 8px 12px; font: 500 14px var(--font); cursor: pointer; min-height: 38px; white-space: nowrap; }
.code-card [role="tab"][aria-selected="true"] { color: var(--text); background: var(--card-2); }
.code-card pre { margin: 0; border: 0; border-radius: 0; background: none; }
pre.code, .code-card pre { padding: 16px; overflow-x: auto; font-size: 13px; line-height: 1.6; max-width: 100%; }
pre.code { background: var(--bg-2); border: 1px solid var(--border); border-radius: 10px; margin: 12px 0 0; }

/* Lists and tables */
ol.steps { counter-reset: step; list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
ol.steps li { counter-increment: step; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; color: var(--muted); font-size: 15px; }
ol.steps li::before { content: counter(step); display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font: 700 14px var(--font); margin-bottom: 12px; }
ol.steps li strong { display: block; color: var(--text); margin-bottom: 4px; }
@media (max-width: 960px) { ol.steps { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { ol.steps { grid-template-columns: 1fr; } }
ul.checks { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
ul.checks li { padding-left: 28px; position: relative; color: var(--muted); }
ul.checks li::before { content: ""; position: absolute; left: 4px; top: 7px; width: 12px; height: 7px; border-left: 2px solid var(--accent); border-bottom: 2px solid var(--accent); transform: rotate(-45deg); }
ul.checks li strong { color: var(--text); }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
tr:last-child td { border-bottom: 0; }
th { color: var(--dim); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; background: var(--bg-2); white-space: nowrap; }
td code { font-size: 13px; }
td.mono a { color: var(--accent); }
@media (max-width: 640px) {
  table.stack thead { display: none; }
  table.stack tr { display: block; padding: 10px 14px; border-bottom: 1px solid var(--border); }
  table.stack td { display: flex; justify-content: space-between; gap: 12px; border: 0; padding: 3px 0; overflow-wrap: anywhere; }
  table.stack td::before { content: attr(data-label); color: var(--dim); font-size: 12px; flex: none; }
}
.prose { max-width: 72ch; }
.prose p, .prose li { color: var(--muted); }
.prose h2 { margin-top: 40px; }
.providers { display: flex; flex-wrap: wrap; gap: 10px 28px; color: var(--dim); font-weight: 600; font-size: 15px; }
.tag { display: inline-block; font-size: 12px; padding: 3px 9px; border-radius: 999px; background: var(--card-2); border: 1px solid var(--border); color: var(--muted); }
.cta-band { text-align: center; padding: 80px 0; border-top: 1px solid var(--border); }
.cta-band .lede { margin: 0 auto 28px; }
.cta-band .cta-row { justify-content: center; }

/* Forms */
label { display: block; font-size: 13px; color: var(--muted); margin: 14px 0 6px; }
input, select, textarea { width: 100%; background: var(--bg-2); color: var(--text); border: 1px solid var(--border-2); border-radius: 10px; padding: 10px 12px; font: 15px var(--font); min-height: 44px; }
textarea { min-height: 96px; resize: vertical; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 520px) { .row { grid-template-columns: 1fr; } }
.actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
.result { margin-top: 16px; }
.big-price { font: 700 34px var(--mono); color: var(--accent); }
dl.kv { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 12px 0 0; font-size: 14px; }
dl.kv dt { color: var(--dim); } dl.kv dd { margin: 0; overflow-wrap: anywhere; font-family: var(--mono); font-size: 13px; }
@media (max-width: 520px) { dl.kv { grid-template-columns: 1fr; gap: 2px; } dl.kv dd { margin-bottom: 8px; } }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; border: 1px solid var(--border-2); }
.badge.good { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 50%, transparent); }
.badge.bad { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 50%, transparent); }
.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.stat-row .card .v { font: 600 26px var(--mono); color: var(--text); }
.stat-row .card .k { font-size: 13px; color: var(--muted); }
@media (max-width: 760px) { .stat-row { grid-template-columns: repeat(2, 1fr); } }

/* Catalog */
.filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 16px; }
.tab { background: var(--card); color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 8px 14px; font: 500 14px var(--font); cursor: pointer; min-height: 40px; }
.tab[aria-pressed="true"] { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
.filters input { flex: 1 1 220px; min-width: 0; width: auto; }
ul.models { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
@media (max-width: 1000px) { ul.models { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { ul.models { grid-template-columns: 1fr; } }
.model { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.model-top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
.model h3 { margin: 0; font-size: 16px; }
.price { font: 600 14px var(--mono); color: var(--accent); white-space: nowrap; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.chip { font-size: 12px; padding: 2px 8px; border-radius: 6px; background: var(--card-2); color: var(--muted); border: 1px solid var(--border); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip-chat { color: var(--cyan); } .chip-image { color: var(--pink); } .chip-voice { color: var(--amber); } .chip-video { color: var(--purple); }
.flow { margin: 0; font-size: 13px; color: var(--muted); }
.endpoint { font-size: 12px; color: var(--dim); background: var(--bg-2); border-radius: 8px; padding: 6px 8px; overflow-wrap: anywhere; }
.model-actions { display: flex; gap: 8px; margin-top: auto; flex-wrap: wrap; }
.more { display: flex; justify-content: center; margin-top: 18px; }

/* Footer */
footer.site { border-top: 1px solid var(--border); padding: 56px 0 40px; color: var(--muted); font-size: 14px; }
.foot-grid { display: grid; grid-template-columns: 1.4fr repeat(4, 1fr); gap: 32px; }
.foot-grid h4 { color: var(--text); font-size: 14px; margin: 0 0 12px; }
.foot-grid ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.foot-grid a { color: var(--muted); text-decoration: none; } .foot-grid a:hover { color: var(--text); }
.foot-legal { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); font-size: 13px; overflow-wrap: anywhere; }
@media (max-width: 860px) { .foot-grid { grid-template-columns: 1fr 1fr; } .foot-brand { grid-column: 1 / -1; } }
.toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--card-2); border: 1px solid var(--border-2); padding: 10px 16px; border-radius: 10px; font-size: 14px; opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 60; }
.toast.show { opacity: 1; }
`;
