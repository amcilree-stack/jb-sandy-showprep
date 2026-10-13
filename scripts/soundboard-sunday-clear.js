#!/usr/bin/env node
"use strict";
/* Sunday clear: move every Johnny pad on the Mon–Fri pages to Trash (kept 7 days, Restore works),
   except pads someone set to Evergreen with the button (or moved to any non-weekday board).
   Also prunes Johnny clips that have been gone (trashed > 7 days) from data/soundboard.json + sb-audio/
   and deploys that cleanup via scripts/publish.sh.
   Usage: SITE_BASIC_AUTH_PASSWORD=... SHOWPREP_GITHUB_TOKEN=... node scripts/soundboard-sunday-clear.js [--dry-run] [--no-publish] */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const SITE = process.env.SOUNDBOARD_SITE || "https://howaboutodetosausage.com";
const DRY = process.argv.includes("--dry-run");
const PW = process.env.SITE_BASIC_AUTH_PASSWORD;
if (!PW) { console.error("SITE_BASIC_AUTH_PASSWORD is not set"); process.exit(2); }
const AUTH = "Basic " + Buffer.from("SausageLover:" + PW).toString("base64");
const WEEK = ["mon", "tue", "wed", "thu", "fri"];
const DAY = 864e5;

(async () => {
  const st = await (await fetch(SITE + "/api/sb/state", { headers: { authorization: AUTH } })).json();
  const dataPath = path.join(ROOT, "data/soundboard.json");
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  let cleared = 0, kept = 0, pruned = 0;
  for (const c of data.clips.filter((x) => x.source_name === "Johnny")) {
    const o = st.overrides[c.id] || {};
    if (o.trashedAt || o.gone) continue;
    const board = o.board || (String(c.tag).startsWith("day-") ? c.tag.slice(4) : null);
    if (!WEEK.includes(board)) { kept++; continue; } // Evergreen (button) or moved elsewhere
    cleared++;
    console.log("  → Trash:", c.title);
    if (!DRY) {
      const r = await fetch(SITE + "/api/sb/clip/" + encodeURIComponent(c.id), { method: "POST", headers: { authorization: AUTH, "content-type": "application/json" }, body: JSON.stringify({ trash: true }) });
      if (!r.ok) { console.error("  ! failed:", c.id, r.status); process.exitCode = 1; }
    }
  }
  // prune Johnny clips whose 7 days in Trash are over
  data.clips = data.clips.filter((c) => {
    const o = st.overrides[c.id] || {};
    const over = c.source_name === "Johnny" && (o.gone || (o.trashedAt && Date.now() - o.trashedAt > 7 * DAY));
    if (over) { pruned++; if (!DRY && c.file && fs.existsSync(path.join(ROOT, c.file))) fs.rmSync(path.join(ROOT, c.file)); }
    return !over;
  });
  console.log(`sunday clear: ${cleared} Johnny pad(s) to Trash, ${kept} kept (Evergreen/moved), ${pruned} expired pruned${DRY ? " (dry run)" : ""}`);
  if (pruned && !DRY) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 1) + "\n");
    if (!process.argv.includes("--no-publish")) spawnSync(path.join(__dirname, "publish.sh"), [], { stdio: "inherit", env: Object.assign({}, process.env, { SHOWPREP_COMMIT_MSG: `Soundboard Sunday clear: pruned ${pruned} expired Johnny clip(s)` }) });
  }
})();
