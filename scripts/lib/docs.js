"use strict";
/* Shared helpers: Google Doc export parsing, hashing, dates. No npm deps. */
const crypto = require("crypto");

const DOCS = {
  stories: "1Ne3xytvS0dxznA65lRRhipuknnxC3ejBopajqSJPhrI",
  ideas: "1DT2dLgDE7Hg_TdkzAmNEQKpL1m89vXj6-RyxtHeQQvw",
};
const exportUrl = (id, fmt) => `https://docs.google.com/document/d/${id}/export?format=${fmt}`;

function normalize(s) {
  return String(s || "")
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
const hash = (s) => crypto.createHash("sha1").update(normalize(s)).digest("hex").slice(0, 12);
const docHash = (txt) =>
  crypto.createHash("sha1").update(String(txt || "").replace(/\r/g, "").split("\n").map(normalize).filter(Boolean).join("\n")).digest("hex").slice(0, 16);

const NAMED = { rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201D", ldquo: "\u201C", hellip: "\u2026", rarr: "\u2192", larr: "\u2190",
  mdash: "\u2014", ndash: "\u2013", eacute: "\u00e9", copy: "\u00a9", reg: "\u00ae", trade: "\u2122", bull: "\u2022", middot: "\u00b7", deg: "\u00b0" };
function decodeEntities(s) {
  return String(s)
    .replace(/&(rsquo|lsquo|rdquo|ldquo|hellip|rarr|larr|mdash|ndash|eacute|copy|reg|trade|bull|middot|deg);/g, (_, n) => NAMED[n])
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function unwrapGoogle(href) {
  href = decodeEntities(href);
  try {
    const u = new URL(href);
    if (/google\.com$/.test(u.hostname) && u.pathname === "/url" && u.searchParams.get("q")) return u.searchParams.get("q");
  } catch (e) { /* keep */ }
  return href;
}

/* Lines from the HTML export (paragraphs split on <br>, like the txt export):
   [{text, links:[{url,label}]}]; blank lines kept as text "" */
function paragraphsFromHtml(html) {
  const body = String(html).replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  const out = [];
  const re = /<(p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(body))) {
    const segs = m[2].split(/<br\s*\/?>/i);
    segs.forEach((inner) => {
      const links = [];
      inner.replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, h, t) => {
        const url = unwrapGoogle(h);
        const label = decodeEntities(t.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
        const have = links.find((l) => l.url === url);
        if (!have) links.push({ url, label });
        else if (label && !have.label) have.label = label;
        return "";
      });
      const text = decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      out.push({ text, links });
    });
  }
  return out;
}

/* Fallback when only the txt export is available */
function paragraphsFromTxt(txt) {
  return String(txt).replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n").map((line) => {
    const links = (line.match(/https?:\/\/\S+/g) || []).map((url) => ({ url, label: "" }));
    return { text: line.trim(), links };
  });
}

const isSeparator = (t) => /^[_\-=*\s]{3,}$/.test(t);

/* Split ideas paragraphs into blocks: runs of non-empty paragraphs separated by blank ones. */
function ideaBlocks(paras) {
  const blocks = [];
  let cur = null;
  paras.forEach((p, i) => {
    if (!p.text || isSeparator(p.text)) { cur = null; return; }
    if (!cur) { cur = { start: i, paras: [] }; blocks.push(cur); }
    cur.paras.push(p);
  });
  return blocks;
}

const SOCIAL_RE = /(^|\.)(facebook\.com|fb\.watch|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|threads\.net)$/i;
function isSocialVideo(url) {
  try {
    const u = new URL(url);
    if (!SOCIAL_RE.test(u.hostname)) return false;
    const p = u.pathname;
    if (/instagram\.com$/.test(u.hostname)) return /^\/(p|reel|reels|tv)\//.test(p);
    if (/facebook\.com$/.test(u.hostname)) return /\/(share\/(r|v)|reel|videos|watch)\b/.test(p + u.search);
    if (/(x|twitter)\.com$/.test(u.hostname)) return /\/status\//.test(p);
    return true;
  } catch (e) { return false; }
}
function cleanUrl(url) {
  try {
    const u = new URL(url);
    ["utm_source", "utm_medium", "utm_placement", "utm_campaign", "user_id", "igsh", "stkn", "si", "img_index", "rdid", "mibextid"].forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch (e) { return url; }
}

/* Stories doc (txt export): sections "### X", items "* Headline", indented "  * The Hook:" etc. */
function parseStories(txt) {
  const lines = String(txt).replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  const items = [];
  let section = "";
  let cur = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const h = raw.match(/^#{1,4}\s*(.+)$/);
    if (h) { section = h[1].trim(); cur = null; continue; }
    const top = raw.match(/^\*\s+(.+)$/);
    if (top) { cur = { section, headline: top[1].trim(), summary: "", hook: "", social: "" }; items.push(cur); continue; }
    if (!cur) continue;
    const sub = raw.match(/^\s+\*\s+(.+)$/);
    const t = (sub ? sub[1] : raw).trim();
    const hk = t.match(/^The Hook:\s*(.*)$/i);
    const sc = t.match(/^Social Copy:\s*(.*)$/i);
    if (hk) cur.hook = hk[1];
    else if (sc) cur.social = sc[1];
    else cur.summary = (cur.summary ? cur.summary + " " : "") + t;
  }
  return items;
}

function storyType(section) {
  const s = section.toLowerCase();
  if (/birthday/.test(s)) return "birthday";
  if (/sports|schedule/.test(s)) return "sports";
  if (/poll/.test(s)) return "poll";
  if (/quick/.test(s)) return "quick";
  if (/weird|criminal/.test(s)) return "weird";
  return "standout";
}

const slug = (s) => normalize(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/* Dates are plain YYYY-MM-DD strings in America/Chicago. */
function todayCT() {
  if (process.env.SHOWPREP_TODAY) return process.env.SHOWPREP_TODAY;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/* Past dates mentioned in text, e.g. "September 13" -> 2026-09-13 (same year as today) */
function mentionedDates(text, today) {
  const out = [];
  const re = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
  let m;
  while ((m = re.exec(text || ""))) {
    const mon = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    const day = +m[2];
    if (day < 1 || day > 31) continue;
    out.push(`${today.slice(0, 4)}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return out;
}

module.exports = {
  DOCS, exportUrl, normalize, hash, docHash, paragraphsFromHtml, paragraphsFromTxt, ideaBlocks,
  isSocialVideo, cleanUrl, parseStories, storyType, slug, todayCT, addDays, mentionedDates, isSeparator,
};
