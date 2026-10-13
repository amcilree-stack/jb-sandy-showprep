// Soundboard API (Netlify Functions v2 + Netlify Blobs, free tier). Behind the site-wide SausageLover edge auth.
//   GET  /api/sb/state            -> { overrides, uploads }
//   POST /api/sb/upload?meta=...  -> raw MP3/WAV body (max ~5.5 MB) -> new uploaded clip
//   GET  /api/sb/audio/:id        -> uploaded audio bytes
//   POST /api/sb/clip/:id         -> JSON { board, trash, fav, title, desc, outcue } merged into that clip's override
import { getStore } from "@netlify/blobs";

const DAY = 86400000;
const MAX = 5.5 * 1024 * 1024;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const store = () => getStore({ name: "soundboard", consistency: "strong" });
const clean = (v, n = 300) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const BOARD_RE = /^(daily|evergreen|beds|holiday-[a-z0-9]+)$/;

async function load(s) {
  const st = (await s.get("state", { type: "json" })) || { overrides: {}, uploads: [] };
  st.overrides ||= {}; st.uploads ||= [];
  return st;
}
// Daily clock: starts 12:01 AM CT the day after it was added, runs 24h, then 7 days in Archive.
function ctMidnightAfter(ts) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(ts));
  const [y, m, d] = ymd.split("-").map(Number);
  for (const off of [5, 6]) {
    const t = Date.UTC(y, m - 1, d + 1, off, 1);
    const h = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(new Date(t));
    if (Number(h) === 0) return t;
  }
  return Date.UTC(y, m - 1, d + 1, 5, 1);
}
async function purge(s, st) {
  const now = Date.now();
  let changed = false;
  const keep = [];
  for (const u of st.uploads) {
    const o = st.overrides[u.id] || {};
    const board = o.board || u.board;
    const trashedOut = o.trashedAt && now - o.trashedAt > 7 * DAY;
    const archivedOut = !o.trashedAt && board === "daily" && now > ctMidnightAfter(u.added) + DAY + 7 * DAY;
    if (trashedOut || archivedOut) { await s.delete("audio/" + u.id); delete st.overrides[u.id]; changed = true; }
    else keep.push(u);
  }
  st.uploads = keep;
  for (const [id, o] of Object.entries(st.overrides)) if (o.trashedAt && now - o.trashedAt > 7 * DAY && !o.gone) { o.gone = true; changed = true; }
  return changed;
}

export default async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/sb\/?/, "").split("/").filter(Boolean);
  const s = store();
  try {
    if (req.method === "GET" && parts[0] === "state") {
      const st = await load(s);
      if (await purge(s, st)) await s.setJSON("state", st);
      return json(st);
    }
    if (req.method === "GET" && parts[0] === "audio" && parts[1]) {
      const r = await s.getWithMetadata("audio/" + parts[1], { type: "arrayBuffer" });
      if (!r) return new Response("not found", { status: 404 });
      return new Response(r.data, { headers: { "content-type": r.metadata?.mime || "audio/mpeg", "cache-control": "private, max-age=31536000, immutable" } });
    }
    if (req.method === "POST" && parts[0] === "upload") {
      const meta = JSON.parse(url.searchParams.get("meta") || "{}");
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return json({ error: "empty file" }, 400);
      if (buf.byteLength > MAX) return json({ error: "File is over 5.5 MB. Trim it or export as MP3." }, 413);
      const mime = /wav/i.test(req.headers.get("content-type") || meta.name || "") ? "audio/wav" : "audio/mpeg";
      const board = BOARD_RE.test(meta.board) ? meta.board : "daily";
      const id = "up-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await s.set("audio/" + id, buf, { metadata: { mime } });
      const st = await load(s);
      const clip = { id, title: clean(meta.title, 120) || "Untitled clip", desc: clean(meta.desc), outcue: clean(meta.outcue, 200),
        board, duration: Number(meta.duration) || null, added: Date.now(), mime, size: buf.byteLength, name: clean(meta.name, 200) };
      st.uploads.push(clip);
      await s.setJSON("state", st);
      return json({ ok: true, clip });
    }
    if (req.method === "POST" && parts[0] === "clip" && parts[1]) {
      const id = clean(parts[1], 120);
      const b = await req.json();
      const st = await load(s);
      const o = st.overrides[id] || (st.overrides[id] = {});
      if (b.board !== undefined) { if (!BOARD_RE.test(b.board)) return json({ error: "bad board" }, 400); o.board = b.board; o.boardSetAt = Date.now(); }
      if (b.trash === true) o.trashedAt = Date.now();
      if (b.trash === false) { delete o.trashedAt; delete o.gone; }
      if (b.fav !== undefined) o.fav = !!b.fav;
      for (const k of ["title", "desc", "outcue"]) if (b[k] !== undefined) o[k] = clean(b[k], k === "title" ? 120 : 300);
      if (b.purge === true) { // permanent delete from Trash
        const u = st.uploads.find((x) => x.id === id);
        if (u) { await s.delete("audio/" + id); st.uploads = st.uploads.filter((x) => x.id !== id); delete st.overrides[id]; }
        else o.gone = true;
      }
      await s.setJSON("state", st);
      return json({ ok: true, override: st.overrides[id] || null });
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 500);
  }
};

export const config = { path: ["/api/sb/*"] };
