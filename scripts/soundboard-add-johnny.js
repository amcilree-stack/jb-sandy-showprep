#!/usr/bin/env node
"use strict";
/* Add a day of Johnny's cuts to the /soundboard/ Daily board (everything EXCEPT Last Laugh).
   Usage: node scripts/soundboard-add-johnny.js <stage-folder> [--date YYYY-MM-DD] [--plan filing_plan.json] [--no-publish] [--dry-run]
     <stage-folder>  e.g. /workspace/johnnys-cuts/stage-2026-10-09-friday-nugs (searched recursively for .mp3/.wav)
     --date          day the cuts are for (default: from "Oct D" / YYYY-MM-DD in the folder path, else today CT)
     --plan          filing plan / runsheet JSON [{filename, group, description, outcue}] (default: auto-find
                     /workspace/johnnys-cuts/filing_plan_*.json that lists these files)
   Skips Last Laugh: any path under a "Last Laugh…" folder, "quarter after" files, names/groups/descriptions saying Last Laugh.
   Pads: Daily (#1day), source "Johnny", title from filename, description from the runsheet, length (ffprobe),
   out cue = last 6 words via scripts/outcue.py (runsheet out cue only if the transcript is empty).
   Files are committed to sb-audio/johnny-<md5>.mp3 (no 5.5 MB upload limit); dedupe by md5, so reruns add nothing.
   Then runs scripts/publish.sh (normal commit + Netlify deploy) unless --no-publish. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const D = require("./lib/docs");

const ROOT = path.join(__dirname, "..");
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const DIR = argv.find((a, i) => !a.startsWith("--") && !["--date", "--plan"].includes(argv[i - 1]));
const DRY = argv.includes("--dry-run");
if (!DIR || !fs.existsSync(DIR)) { console.error("usage: soundboard-add-johnny.js <stage-folder> [--date YYYY-MM-DD] [--plan file] [--no-publish] [--dry-run]"); process.exit(64); }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function guessDate(p) {
  let m = p.match(/(20\d\d)-(\d\d)-(\d\d)/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = p.match(/\b([A-Z][a-z]{2})[a-z]* (\d{1,2})\b[^/]*?(20\d\d)?/);
  const y = (p.match(/(20\d\d)/) || [])[1] || D.todayCT().slice(0, 4);
  if (m && MONTHS.includes(m[1].toLowerCase())) return `${y}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return D.todayCT();
}
const DATE = opt("--date") || guessDate(path.resolve(DIR));

function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.(mp3|wav)$/i.test(e.name) ? [path.join(d, e.name)] : []); }
const files = walk(DIR);

let plan = [];
const planArg = opt("--plan");
if (planArg) plan = JSON.parse(fs.readFileSync(planArg, "utf8"));
else {
  const jd = "/workspace/johnnys-cuts";
  const names = new Set(files.map((f) => path.basename(f)));
  const cands = fs.existsSync(jd) ? fs.readdirSync(jd).filter((f) => /^(filing_plan|runsheet).*\.json$/.test(f)) : [];
  let best = null, bestN = 0;
  for (const c of cands) { try { const j = JSON.parse(fs.readFileSync(path.join(jd, c), "utf8")); const arr = Array.isArray(j) ? j : j.files || []; const n = arr.filter((x) => names.has(x.filename)).length; if (n > bestN) { best = arr; bestN = n; } } catch (e) { /* */ } }
  if (best) plan = best;
}
const planOf = (fn) => plan.find((x) => x.filename === fn) || {};

const LL = /last[\s_-]*laugh|quarter[\s_-]*after/i;
function isLastLaugh(f) { const p = planOf(path.basename(f)); return LL.test(path.relative(DIR, f)) || LL.test(p.group || "") || LL.test(p.rel || "") || /last laugh/i.test(p.category || p.section || ""); }

function titleOf(fn) {
  let t = fn.replace(/\.(mp3|wav)$/i, "").replace(/^(jbs|sunny|kvet|kase|holiday|araw)_/i, "");
  const parts = t.split("_").map((s) => s.replace(/\s{2,}/g, " – ").trim()).filter(Boolean);
  let head = "";
  if (parts.length > 1 && parts[0].split(" ").length <= 3) head = parts.shift();
  t = parts.join(" – ").replace(/\s*–\s*-\s*/g, " – ");
  const cap = (s) => s.replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  return (head ? cap(head) + ": " : "") + t.charAt(0).toUpperCase() + t.slice(1);
}
const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex");
const probe = (f) => { const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }); const v = parseFloat(r.stdout); return isNaN(v) ? null : Math.round(v * 10) / 10; };

const dataPath = path.join(ROOT, "data/soundboard.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
let added = 0, skippedLL = 0, dupes = 0;
fs.mkdirSync(path.join(ROOT, "sb-audio"), { recursive: true });
for (const f of files) {
  const fn = path.basename(f);
  if (isLastLaugh(f)) { skippedLL++; console.log("  – Last Laugh, skipped:", fn); continue; }
  const sum = md5(f);
  if (data.clips.some((c) => c.md5 === sum || (c.source_name === "Johnny" && c.filename === fn && c.added === DATE))) { dupes++; console.log("  = already on the board:", fn); continue; }
  const p = planOf(fn);
  if (DRY) { console.log("  would add:", titleOf(fn)); added++; continue; }
  const id = "johnny-" + sum.slice(0, 10);
  const ext = /\.wav$/i.test(fn) ? "wav" : "mp3";
  const file = `sb-audio/${id}.${ext}`;
  fs.copyFileSync(f, path.join(ROOT, file));
  const oc = spawnSync("python3", [path.join(__dirname, "outcue.py"), f], { encoding: "utf8", timeout: 900000 });
  let tr = {}; try { tr = JSON.parse(oc.stdout); } catch (e) { /* */ }
  data.clips.push({ id, source_name: "Johnny", url: "", tag: "1day", title: titleOf(fn), desc: p.description || "", added: DATE,
    file, filename: fn, md5: sum, duration: probe(f), outcue: tr.outcue || p.outcue || null, transcript: (tr.text || "").slice(0, 2000),
    head_ok: tr.head_ok !== false, tail_ok: tr.tail_ok !== false, status: "ok" });
  added++;
  console.log("  + added:", titleOf(fn), "·", (tr.outcue || p.outcue || "no out cue"));
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 1) + "\n"); // save as we go (resumable)
}
console.log(`johnny → soundboard (${DATE}): ${added} added, ${skippedLL} Last Laugh skipped, ${dupes} already there`);
if (added && !DRY && !argv.includes("--no-publish")) {
  const r = spawnSync(path.join(__dirname, "publish.sh"), [], { stdio: "inherit", env: Object.assign({}, process.env, { SHOWPREP_COMMIT_MSG: `Soundboard: ${added} Johnny cut(s) for ${DATE} on Daily` }) });
  process.exit(r.status || 0);
}
