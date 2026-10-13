#!/usr/bin/env node
"use strict";
/* Feed the /soundboard/ from social video links in the Show Ideas doc (HTML export, embedded links included).
   A doc line reads:  URL #tag - description     (the link may also sit on words in the line)
   Tags: #1day (or none) -> Daily · #evergreen · #beds · #holiday-<name>
   - New link: pull audio with yt-dlp -> sb-audio/<id>.mp3, length via ffprobe, out cue = last words of a
     faster-whisper transcript (scripts/outcue.py), then add to data/soundboard.json with added = today (CT).
   - Known link: tag/description are refreshed from the doc every run (the board moves the clip unless a
     board was set with a button on the site, which wins).
   SAFETY: extraction is OFF unless data/soundboard-config.json has "extract": true (or SOUNDBOARD_EXTRACT=1).
   Usage: node scripts/soundboard-sync.js [--today YYYY-MM-DD] [--dry-run] */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const D = require("./lib/docs");

const ROOT = path.join(__dirname, "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const TODAY = arg("--today") || D.todayCT();
const DRY = process.argv.includes("--dry-run");
const cfgPath = path.join(ROOT, "data/soundboard-config.json");
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};
const ENABLED = cfg.extract === true || process.env.SOUNDBOARD_EXTRACT === "1";

const TAG_RE = /(^|\s)#(1day|evergreen|beds|holiday-[a-z0-9'’-]+)\b/i;
function parseLine(text, url) {
  const m = text.match(TAG_RE);
  const tag = m ? m[2].toLowerCase().replace(/['’]/g, "") : "";
  let desc = text.replace(/https?:\/\/\S+/g, " ").replace(/(^|\s)#[\w-]+/g, " ");
  const dash = desc.match(/\s[-–—]\s*(.+)$/);
  desc = (dash ? dash[1] : desc).replace(/\s+/g, " ").replace(/^[-–—\s]+/, "").trim();
  return { tag, desc };
}
function docLinks() {
  const htmlPath = path.join(ROOT, ".cache/ideas.html");
  if (!fs.existsSync(htmlPath)) { console.log("soundboard: no .cache/ideas.html (run sync-docs first)"); return []; }
  const out = [];
  for (const p of D.paragraphsFromHtml(fs.readFileSync(htmlPath, "utf8"))) {
    const urls = new Set(p.links.map((l) => l.url).concat(p.text.match(/https?:\/\/\S+/g) || []));
    for (const u of urls) if (D.isSocialVideo(u)) out.push(Object.assign({ url: D.cleanUrl(u), line: p.text }, parseLine(p.text, u)));
  }
  return out;
}
function findBin(c) { for (const x of c.filter(Boolean)) if (spawnSync(x, ["--version"]).status === 0) return x; return null; }

const dataPath = path.join(ROOT, "data/soundboard.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const links = docLinks();
let moved = 0, made = 0, failed = 0;
// refresh tags/descriptions for clips already on the board (works even with extraction off)
for (const c of data.clips) {
  const l = links.find((x) => x.url === c.url);
  if (!l) continue;
  if (l.tag !== c.tag) { c.tag = l.tag; moved++; }
  if (l.desc && l.desc !== c.doc_desc) { if (c.doc_desc !== undefined) c.desc = l.desc; c.doc_desc = l.desc; } // only a doc edit overrides the written description
}
data.skipped = data.skipped || []; // cached: links checked once and found to have no audio (photo posts etc.) -> never re-checked
const SB_TAG = (t) => /^(1day|evergreen|beds|holiday-.+)$/.test(t || "");
const fresh = links.filter((l, i) => links.findIndex((x) => x.url === l.url) === i && !data.clips.some((c) => c.url === l.url)
  && !(data.skipped.some((x) => x.url === l.url) && !SB_TAG(l.tag))); // a tag added later still gets a pad
// does yt-dlp metadata show a playable audio track?  true / false (no audio) / null (couldn't tell)
function hasAudio(meta, info) {
  const err = String(meta.stderr || "");
  if (meta.status !== 0) return /No video formats found|There is no video in this post|Unsupported URL|no video/i.test(err) ? false : null;
  const fmts = info.formats || [];
  if (fmts.length) return fmts.some((f) => f.acodec && f.acodec !== "none") || fmts.some((f) => f.acodec == null && f.vcodec && f.vcodec !== "none") ? true : false;
  if (info.acodec) return info.acodec !== "none";
  return info.duration ? true : null;
}
if (!ENABLED) {
  console.log(`soundboard: extraction is OFF (data/soundboard-config.json). ${fresh.length} doc link(s) waiting, ${moved} tag change(s).`);
} else {
  const yt = findBin([process.env.YTDLP, "yt-dlp", "/workspace/site-audit/ytenv/bin/yt-dlp"]);
  fs.mkdirSync(path.join(ROOT, "sb-audio"), { recursive: true });
  for (const l of fresh) {
    if (DRY) { console.log("  would extract", l.url, l.tag || "(no tag)"); continue; }
    const id = "doc-" + crypto.createHash("sha1").update(l.url).digest("hex").slice(0, 10);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-"));
    const meta = yt ? spawnSync(yt, ["--no-playlist", "-j", l.url], { encoding: "utf8", timeout: 120000 }) : { status: 1 };
    let info = {}; try { info = JSON.parse(meta.stdout.trim().split("\n").pop()); } catch (e) { /* */ }
    const audio = yt ? hasAudio(meta, info) : null;
    if (audio !== true && !SB_TAG(l.tag)) { // no confirmed sound and no soundboard tag: skip silently, cache it
      if (!data.skipped.some((x) => x.url === l.url)) data.skipped.push({ url: l.url, checked: TODAY, reason: audio === false ? "no audio track (photo post / no video)" : "could not confirm audio" });
      console.log("  – skipped (no audio):", l.url); fs.rmSync(tmp, { recursive: true, force: true }); continue;
    }
    const run = meta.status === 0 || SB_TAG(l.tag) ? spawnSync(yt, ["--no-playlist", "-x", "--audio-format", "mp3", "--audio-quality", "2", "-o", path.join(tmp, "a.%(ext)s"), l.url], { encoding: "utf8", timeout: 300000 }) : meta;
    const out = path.join(tmp, "a.mp3");
    if (run.status !== 0 || !fs.existsSync(out)) {
      const err = String((run.stderr || "yt-dlp missing")).split("\n").filter((x) => /ERROR/.test(x)).pop() || "extraction failed";
      // can't download: show the pad as "Needs live recording" (no audio) so someone can record it from the mixer
      data.clips.push({ id, url: l.url, tag: l.tag, doc_desc: l.desc, title: (l.desc || info.title || "Video clip").slice(0, 80), desc: l.desc || "", added: TODAY,
        file: null, duration: null, outcue: null, status: "needs_recording", error: err.slice(0, 200) });
      failed++; console.log("  ✗ needs live recording:", l.url, err); fs.rmSync(tmp, { recursive: true, force: true }); continue;
    }
    const file = `sb-audio/${id}.mp3`;
    fs.copyFileSync(out, path.join(ROOT, file));
    const pr = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], { encoding: "utf8" });
    const oc = spawnSync("python3", [path.join(__dirname, "outcue.py"), out], { encoding: "utf8", timeout: 600000 });
    let tr = {}; try { tr = JSON.parse(oc.stdout); } catch (e) { /* no transcript */ }
    // full post audio is kept untrimmed, so nothing is cut; flag if the source itself starts/ends mid-word
    if (tr.head_ok === false || tr.tail_ok === false) console.log("  ! word at the very " + (tr.head_ok === false ? "start" : "end") + " of the source:", l.url);
    const title = (l.desc || info.title || "Clip").replace(/\s+/g, " ").slice(0, 80);
    data.clips.push({ id, url: l.url, tag: l.tag, doc_desc: l.desc, title, desc: l.desc || (info.uploader ? info.uploader + ": " : "") + (info.title || ""), added: TODAY,
      file, duration: Math.round(parseFloat(pr.stdout) * 10) / 10 || null, outcue: tr.outcue || null, incue: tr.incue || null, transcript: (tr.text || "").slice(0, 2000), status: "ok", head_ok: tr.head_ok !== false, tail_ok: tr.tail_ok !== false });
    made++; console.log("  ✓", title, file);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
if (!DRY) fs.writeFileSync(dataPath, JSON.stringify(data, null, 1) + "\n");
console.log(`soundboard: ${made} new clip(s), ${failed} failed, ${moved} retagged`);
