/* Farmed From Other Shows: Random Pick buttons, undo, show list. Data: window.FARM = {pick, shows}. */
(function () {
  const F = window.FARM || {}; const $ = (s, r = document) => r.querySelector(s);
  const LOCK = /bobby\s*bones/i;
  const LABEL = { keep: "kept", rotation: "put in rotation", pause: "paused", ban: "banned" };
  const fmt = (t) => new Date(t).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " CT";
  let state = { clicks: [], status: {} };
  const who = () => localStorage.getItem("farmWho") || "";
  function nameBar() {
    const el = $("#farm-who"); if (!el) return;
    el.innerHTML = "You are: " + ["Sandy", "JB", "Tricia"].map((n) => `<button type="button" class="who${who() === n ? " on" : ""}" data-n="${n}">${n}</button>`).join(" ");
    el.querySelectorAll("button").forEach((b) => b.onclick = () => { localStorage.setItem("farmWho", b.dataset.n); nameBar(); });
  }
  function flush() {
    try {
      const A = new (window.AudioContext || window.webkitAudioContext)(); const t = A.currentTime, d = 2.2;
      const buf = A.createBuffer(1, A.sampleRate * d, A.sampleRate), x = buf.getChannelData(0);
      for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1;
      const n = A.createBufferSource(); n.buffer = buf;
      const f = A.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2;
      f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1400, t + 0.5); f.frequency.exponentialRampToValueAtTime(180, t + d);
      const g = A.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.15); g.gain.setValueAtTime(0.9, t + 0.9); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      const o = A.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(50, t + d);
      const og = A.createGain(); og.gain.setValueAtTime(0.25, t); og.gain.exponentialRampToValueAtTime(0.001, t + d);
      n.connect(f).connect(g).connect(A.destination); o.connect(og).connect(A.destination); n.start(t); o.start(t); n.stop(t + d); o.stop(t + d);
    } catch (e) {}
  }
  async function api(p, body) {
    const r = await fetch("/api/farm/" + p, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
    return r.json();
  }
  function fallback(show, action) {
    const t = encodeURIComponent(`Farm: ${action} ${show}`), b = encodeURIComponent(`show: ${show}\naction: ${action}\nby: ${who() || "?"}\nat: ${new Date().toISOString()}`);
    window.open(`https://github.com/amcilree-stack/jb-sandy-showprep/issues/new?title=${t}&body=${b}&labels=farm-click`, "_blank");
  }
  function statusText(show) {
    const s = state.status[show]; if (LOCK.test(show)) return "Banned forever";
    if (!s) { const base = (F.shows || []).find((x) => x.show === show); return base ? base.status + (base.until ? " until " + base.until : "") : "Not on the list"; }
    return `${s.by} ${LABEL[s.action]} this · ${fmt(s.at)}` + (s.until ? ` (back ${s.until})` : "");
  }
  let undoTimer;
  function showUndo(click) {
    const el = $("#farm-undo"); if (!el) return; clearTimeout(undoTimer);
    el.innerHTML = `${click.by} ${LABEL[click.action]} ${click.show}. <a href="#" id="farm-undo-a">Undo</a>`; el.hidden = false;
    $("#farm-undo-a").onclick = async (e) => { e.preventDefault(); try { const r = await api("undo", { id: click.id, by: who() || "Someone" }); state = r; el.textContent = "Undone."; render(); } catch (er) { el.textContent = "Undo failed: " + er.message; } setTimeout(() => el.hidden = true, 3000); };
    undoTimer = setTimeout(() => el.hidden = true, 10000);
  }
  async function act(show, action) {
    if (LOCK.test(show)) return alert("Bobby Bones stays banned.");
    if (!who()) { alert("Pick who you are first (Sandy, JB or Tricia)."); return; }
    if (action === "ban") flush();
    try { const r = await api("click", { show, action, by: who() }); state = r; render(); showUndo(r.click); }
    catch (e) { if (confirm("Couldn't save the click (" + e.message + "). Open a prefilled GitHub issue instead?")) fallback(show, action); }
  }
  function render() {
    if (F.pick) { const s = $("#pick-status"); if (s) s.textContent = state.status[F.pick.show] ? statusText(F.pick.show) : ""; }
    const ul = $("#farm-shows"); if (!ul) return;
    const names = [...new Set([...(F.shows || []).map((s) => s.show), ...Object.keys(state.status)])];
    ul.innerHTML = names.map((n) => {
      const locked = LOCK.test(n);
      return `<li><span class="t">${n.replace(/</g, "&lt;")}</span> <span class="meta">${statusText(n).replace(/</g, "&lt;")}</span>` +
        (locked ? "" : ` <select data-show="${n.replace(/"/g, "&quot;")}"><option value="">Change…</option><option value="rotation">Rotation</option><option value="pause">Pause 2 weeks</option><option value="ban">Ban</option></select>`) + `</li>`;
    }).join("");
    ul.querySelectorAll("select").forEach((s) => s.onchange = () => { if (s.value) act(s.dataset.show, s.value); });
  }
  document.querySelectorAll("[data-farm-act]").forEach((b) => b.onclick = () => act(b.dataset.show, b.dataset.farmAct));
  nameBar(); render();
  api("state").then((r) => { state = r; render(); }).catch(() => {});
})();
