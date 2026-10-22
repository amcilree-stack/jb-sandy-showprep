"use strict";
/* Holiday rules for the soundboard (data/holidays.json). Dates are CT calendar days (YYYY-MM-DD strings). */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "../..");
const FILE = path.join(ROOT, "data/holidays.json");
const ARCH = path.join(ROOT, "data/holiday-archive");
const load = () => JSON.parse(fs.readFileSync(FILE, "utf8"));
const save = (j) => fs.writeFileSync(FILE, JSON.stringify(j, null, 1) + "\n");
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451); return iso(y, Math.floor((h + l - 7 * m + 114) / 31), (h + l - 7 * m + 114) % 31 + 1); }
function dateIn(h, y) {
  const r = h.rule;
  if (r.type === "fixed") return iso(y, r.month, r.day);
  if (r.type === "easter") return easter(y);
  if (r.type === "nth") { const first = new Date(Date.UTC(y, r.month - 1, 1)).getUTCDay(); return iso(y, r.month, (r.dow - first + 7) % 7 + 1 + (r.n - 1) * 7); }
  if (r.type === "last") { const last = new Date(Date.UTC(y, r.month, 0)); return iso(y, r.month, last.getUTCDate() - (last.getUTCDay() - r.dow + 7) % 7); }
  throw new Error("bad rule " + h.key);
}
/* next occurrence on/after today: {date, start (first visible day), end (first hidden day)} */
function windowFor(h, today) {
  const y = +today.slice(0, 4);
  for (const yy of [y - 1, y, y + 1]) {
    const date = dateIn(h, yy), end = h.hide_after_day === false ? addDays(date, 7) : addDays(date, 1);
    if (today < end) return { date, start: addDays(date, -(h.show_before_days ?? 14)), end };
  }
}
const visible = (h, today) => { const w = windowFor(h, today); return today >= w.start && today < w.end; };
const norm = (s) => " " + String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ") + " ";
function detect(text, list) {
  const t = norm(text);
  for (const h of list || load().holidays) for (const k of h.keywords || []) if (t.includes(" " + norm(k).trim() + " ") || t.includes(" " + norm(k).trim() + "s ")) return h.key;
  return null;
}
const archPath = (key) => path.join(ARCH, key + ".json");
const readArch = (key) => fs.existsSync(archPath(key)) ? JSON.parse(fs.readFileSync(archPath(key), "utf8")) : { key, note: "Archived holiday clips (hidden page). Audio stays in sb-audio/. Restored to data/soundboard.json when the page shows again.", clips: [] };
const writeArch = (key, a) => { fs.mkdirSync(ARCH, { recursive: true }); fs.writeFileSync(archPath(key), JSON.stringify(a, null, 1) + "\n"); };
module.exports = { load, save, dateIn, windowFor, visible, detect, readArch, writeArch, addDays, ROOT };
