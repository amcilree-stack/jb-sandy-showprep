#!/usr/bin/env node
"use strict";
/* Add a day of Johnny's cuts to the /soundboard/ Daily board (everything EXCEPT Last Laugh).
   Usage: node scripts/soundboard-add-johnny.js <stage-folder> [--date YYYY-MM-DD] [--plan filing_plan.json] [--weekday mon|tue|wed|thu|fri]
                                                [--holiday <key>|none] [--subject "email subject"] [--no-publish] [--dry-run]
          node scripts/soundboard-add-johnny.js --upkeep [--date YYYY-MM-DD] [--no-publish]   (daily: holiday pages show/hide/archive, then deploy if changed)
     --weekday       force the weekday page (default: the weekday the cuts were RECEIVED = --date; Sat/Sun -> Mon)
     --holiday       force every cut onto one holiday page (key from data/holidays.json), or "none" to turn detection off.
                     Default: detect per cut from the filename/title/runsheet text and --subject using data/holidays.json keywords.
                     Holiday cuts get tag holiday-<key> (no weekday page); the page is created (page: true) on first use.
                     Holiday pages show 14 days before the date, hide the day after, and are archived (data/holiday-archive/) until next year.
   Weekday cuts get only their day-<dow> board tag (no Evergreen/other tag) so the Sunday clear (soundboard-sunday-clear.js) expires them.
     <stage-folder>  e.g. /workspace/johnnys-cuts/stage-2026-10-09-friday-nugs (searched recursively for .mp3/.wav)
     --date          day the cuts are for (default: from "Oct D" / YYYY-MM-DD in the folder path, else today CT)
     --plan          filing plan / runsheet JSON [{filename, group, description, outcue}] (default: auto-find
                     /workspace/johnnys-cuts/filing_plan_*.json that lists these files)
   Skips Last Laugh: any path under a "Last Laugh…" folder, "quarter after" files, names/groups/descriptions saying Last Laugh.
   Pads: on the Mon–Fri page for the AIR day (filename weekday section or runsheet; else the filed day, weekend -> Mon), source "Johnny", title from filename, description from the runsheet, length (ffprobe),
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
const VALOPTS = ["--date", "--plan", "--weekday", "--holiday", "--subject"];
const DIR = argv.find((a, i) => !a.startsWith("--") && !VALOPTS.includes(argv[i - 1]));
const DRY = argv.includes("--dry-run");
const HOLS = require("./lib/holidays");
const publish = (msg) => spawnSync(path.join(__dirname, "publish.sh"), [], { stdio: "inherit", env: Object.assign({}, process.env, { SHOWPREP_COMMIT_MSG: msg }) });
if (argv.includes("--upkeep")) {
  const res = require("./soundboard-holidays").upkeep(opt("--date") || D.todayCT(), DRY);
  console.log("holiday upkeep:", JSON.stringify(res));
  if (!DRY && !argv.includes("--no-publish")) process.exit(publish(`Soundboard holiday upkeep ${res.today}: ${res.archived} archived, ${res.restored} restored`).status || 0);
  process.exit(0);
}
const WEEKDAY = opt("--weekday") ? opt("--weekday").slice(0, 3).toLowerCase() : null;
if (WEEKDAY && !["mon", "tue", "wed", "thu", "fri"].includes(WEEKDAY)) { console.error("--weekday must be mon..fri"); process.exit(64); }
const HOLOPT = opt("--holiday"), SUBJECT = opt("--subject") || "";
const HCFG = HOLS.load();
if (HOLOPT && HOLOPT !== "none" && !HCFG.holidays.some((h) => h.key === HOLOPT)) { console.error("--holiday: unknown key " + HOLOPT + " (see data/holidays.json)"); process.exit(64); }
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
function isLastLaugh(f) { const p = planOf(path.basename(f)); if ((/drop/i.test(path.basename(f)) || /^sunny_quarter/i.test(path.basename(f)))) return true; return LL.test(path.relative(DIR, f)) || LL.test(p.group || "") || LL.test(p.rel || "") || /last laugh/i.test(p.category || p.section || ""); }

/* Sandy's rule (Oct 22 2026): the page is the weekday the cuts were RECEIVED (--date), Sat/Sun -> Monday; --weekday overrides. */
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAYRE = /^(mon|tues?|wed(nes)?|thu(rs?)?|fri)(day)?$/i;
function airDay(fn, p) {
  if (WEEKDAY) return WEEKDAY;
  if (true) { const d = new Date(DATE + "T12:00:00Z").getUTCDay(); return d === 0 || d === 6 ? "mon" : DAYS[d]; }
  for (const sec of fn.replace(/\.(mp3|wav)$/i, "").split("_")) { const t = sec.trim(); if (DAYRE.test(t)) return t.slice(0, 3).toLowerCase(); }
  for (const v of [p.air_day, p.airday, p.category, p.group]) { const m = String(v || "").match(/\b(mon|tue|wed|thu|fri)[a-z]*day\b/i); if (m && (v === p.air_day || v === p.airday || DAYRE.test(String(v).trim()))) return m[1].toLowerCase(); }
  const d = new Date(DATE + "T12:00:00Z").getUTCDay();
  return d === 0 || d === 6 ? "mon" : DAYS[d];
}
/* short human title from the runsheet description, else the transcript, else the filename */
function humanTitle(fn, p, transcript) {
  const clean = (t) => t.replace(/["“”]/g, "'").replace(/\s+/g, " ").trim();
  const words = (t, n) => { const w = t.split(" "); return w.length > n ? w.slice(0, n).join(" ").replace(/[,;:–-]+$/, "") + "…" : t; };
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  let d = clean(p.description || "");
  if (d) {
    const k = d.indexOf(": ");
    let head = k > 0 ? d.slice(0, k) : d, rest = k > 0 ? d.slice(k + 2) : "";
    const strip = (t) => t.replace(/(^|[\s(])'+/g, "$1").replace(/'+(?=[\s.,!?:;)]|$)/g, "").replace(/\.\.\.|…/g, " ").replace(/\s+/g, " ").trim();
    rest = strip(rest.split(/;|\s\(|, plus |\.\s|:\s/)[0]).replace(/[.,!?]+$/, "");
    head = strip(head);
    if (head.split(" ").length <= 4 && rest) return cap(words(head + " – " + cap(rest), 10));
    return cap(words(head, 10));
  }
  const tr = clean(transcript || "");
  if (tr.split(" ").length >= 3) return cap(words(tr.split(/(?<=[.!?])\s/)[0], 7));
  return titleOf(fn);
}
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
  if (data.clips.some((c) => c.md5 === sum || (c.source_name === "Johnny" && c.filename === fn && (c.filed || c.added) === DATE))) { dupes++; console.log("  = already on the board:", fn); continue; }
  const p = planOf(fn);
  const hol = HOLOPT === "none" ? null : HOLOPT || HOLS.detect([fn, path.relative(DIR, f), p.description, p.group, p.category, SUBJECT].join(" "), HCFG.holidays);
  const board = hol ? "holiday-" + hol : airDay(fn, p);
  if (DRY) { console.log(`  would add [${board}]: ${humanTitle(fn, p, p.transcript_full || p.transcript_tail)}   ← ${fn}`); added++; continue; }
  const id = "johnny-" + sum.slice(0, 10);
  const ext = /\.wav$/i.test(fn) ? "wav" : "mp3";
  const file = `sb-audio/${id}.${ext}`;
  fs.copyFileSync(f, path.join(ROOT, file));
  const oc = spawnSync("python3", [path.join(__dirname, "outcue.py"), f], { encoding: "utf8", timeout: 900000 });
  let tr = {}; try { tr = JSON.parse(oc.stdout); } catch (e) { /* */ }
  const day = hol ? null : airDay(fn, p);
  if (hol) { const h = HCFG.holidays.find((x) => x.key === hol); if (!h.page) { h.page = true; h.page_created = DATE; HOLS.save(HCFG); console.log("  * created holiday page:", h.label); } }
  data.clips.push({ id, source_name: "Johnny", url: "", tag: hol ? "holiday-" + hol : "day-" + day, ...(hol ? { holiday: hol } : { air_day: day }), filed: DATE, title: humanTitle(fn, p, tr.text), raw_title: titleOf(fn), desc: p.description || "", added: DATE,
    file, filename: fn, md5: sum, duration: probe(f), outcue: tr.outcue || p.outcue || null, transcript: (tr.text || "").slice(0, 2000),
    head_ok: tr.head_ok !== false, tail_ok: tr.tail_ok !== false, status: "ok" });
  added++;
  console.log("  + added [" + (day || "holiday-" + hol) + "]:", humanTitle(fn, p, tr.text), "·", (tr.outcue || p.outcue || "no out cue"));
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 1) + "\n"); // save as we go (resumable)
}
console.log(`johnny → soundboard (${DATE}): ${added} added, ${skippedLL} Last Laugh skipped, ${dupes} already there`);
if (added && !DRY && !argv.includes("--no-publish")) {
  const r = publish(`Soundboard: ${added} Johnny cut(s) received ${DATE} on the day/holiday pages`);
  process.exit(r.status || 0);
}
