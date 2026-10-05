#!/usr/bin/env node
"use strict";
/* Export both Google Docs and fold anything new into data/*.json.
   - Stories doc: whole-doc fingerprint. Same as last time -> "No new stories today".
     Changed -> new headlines are added with first_seen = today; past-date mentions are flagged stale.
   - Show Ideas doc: every line is fingerprinted in data/seen-blocks.json. Unseen lines are new
     (Sandy pastes at the top); each blank-line-separated run of new lines becomes one idea.
   Usage: node scripts/sync-docs.js [--today YYYY-MM-DD] [--from-dir DIR]  (DIR holds stories.txt, ideas.txt, ideas.html) */
const fs = require("fs");
const path = require("path");
const D = require("./lib/docs");

const ROOT = path.join(__dirname, "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const TODAY = arg("--today") || D.todayCT();
const FROM = arg("--from-dir");
const CACHE = path.join(ROOT, ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const wr = (f, o) => fs.writeFileSync(path.join(ROOT, f), JSON.stringify(o, null, 1) + "\n");

async function get(name, id, fmt) {
  if (FROM) return fs.readFileSync(path.join(FROM, `${name}.${fmt}`), "utf8");
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(D.exportUrl(id, fmt), { redirect: "follow" });
      if (!r.ok) throw new Error(`${name}.${fmt}: HTTP ${r.status}`);
      const t = await r.text();
      if (/<title>Google Docs<\/title>|accounts\.google\.com/i.test(t.slice(0, 2000)) && fmt === "txt") throw new Error(`${name}: doc is not public`);
      fs.writeFileSync(path.join(CACHE, `${name}.${fmt}`), t);
      return t;
    } catch (e) { last = e; await new Promise((s) => setTimeout(s, 1500 * (i + 1))); }
  }
  throw last;
}

function firstLineTitle(t) {
  t = t.replace(/\s+/g, " ").trim();
  const sentence = t.split(/(?<=[.?!])\s/)[0];
  const base = sentence.length <= 90 ? sentence : t.slice(0, 90).replace(/\s+\S*$/, "") + "…";
  return base.replace(/^unknown poll:\s*/i, "Poll: ");
}

(async () => {
  const seen = rd("data/seen-blocks.json");
  const storiesData = rd("data/stories.json");
  const ideasData = rd("data/ideas.json");
  const result = { today: TODAY, stories_changed: false, new_stories: [], left_doc: [], new_ideas: [] };

  /* ---- stories ---- */
  const sTxt = await get("stories", D.DOCS.stories, "txt");
  const h = D.docHash(sTxt);
  const st = seen.stories || (seen.stories = {});
  if (st.doc_hash === h) {
    st.unchanged_since_last_check = true;
    st.new_today = 0;
  } else {
    result.stories_changed = true;
    const parsed = D.parseStories(sTxt);
    const ids = new Set();
    for (const s of parsed) {
      const id = D.slug(s.headline);
      if (ids.has(id)) continue; // same story pasted under two sections
      ids.add(id);
      if (storiesData.items.some((x) => x.id === id)) continue;
      const rec = { id, type: D.storyType(s.section), section: s.section, headline: s.headline, summary: s.summary || null, hook: s.hook || null, social: s.social || null, first_seen: TODAY };
      const past = D.mentionedDates([s.headline, s.summary, s.hook].join(" "), TODAY).filter((d) => d < TODAY);
      const future = D.mentionedDates([s.headline, s.summary, s.hook].join(" "), TODAY).filter((d) => d >= TODAY);
      // Only call it stale when the story looks forward ("upcoming", "will", "this weekend"...) to dates that have all passed.
      const forward = /\b(upcoming|will|this (week|weekend|month)|tomorrow|tonight|ahead of|set to|plans? to|kicks? off|starts?)\b/i.test([s.headline, s.summary].join(" "));
      if (past.length && !future.length && forward) rec.stale = "Upcoming event whose date has passed (" + past.join(", ") + ")";
      if (/delete after/i.test(s.summary || "")) rec.stale = "Marked “delete after” in the doc";
      storiesData.items.push(rec);
      result.new_stories.push(s.headline);
    }
    for (const s of storiesData.items) {
      if (!ids.has(s.id) && !s.left_doc) { s.left_doc = TODAY; if (!s.stale) s.stale = "Removed from the stories doc " + TODAY; result.left_doc.push(s.headline); }
    }
    st.doc_hash = h;
    st.last_changed = TODAY;
    st.unchanged_since_last_check = false;
    st.new_today = result.new_stories.length;
    st.headlines = storiesData.items.map((s) => D.hash(s.headline));
  }
  st.last_checked = TODAY;

  /* ---- ideas ---- */
  let paras;
  try { paras = D.paragraphsFromHtml(await get("ideas", D.DOCS.ideas, "html")); }
  catch (e) { console.error("HTML export failed, using txt:", e.message); paras = D.paragraphsFromTxt(await get("ideas", D.DOCS.ideas, "txt")); }
  const seenSet = new Set((seen.ideas && seen.ideas.lines) || []);
  const fresh = [];
  for (const b of D.ideaBlocks(paras)) {
    const newParas = b.paras.filter((p) => !seenSet.has(D.hash(p.text)));
    if (!newParas.length) continue;
    const text = newParas.map((p) => p.text).join("\n");
    if (text.replace(/\W/g, "").length < 3) { newParas.forEach((p) => seenSet.add(D.hash(p.text))); continue; } // stray keystrokes like "m"
    const links = [];
    newParas.forEach((p) => p.links.forEach((l) => { const u = D.cleanUrl(l.url); if (!links.some((x) => x.url === u)) links.push({ url: u, label: l.label || null }); }));
    let id = D.slug(firstLineTitle(newParas[0].text)) || "idea-" + TODAY;
    while (ideasData.items.some((x) => x.id === id) || fresh.some((x) => x.id === id)) id += "-2";
    fresh.push({
      id, title: firstLineTitle(newParas[0].text), body: null, doc_text: text, added: TODAY, links,
      social: links.filter((l) => D.isSocialVideo(l.url)).map((l) => l.url), doc_lines: newParas.map((p) => D.hash(p.text)),
      partial: newParas.length < b.paras.length ? "Added to an existing note in the doc" : undefined,
    });
    newParas.forEach((p) => seenSet.add(D.hash(p.text)));
  }
  ideasData.items = fresh.concat(ideasData.items);
  result.new_ideas = fresh.map((i) => i.title);
  seen.ideas = Object.assign(seen.ideas || {}, { updated: TODAY, lines: [...seenSet] });
  if (fresh.length) seen.ideas.last_new = TODAY;

  wr("data/stories.json", storiesData);
  wr("data/ideas.json", ideasData);
  wr("data/seen-blocks.json", seen);
  fs.writeFileSync(path.join(CACHE, "sync-result.json"), JSON.stringify(result, null, 1));
  console.log(`stories: ${result.stories_changed ? result.new_stories.length + " new" : "doc unchanged (No new stories today)"}; ideas: ${fresh.length} new`);
  fresh.forEach((i) => console.log("  + idea:", i.title, i.social.length ? `(${i.social.length} social link)` : ""));
  result.new_stories.forEach((t) => console.log("  + story:", t));
})().catch((e) => { console.error("sync-docs failed:", e.message); process.exit(1); });
