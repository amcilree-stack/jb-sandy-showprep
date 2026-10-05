#!/usr/bin/env node
"use strict";
/* Turn every social video link in data/ideas.json into an audio clip in audio/ (mp3) + data/audio.json.
   - One file per clip; if the mp3 is byte-identical to an existing clip it reuses that file (no duplicates).
   - If extraction fails (Facebook often does, Instagram photo posts have no video), the clip is saved
     with status "failed" and the site shows an "Open original" button.
   Usage: node scripts/extract-audio.js [--retry-failed] [--today YYYY-MM-DD]
   Env: YTDLP=/path/to/yt-dlp (default: yt-dlp on PATH, then /workspace/site-audit/ytenv/bin/yt-dlp) */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const D = require("./lib/docs");

const ROOT = path.join(__dirname, "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const TODAY = arg("--today") || D.todayCT();
const RETRY = process.argv.includes("--retry-failed");
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));

function findYtdlp() {
  const cands = [process.env.YTDLP, "yt-dlp", "/workspace/site-audit/ytenv/bin/yt-dlp"].filter(Boolean);
  for (const c of cands) { const r = spawnSync(c, ["--version"], { encoding: "utf8" }); if (r.status === 0) return c; }
  return null;
}
const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex");
function probe(f) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" });
  const v = parseFloat(r.stdout); return isNaN(v) ? null : Math.round(v * 10) / 10;
}
function oneLine(meta, idea) {
  const who = meta.uploader || meta.channel || "";
  let text = (meta.description || meta.title || "").replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  text = text.split(/(?<=[.!?])\s/)[0] || text;
  if (text.length > 130) text = text.slice(0, 127).replace(/\s+\S*$/, "") + "…";
  if (!text) text = idea.title;
  return (who ? who + ": " : "") + text;
}
function label(u) {
  const h = new URL(u).hostname.replace(/^www\./, "");
  if (/facebook|fb\.watch/.test(h)) return /\/r\/|reel/.test(u) ? "Facebook reel" : "Facebook video";
  if (/instagram/.test(h)) return /\/reel/.test(u) ? "Instagram reel" : "Instagram post";
  if (/tiktok/.test(h)) return "TikTok"; if (/youtu/.test(h)) return "YouTube"; if (/x\.com|twitter/.test(h)) return "X post";
  return h;
}

const audioData = rd("data/audio.json");
const ideas = rd("data/ideas.json").items;
const yt = findYtdlp();
let made = 0, failed = 0, reused = 0;
for (const idea of ideas) {
  for (const src of idea.social || []) {
    const existing = audioData.clips.find((c) => c.source === src);
    if (existing && !(RETRY && existing.status === "failed")) continue;
    const base = D.slug(idea.title).slice(0, 50) || "clip";
    const clip = existing || { id: base, idea_id: idea.id, title: idea.title, origin: "ideas-doc", added: TODAY, source: src, source_label: label(src) };
    if (!existing) { while (audioData.clips.some((c) => c.id === clip.id)) clip.id += "-2"; audioData.clips.push(clip); }
    if (idea.stale) clip.stale = idea.stale;
    if (!yt) { Object.assign(clip, { status: "failed", file: null, error: "yt-dlp not found", desc: clip.desc || "Audio not extracted yet; open the original." }); failed++; continue; }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "clip-"));
    const metaRun = spawnSync(yt, ["--no-playlist", "-j", src], { encoding: "utf8", timeout: 120000 });
    let meta = {};
    try { meta = JSON.parse(metaRun.stdout.trim().split("\n").pop()); } catch (e) { /* fails below */ }
    const run = metaRun.status === 0 ? spawnSync(yt, ["--no-playlist", "-x", "--audio-format", "mp3", "--audio-quality", "2", "-o", path.join(tmp, "a.%(ext)s"), src], { encoding: "utf8", timeout: 300000 }) : metaRun;
    const out = path.join(tmp, "a.mp3");
    if (run.status !== 0 || !fs.existsSync(out)) {
      const err = ((run.stderr || "") + (run.stdout || "")).split("\n").filter((l) => /ERROR/.test(l)).pop() || "extraction failed";
      Object.assign(clip, { status: "failed", file: null, error: err.slice(0, 200), attempts: (clip.attempts || 0) + 1,
        desc: clip.desc || `${label(src)} for “${idea.title}”. The audio couldn’t be pulled, so open the original.` });
      failed++;
      console.log("  ✗", idea.title, "-", clip.error);
      fs.rmSync(tmp, { recursive: true, force: true });
      continue;
    }
    const sum = md5(out);
    const twin = audioData.clips.find((c) => c.md5 === sum && c.file);
    let file;
    if (twin) { file = twin.file; reused++; }
    else {
      let name = `audio/${clip.id}.mp3`;
      let n = 2;
      while (fs.existsSync(path.join(ROOT, name))) name = `audio/${clip.id}-${n++}.mp3`;
      fs.copyFileSync(out, path.join(ROOT, name));
      file = name; made++;
    }
    Object.assign(clip, { status: "ok", file, md5: sum, duration: probe(path.join(ROOT, file)) || meta.duration || null,
      desc: clip.desc && existing && existing.status === "ok" ? clip.desc : oneLine(meta, idea), error: undefined });
    console.log("  ✓", idea.title, file, clip.duration + "s");
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
fs.writeFileSync(path.join(ROOT, "data/audio.json"), JSON.stringify(audioData, null, 1) + "\n");
console.log(`audio: ${made} new file(s), ${reused} reused, ${failed} failed (Open original)`);
