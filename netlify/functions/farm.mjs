// Farmed From Other Shows API (Netlify Functions v2 + Netlify Blobs). Behind the site-wide edge auth.
//   GET  /api/farm/state   -> { clicks:[{id,show,action,by,at,undone}], status:{show:{status,until,by,at}} }
//   POST /api/farm/click   -> JSON { show, action: keep|pause|ban|rotation, by }   records a click, returns {click, state}
//   POST /api/farm/undo    -> JSON { id, by }  marks that click undone and recomputes status
// The daily "Farm other shows" routine reads /api/farm/state and applies it to data/farmed_shows.json.
import { getStore } from "@netlify/blobs";

const DAY = 86400000;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const store = () => getStore({ name: "farmed", consistency: "strong" });
const clean = (v, n = 120) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const LOCKED = /bobby\s*bones/i;
const ACTIONS = { keep: "rotation", rotation: "rotation", pause: "paused", ban: "banned" };

async function load(s) { const st = (await s.get("state", { type: "json" })) || { clicks: [] }; st.clicks ||= []; return st; }
function statusOf(clicks) {
  const out = {};
  for (const c of clicks) {
    if (c.undone) continue;
    const st = ACTIONS[c.action];
    out[c.show] = { status: st, by: c.by, at: c.at, action: c.action, ...(st === "paused" ? { until: new Date(c.at + 14 * DAY).toISOString().slice(0, 10) } : {}) };
  }
  return out;
}
const view = (st) => ({ clicks: st.clicks, status: statusOf(st.clicks) });

export default async (req) => {
  const parts = new URL(req.url).pathname.replace(/^\/api\/farm\/?/, "").split("/").filter(Boolean);
  const s = store();
  try {
    if (req.method === "GET" && parts[0] === "state") return json(view(await load(s)));
    if (req.method === "POST" && parts[0] === "click") {
      const b = await req.json();
      const show = clean(b.show), action = clean(b.action, 20), by = clean(b.by, 40) || "Someone";
      if (!show || !ACTIONS[action]) return json({ error: "need show and action keep|pause|ban|rotation" }, 400);
      if (LOCKED.test(show)) return json({ error: "Bobby Bones is permanently banned and cannot be changed" }, 403);
      const st = await load(s);
      const click = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), show, action, by, at: Date.now() };
      st.clicks.push(click);
      await s.setJSON("state", st);
      return json({ click, ...view(st) });
    }
    if (req.method === "POST" && parts[0] === "undo") {
      const b = await req.json();
      const st = await load(s);
      const c = st.clicks.find((x) => x.id === clean(b.id, 40));
      if (!c) return json({ error: "no such click" }, 404);
      c.undone = { by: clean(b.by, 40) || "Someone", at: Date.now() };
      await s.setJSON("state", st);
      return json({ click: c, ...view(st) });
    }
    return json({ error: "not found" }, 404);
  } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
};

export const config = { path: ["/api/farm/*"] };
