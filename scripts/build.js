#!/usr/bin/env node
"use strict";
/* Generate the site from data/*.json:
     index.html, jb-sandy-showprep.html (copy for old links), archive/index.html,
     archive/<week-monday>.html, archive/undated.html, archive/audio.html,
     stories/index.html, last-laugh/index.html, hotkeys/library.json
   Rules: anything older than 7 days, or flagged stale (past event/occasion), goes to the archive.
   Usage: node scripts/build.js [--today YYYY-MM-DD]   (default: today in America/Chicago) */
const fs = require("fs");
const path = require("path");
const D = require("./lib/docs");

const ROOT = path.join(__dirname, "..");
const argToday = process.argv.indexOf("--today");
const TODAY = argToday > 0 ? process.argv[argToday + 1] : D.todayCT();
const CUTOFF = D.addDays(TODAY, -7); // older than this -> archive
const NEW_SINCE = D.addDays(TODAY, -3); // ideas this recent get the "New" treatment
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const write = (f, s) => { const p = path.join(ROOT, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

const stories = read("data/stories.json").items;
const ideas = read("data/ideas.json").items;
const audio = read("data/audio.json").clips;
const seen = read("data/seen-blocks.json");
const legacy = fs.existsSync(path.join(ROOT, "data/legacy.json")) ? read("data/legacy.json").items : [];

/* ---------- helpers ---------- */
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dt = (iso) => new Date(iso + "T12:00:00Z");
const fmt = (iso, dow) => { if (!iso) return ""; const d = dt(iso); return (dow ? DOW[d.getUTCDay()] + ", " : "") + MON[d.getUTCMonth()] + " " + d.getUTCDate(); };
const mondayOf = (iso) => { const d = dt(iso); const off = (d.getUTCDay() + 6) % 7; return D.addDays(iso, -off); };
const dur = (s) => { if (s == null) return ""; s = Math.round(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const url = (p) => "/" + p.split("/").map(encodeURIComponent).join("/");
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "link"; } };
const linkLabel = (l) => {
  const h = host(l.url);
  const lab = (l.label || "").replace(/\s+/g, " ").trim();
  return lab && lab.length > 2 && lab.length <= 30 ? lab : h;
};
const nowCT = () => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date());
const STAMP = process.env.SHOWPREP_STAMP || `Updated ${fmt(TODAY, true)} · ${nowCT()} CT`;
const ICON_PLAY = '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const ICON_STOP = '<svg class="i-stop" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/></svg>';

function page({ title, body, nav = "", extraHead = "", scripts = "" }) {
  const n = (id, label, href) => `<a href="${href}"${nav === id ? ' class="on" aria-current="page"' : ""}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/assets/site.css">
${extraHead}</head>
<body>
<header class="top"><div class="wrap">
<a class="brand" href="/">JB &amp; Sandy <span>· Show prep</span></a>
<nav class="main" aria-label="Main">${n("today", "Today", "/#today")}${n("ideas", "Ideas", "/#ideas")}${n("audio", "Audio", "/#audio")}${n("archive", "Archive", "/archive/")}</nav>
</div></header>
<main class="wrap">
${body}
</main>
<footer class="site"><div class="wrap">
<a href="/m2w/this-week.html">Minute To Win It</a><a href="/stories/">Story pages</a><a href="/last-laugh/">Last Laugh</a><a href="/archive/audio.html">Audio archive</a>
<p>98.1 KVET · Built from the stories and Show Ideas docs.</p>
</div></footer>
<script src="/assets/site.js"></script>
${scripts}</body>
</html>
`;
}

/* ---------- classify ---------- */
const clipsIdeas = audio.filter((c) => c.origin === "ideas-doc");
const archived = []; // {date, kind, title, html, why}
const storyCurrent = [];
const isPerishable = (s) => s.type === "birthday" || s.type === "sports";
for (const s of stories) {
  let why = null;
  if (s.stale) why = "Stale: " + s.stale;
  else if (isPerishable(s) && s.first_seen < D.addDays(TODAY, -1)) why = "Day-specific (first seen " + fmt(s.first_seen) + ")";
  else if (s.first_seen < CUTOFF) why = "Older than 7 days (first seen " + fmt(s.first_seen) + ")";
  if (why) archived.push({ date: s.first_seen, kind: "Stories", title: s.headline, html: storyBody(s), why });
  else storyCurrent.push(s);
}
const ideaCurrent = [];
for (const i of ideas) {
  let why = null;
  if (i.stale) why = "Stale: " + i.stale;
  else if (i.added < CUTOFF) why = "Older than 7 days (added " + (i.date_estimated ? "on or before " : "") + fmt(i.added) + ")";
  if (why) archived.push({ date: i.added, kind: "Show ideas", title: i.title, html: ideaBody(i, true), why });
  else ideaCurrent.push(i);
}
const clipCurrent = [];
for (const c of clipsIdeas) {
  let why = null;
  if (c.stale) why = "Stale: " + c.stale;
  else if (c.added < CUTOFF) why = "Older than 7 days";
  if (why) archived.push({ date: c.added, kind: "Audio", title: c.title, html: clipHtml(c, false), why, audio: true });
  else clipCurrent.push(c);
}

/* legacy cards from the old single page: all archived; dupes of doc ideas skipped */
const words = (s) => new Set(D.normalize(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 3));
const similar = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((w) => B.has(w) && n++); return n / Math.min(A.size, B.size); };
const LEGACY_WHY = {
  emergency: "Emergency list from Sep 4 (retired)", today: "Oct 4 day-of notes", grok: "Oct 4 day-of picks", farmed: "Oct 4 farmed cards",
  sept11: "Sept 11 has passed", jobs: "Old job log", audio: "Old link list",
};
const lastLaugh = [];
let legacySkipped = 0;
const undated = [];
for (const l of legacy) {
  if (l.panel === "lastlaugh") { lastLaugh.push(l); continue; }
  if (l.panel === "new" && ideas.some((i) => similar(i.title, l.title) >= 0.6)) { legacySkipped++; continue; }
  if (l.title === "Running List") { legacySkipped++; continue; }
  const why = LEGACY_WHY[l.panel] || ("From the old page: " + l.category + (l.date_note ? " · " + l.date_note : ""));
  const rec = { date: l.date, kind: "From the old page", cat: l.category, title: l.title, html: l.html, why };
  if (l.date) archived.push(rec); else undated.push(rec);
}

/* ---------- renderers ---------- */
function storyBody(s) {
  let h = "";
  if (s.summary) h += `<p>${esc(s.summary)}</p>`;
  if (s.hook) h += `<p class="hook"><b>Hook</b>${esc(s.hook)}</p>`;
  if (s.social) h += `<p class="social"><span class="lbl">Social</span>${esc(s.social)}</p>`;
  if (s.page) h += `<p class="meta"><a href="/${esc(s.page)}">Story page</a></p>`;
  return h;
}
function ideaLinks(i) {
  return (i.links || []).filter((l) => !(i.social || []).includes(l.url)).slice(0, 3)
    .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(linkLabel(l))}</a>`);
}
function ideaBody(i, full) {
  const clip = clipsIdeas.find((c) => c.idea_id === i.id);
  let h = `<p>${esc(i.body || i.doc_text)}</p>`;
  if (full && i.body && i.doc_text && D.normalize(i.body) !== D.normalize(i.doc_text)) h += `<p class="social"><span class="lbl">Doc</span>${esc(i.doc_text)}</p>`;
  const meta = [];
  meta.push("Added " + (i.date_estimated ? "≈ " : "") + fmt(i.added));
  meta.push(...ideaLinks(i));
  if (clip) meta.push(clip.status === "ok" ? `<a href="/#clip-${esc(clip.id)}">▶ clip ${dur(clip.duration)}</a>` : `<a href="${esc(clip.source)}" target="_blank" rel="noopener">original video</a>`);
  h += `<p class="meta">${meta.join(" · ")}</p>`;
  return h;
}
function clipHtml(c, big = true) {
  const src = c.source ? `<a class="src" href="${esc(c.source)}" target="_blank" rel="noopener">${esc(c.source_label || host(c.source))} ↗</a>` : "";
  if (c.status !== "ok" || !c.file) {
    return `<div class="clip failed" id="clip-${esc(c.id)}">
<a class="open-orig" href="${esc(c.source)}" target="_blank" rel="noopener">Open original</a>
<div><div class="clip-title">${esc(c.title)}</div><p class="clip-desc">${esc(c.desc || "")}</p>${src}</div>
</div>`;
  }
  return `<div class="clip" id="clip-${esc(c.id)}">
<button class="play" type="button" data-title="${esc(c.title)}" aria-label="Play ${esc(c.title)}">${ICON_PLAY}${ICON_STOP}</button>
<div><div class="clip-title">${esc(c.title)}<span class="dur">${dur(c.duration)}</span></div>${c.desc ? `<p class="clip-desc">${esc(c.desc)}</p>` : ""}${src}</div>
<audio preload="none" src="${url(c.file)}"></audio>
</div>`;
}

/* ---------- front page ---------- */
const st = seen.stories || {};
const groups = [["standout", "Local standouts"], ["quick", "Quick hitters"], ["weird", "Weird news"], ["birthday", "Birthdays"], ["sports", "Sports"], ["poll", "Listener polls"]];
let todayHtml = `<section id="today">
<p class="stamp">${esc(STAMP)}</p>
<h1>Today’s stories</h1>`;
if (st.unchanged_since_last_check) {
  todayHtml += `<p class="note">No new stories today. The stories doc hasn’t changed since ${esc(fmt(st.last_changed, true))}.</p>`;
} else if (st.new_today) {
  todayHtml += `<p class="note">${st.new_today} new ${st.new_today === 1 ? "story" : "stories"} from the doc today.</p>`;
}
if (!storyCurrent.length) todayHtml += `<p class="meta">Nothing current in the stories doc. Older stories are in the <a href="/archive/">archive</a>.</p>`;
for (const [type, label] of groups) {
  const list = storyCurrent.filter((s) => s.type === type);
  if (!list.length) continue;
  todayHtml += `<h4>${label}</h4>`;
  if (type === "poll" || type === "birthday") {
    todayHtml += `<ul class="polls">${list.map((s) => `<li>${esc(s.headline)}${s.first_seen === TODAY ? '<span class="badge">New</span>' : ""}</li>`).join("")}</ul>`;
  } else {
    todayHtml += list.map((s) => `<article><h3>${esc(s.headline)}${s.first_seen === TODAY ? '<span class="badge">New</span>' : ""}</h3>${storyBody(s)}</article>`).join("\n");
  }
}
todayHtml += `</section>`;

const ideasNew = ideaCurrent.filter((i) => i.added >= NEW_SINCE);
const ideasWeek = ideaCurrent.filter((i) => i.added < NEW_SINCE);
let ideasHtml = `<section id="ideas">
<h2>New show ideas</h2>
<p class="sub">Newest from the top of the Show Ideas doc.</p>`;
ideasHtml += ideasNew.length ? ideasNew.map((i) => `<article><h3>${esc(i.title)}<span class="badge">New</span></h3>${ideaBody(i)}</article>`).join("\n")
  : `<p class="note">No new ideas in the doc since ${esc(fmt(seen.ideas && seen.ideas.last_new || NEW_SINCE, true))}.</p>`;
if (ideasWeek.length) {
  ideasHtml += `<h4>Earlier this week</h4><ul class="compact">` + ideasWeek.map((i) => {
    const extra = ideaLinks(i);
    const clip = clipsIdeas.find((c) => c.idea_id === i.id && c.status === "ok");
    if (clip) extra.push(`<a href="#clip-${esc(clip.id)}">▶ clip</a>`);
    return `<li><span class="t">${esc(i.title)}</span> <span class="meta">${fmt(i.added)}</span><br><span class="d">${esc(i.body || i.doc_text)}</span>${extra.length ? ` <span class="meta">${extra.join(" · ")}</span>` : ""}</li>`;
  }).join("") + `</ul>`;
}
ideasHtml += `</section>`;

let audioHtml = `<section id="audio">
<h2>Audio board</h2>
<p class="sub">Tap to play, tap again to stop. Nothing autoplays.</p>`;
if (clipCurrent.length) {
  audioHtml += `<h4>From the Show Ideas doc</h4>` + clipCurrent.sort((a, b) => (a.status === "ok" ? 0 : 1) - (b.status === "ok" ? 0 : 1)).map((c) => clipHtml(c)).join("\n");
}
audioHtml += `<h4>Hotkeys</h4>
<div id="hotkeys-app"><p class="meta">Loading hotkeys…</p></div>
<p class="meta">Tap a pad to play, tap again to fade, and tap a third time to cut. Older clips (Dolly, Sept 11, Longhorns, Bat Fest) are in the <a href="/archive/audio.html">audio archive</a>.</p>
</section>`;

const indexHtml = page({
  title: "JB & Sandy · Show prep",
  nav: "today",
  body: todayHtml + "\n" + ideasHtml + "\n" + audioHtml,
  scripts: `<script src="hotkeys.js"></script>\n`,
});
write("index.html", indexHtml);
write("jb-sandy-showprep.html", indexHtml.replace("<head>", '<head>\n<link rel="canonical" href="/">'));

/* ---------- archive ---------- */
const byWeek = {};
for (const a of archived) (byWeek[mondayOf(a.date)] = byWeek[mondayOf(a.date)] || []).push(a);
const weeks = Object.keys(byWeek).sort().reverse();
const KIND_ORDER = ["Stories", "Show ideas", "Audio", "From the old page"];
function archiveList(items) {
  let h = "";
  for (const kind of KIND_ORDER) {
    const list = items.filter((a) => a.kind === kind).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (!list.length) continue;
    h += `<h2>${kind}</h2>`;
    if (kind === "From the old page") {
      const cats = [...new Set(list.map((a) => a.cat))];
      for (const c of cats) {
        h += `<h4>${esc(c)}</h4>`;
        h += list.filter((a) => a.cat === c).map(archArticle).join("\n");
      }
    } else h += list.map(archArticle).join("\n");
  }
  return h;
}
function archArticle(a) {
  if (a.audio) return a.html + `<p class="why">${esc(a.why)}</p>`;
  return `<article><h3>${esc(a.title)}</h3>${a.date ? `<p class="meta">${fmt(a.date, true)}</p>` : ""}${a.html}<p class="why">${esc(a.why)}</p></article>`;
}
for (const w of weeks) {
  const items = byWeek[w];
  write(`archive/${w}.html`, page({
    title: `Archive · week of ${fmt(w)}`, nav: "archive",
    body: `<p class="stamp"><a href="/archive/">← Archive</a></p><h1>Week of ${fmt(w, true)}</h1><p class="meta">${items.length} archived items</p>` + archiveList(items),
  }));
}
write("archive/undated.html", page({
  title: "Archive · undated", nav: "archive",
  body: `<p class="stamp"><a href="/archive/">← Archive</a></p><h1>Undated</h1><p class="meta">Cards from the old one-page site that never had a date. ${undated.length} items.</p>` + archiveList(undated),
}));

/* audio archive: every library clip not on the hotkeys board + archived doc clips */
const libClips = audio.filter((c) => c.origin === "library");
const cats = [...new Set(libClips.map((c) => c.category))];
let audioArch = `<p class="stamp"><a href="/archive/">← Archive</a></p><h1>Audio archive</h1><p class="meta">Every clip on the site, one file each under <code>audio/</code>. Tap to play.</p>`;
const archDocClips = clipsIdeas.filter((c) => !clipCurrent.includes(c));
if (archDocClips.length) audioArch += `<h4>From the Show Ideas doc</h4>` + archDocClips.map((c) => clipHtml(c) + (c.stale ? `<p class="why">Stale: ${esc(c.stale)}</p>` : "")).join("\n");
for (const c of cats) {
  audioArch += `<h4>${esc(c)}</h4>` + libClips.filter((x) => x.category === c).map((x) => clipHtml(x) + (x.stale ? `<p class="why">${esc(x.stale)}</p>` : "")).join("\n");
}
write("archive/audio.html", page({ title: "Audio archive", nav: "archive", body: audioArch }));

let arch = `<h1>Archive</h1><p class="meta">Anything older than 7 days, plus items tied to a date or occasion that has passed. Nothing has been deleted.</p>
<h2>By week</h2><ul class="weeks">` +
  weeks.map((w) => `<li><a href="/archive/${w}.html">Week of ${fmt(w, true)}</a><span class="n">${byWeek[w].length} items</span></li>`).join("") +
  `<li><a href="/archive/undated.html">Undated (old page)</a><span class="n">${undated.length} items</span></li></ul>
<h2>More</h2><ul class="weeks">
<li><a href="/archive/audio.html">Audio archive</a><span class="n">${libClips.length + archDocClips.length} clips</span></li>
<li><a href="/archive/old-site-2026-10-04.html">The old one-page site (Oct 4 snapshot)</a><span class="n">as it was</span></li>
<li><a href="/m2w/">Minute To Win It, all weeks</a><span class="n"></span></li>
<li><a href="/stories/">Story pages</a><span class="n"></span></li>
</ul>`;
write("archive/index.html", page({ title: "Archive · JB & Sandy", nav: "archive", body: arch }));

/* stories index */
const storyPages = fs.readdirSync(path.join(ROOT, "stories")).filter((f) => f.endsWith(".html") && f !== "index.html").sort();
const titleOf = (f) => { const m = fs.readFileSync(path.join(ROOT, "stories", f), "utf8").match(/<h1>([\s\S]*?)<\/h1>/); return m ? m[1].replace(/<[^>]+>/g, "") : f; };
write("stories/index.html", page({
  title: "Story pages", nav: "",
  body: `<h1>Story pages</h1><p class="meta">Longer write-ups for stories from the doc.</p><ul class="weeks">` +
    storyPages.map((f) => `<li><a href="/stories/${f}">${esc(titleOf(f))}</a></li>`).join("") + `</ul>`,
}));

/* last laugh */
write("last-laugh/index.html", page({
  title: "Last Laugh", nav: "",
  body: `<h1>Last Laugh</h1><p class="meta">Comedy drops. The files live in Dropbox (and on the H: drive), not on this site.</p>
<p><a href="https://www.dropbox.com/scl/fo/4dhmg90be9u8ekrxwbhks/AAasbuyWk4i1fQhqO5ZXJKk?rlkey=84v4y92si3hypbu9jd3f5ouix&amp;dl=0" target="_blank" rel="noopener">Open the Last Laugh folder ↗</a></p>
<ul class="compact">` + lastLaugh.map((l) => `<li><span class="t">${esc(l.title)}</span> <span class="meta">${fmt(l.date)}</span><br><span class="d">${l.html.replace(/<\/?p[^>]*>/g, "")}</span></li>`).join("") + `</ul>`,
}));

/* hotkeys library (assign list) from audio.json */
write("hotkeys/library.json", JSON.stringify({
  note: "Generated by scripts/build.js from data/audio.json. Add clips there (or drop an mp3 in audio/ and run the build).",
  clips: audio.filter((c) => c.status === "ok" && c.file).map((c) => ({ name: c.title, src: c.file })),
}, null, 2) + "\n");

const stats = {
  today: TODAY, stories_current: storyCurrent.length, ideas_new: ideasNew.length, ideas_week: ideasWeek.length,
  clips_current: clipCurrent.length, archived_dated: archived.length, archived_undated: undated.length,
  legacy_dupes_skipped: legacySkipped, weeks: weeks.length, last_laugh: lastLaugh.length,
};
console.log(JSON.stringify(stats));
