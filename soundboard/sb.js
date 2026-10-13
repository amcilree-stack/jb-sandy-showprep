/* JB & Sandy Soundboard. Doc clips: /data/soundboard.json (publish pipeline). Edits + uploads: /api/sb (Netlify Blobs). */
(function () {
  "use strict";
  var DAY = 864e5, TZ = "America/Chicago";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var state = { overrides: {}, uploads: [] }, docClips = [], tab = "daily", q = "", audios = {}, current = null, toastT = null;

  /* ---------- dates (America/Chicago) ---------- */
  function ctParts(t) { var p = {}; new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).forEach(function (x) { p[x.type] = +x.value; }); return p; }
  function ctTime(y, m, d, hh, mm) { // timestamp of a CT wall-clock time
    for (var off = 5; off <= 6; off++) { var t = Date.UTC(y, m - 1, d, hh + off, mm); var p = ctParts(t); if (p.hour === hh && p.day === new Date(Date.UTC(y, m - 1, d)).getUTCDate()) return t; }
    return Date.UTC(y, m - 1, d, hh + 5, mm);
  }
  function addedTs(a) { if (typeof a === "number") return a; var s = String(a).split("-").map(Number); return ctTime(s[0], s[1], s[2], 12, 0); }
  function dailyStart(added) { var p = ctParts(addedTs(added)); return ctTime(p.year, p.month, p.day + 1, 0, 1); }
  function rel(ms) { var h = Math.max(0, ms) / 36e5; return h >= 48 ? Math.ceil(h / 24) + "d" : h >= 1 ? Math.ceil(h) + "h" : Math.max(1, Math.ceil(h * 60)) + "m"; }

  /* ---------- holidays: tab shows 4 weeks before, hides after the day ---------- */
  function nthDow(y, m, dow, n) { var d = new Date(Date.UTC(y, m - 1, 1)); var first = (dow - d.getUTCDay() + 7) % 7 + 1; return [y, m, first + (n - 1) * 7]; }
  function lastDow(y, m, dow) { var last = new Date(Date.UTC(y, m, 0)); return [y, m, last.getUTCDate() - (last.getUTCDay() - dow + 7) % 7]; }
  function easter(y) { var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = (h + l - 7 * m + 114) % 31 + 1; return [y, mo, da]; }
  var HOL = [
    ["newyears", "🎆 New Year's", function (y) { return [y, 1, 1]; }],
    ["valentines", "💘 Valentine's", function (y) { return [y, 2, 14]; }],
    ["stpatricks", "☘️ St. Patrick's", function (y) { return [y, 3, 17]; }],
    ["easter", "🐣 Easter", easter],
    ["memorialday", "🇺🇸 Memorial Day", function (y) { return lastDow(y, 5, 1); }],
    ["july4th", "🎇 July 4th", function (y) { return [y, 7, 4]; }],
    ["laborday", "🛠 Labor Day", function (y) { return nthDow(y, 9, 1, 1); }],
    ["halloween", "🎃 Halloween", function (y) { return [y, 10, 31]; }],
    ["thanksgiving", "🦃 Thanksgiving", function (y) { return nthDow(y, 11, 4, 4); }],
    ["christmas", "🎄 Christmas", function (y) { return [y, 12, 25]; }]
  ];
  var ALIAS = { newyear: "newyears", newyearsday: "newyears", nye: "newyears", newyearseve: "newyears", valentine: "valentines", valentinesday: "valentines", stpatrick: "stpatricks", stpattys: "stpatricks", stpaddys: "stpatricks", stpatricksday: "stpatricks", memorial: "memorialday", july4: "july4th", fourthofjuly: "july4th", "4thofjuly": "july4th", independenceday: "july4th", labor: "laborday", xmas: "christmas", thanksgivingday: "thanksgiving" };
  function holKey(name) { var k = String(name).toLowerCase().replace(/[^a-z0-9]/g, ""); return ALIAS[k] || k; }
  function holWindow(key, now) {
    var h = HOL.filter(function (x) { return x[0] === key; })[0]; if (!h) return null;
    var y = ctParts(now).year;
    for (var yy = y; yy <= y + 1; yy++) { var d = h[2](yy); var end = ctTime(d[0], d[1], d[2] + 1, 0, 0); if (now < end) return { start: end - DAY - 28 * DAY, end: end, date: d }; }
    return null;
  }
  function holVisible(key, now) { var w = holWindow(key, now); return !!w && now >= w.start && now < w.end; }
  function holLabel(key) { var h = HOL.filter(function (x) { return x[0] === key; })[0]; return h ? h[1] : key; }

  /* ---------- clip model ---------- */
  function tagBoard(tag) {
    var t = String(tag || "").toLowerCase().replace(/^#/, "");
    if (!t || t === "1day") return "daily";
    if (t === "evergreen" || t === "beds") return t;
    if (t.indexOf("holiday-") === 0) return "holiday-" + holKey(t.slice(8));
    return "daily";
  }
  function allClips() {
    var out = [];
    docClips.forEach(function (c) { out.push({ id: c.id, kind: "doc", title: c.title, desc: c.desc, outcue: c.outcue, duration: c.duration, src: c.file ? "/" + c.file.replace(/^\//, "") : "", needsRec: !c.file, sourceName: c.source_name || "", source: c.url, tag: c.tag || "", added: c.added }); });
    state.uploads.forEach(function (u) { out.push({ id: u.id, kind: "upload", title: u.title, desc: u.desc, outcue: u.outcue, duration: u.duration, src: u.empty ? "" : "/api/sb/audio/" + u.id + (u.size ? "?v=" + u.size : ""), empty: !!u.empty, source: "", tag: u.board, uploadBoard: u.board, added: u.added }); });
    var now = Date.now();
    return out.map(function (c) {
      var o = state.overrides[c.id] || {};
      ["title", "desc", "outcue"].forEach(function (k) { if (o[k] !== undefined) c[k] = o[k]; });
      c.fav = !!o.fav;
      c.untagged = c.kind === "doc" && !c.tag && !o.board;
      var base = o.board || (c.kind === "upload" ? c.uploadBoard : tagBoard(c.tag));
      c.base = base;
      if (o.gone) { c.board = null; return c; }
      if (o.trashedAt) { var left = o.trashedAt + 7 * DAY - now; c.board = left > 0 ? "trash" : null; c.chip = "Gone in " + rel(left); return c; }
      if (base === "daily") {
        var end = dailyStart(c.added) + DAY;
        if (now < end) { c.board = "daily"; c.chip = "Expires in " + rel(end - now); }
        else if (now < end + 7 * DAY) { c.board = "archive"; c.chip = "Deletes in " + rel(end + 7 * DAY - now); }
        else c.board = null;
      } else c.board = base;
      return c;
    }).filter(function (c) { return c.board; });
  }
  function tabs(clips) {
    var now = Date.now();
    var t = [["daily", "Daily"], ["evergreen", "Evergreen"], ["beds", "Beds"]];
    HOL.forEach(function (h) { if (holVisible(h[0], now)) t.push(["holiday-" + h[0], h[1], 1]); });
    t.push(["archive", "Archive"], ["trash", "🗑 Trash"]);
    return t.map(function (x) { return { id: x[0], label: x[1], hol: !!x[2], n: clips.filter(function (c) { return c.board === x[0]; }).length }; });
  }
  var NOTES = { daily: "Clears 24 hours after 12:01 AM the day after the link was added, then sits in Archive for 7 days.", evergreen: "Never expires.", beds: "Beds and stingers.", archive: "Expired Daily clips. Deleted after 7 days unless you tap Keep → Evergreen.", trash: "Deleted clips stay here 7 days. Restore to put one back." };
  function fmtDur(s) { if (!s && s !== 0) return "–:––"; s = Math.round(s); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }
  function boardOptions(includeDaily) {
    var now = Date.now(), o = [["daily", "Daily (#1day)"], ["evergreen", "Evergreen"], ["beds", "Beds & stingers"]];
    HOL.forEach(function (h) { var w = holWindow(h[0], now); var d = w ? new Date(Date.UTC(w.date[0], w.date[1] - 1, w.date[2])).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : ""; o.push(["holiday-" + h[0], "Holiday – " + h[1].replace(/^\S+\s/, "") + (d ? " (" + d + ")" : "")]); });
    return o;
  }

  /* ---------- render ---------- */
  function render() {
    var clips = allClips(), T = tabs(clips);
    if (!T.some(function (t) { return t.id === tab; })) tab = "daily";
    $("tabs").innerHTML = T.map(function (t) { return '<button type="button" class="tab' + (t.id === tab ? " on" : "") + (t.hol ? " hol" : "") + '" data-tab="' + t.id + '">' + esc(t.label) + '<span class="n">' + t.n + "</span></button>"; }).join("");
    var cur = T.filter(function (t) { return t.id === tab; })[0];
    $("boardtitle").textContent = cur.label.replace(/^🗑 /, "");
    $("boardnote").textContent = NOTES[tab] || (cur.hol ? "Shows 4 weeks before the holiday and hides after it. Clips are kept for next year." : "");
    var favs = clips.filter(function (c) { return c.fav && c.board !== "trash"; });
    $("favwrap").hidden = !favs.length;
    $("favs").innerHTML = favs.map(function (c) { return '<button type="button" class="fav' + (current && current.id === c.id ? " playing" : "") + '" data-play="' + esc(c.id) + '">' + esc(c.title) + "<small>" + esc(fmtDur(c.duration)) + "</small></button>"; }).join("");
    var list = clips.filter(function (c) { return c.board === tab; });
    if (q) { var qq = q.toLowerCase(); list = clips.filter(function (c) { return c.board !== "trash" || tab === "trash"; }).filter(function (c) { return [c.title, c.desc, c.outcue, c.tag, c.board].join(" ").toLowerCase().indexOf(qq) >= 0; }); }
    list.sort(function (a, b) { return (a.needsRec || a.empty ? 1 : 0) - (b.needsRec || b.empty ? 1 : 0) || addedTs(b.added) - addedTs(a.added); });
    window.__pads = list;
    var canEmpty = !q && tab !== "archive" && tab !== "trash";
    $("grid").innerHTML = (canEmpty ? '<button type="button" class="pad addpad" id="addpad" style="align-items:center;justify-content:center;border:2px dashed var(--line);color:var(--mut);font-weight:700;font-size:16px;min-height:120px">+ Empty pad</button>' : "") + (list.length ? list.map(padHtml).join("") : '<div class="empty">' + (q ? "No clips match “" + esc(q) + "”." : tab === "trash" ? "Trash is empty." : "No clips here yet. Drop an MP3/WAV on the board, or tag a link in the Show Ideas doc.") + "</div>");
    preload(list);
  }
  function padHtml(c, i) {
    var chips = '<span class="key">' + (i < 9 ? i + 1 : "") + "</span>";
    if (c.chip && (c.board === "daily" || c.board === "archive" || c.board === "trash")) chips += '<span class="chip exp">⏱ ' + esc(c.chip) + "</span>";
    if (c.empty) chips += '<span class="chip">empty pad</span>';
    if (c.needsRec) chips += '<span class="chip notag" style="background:#e33;color:#fff">Needs live recording</span>';
    if (c.untagged && c.board !== "trash") chips += '<button type="button" class="chip notag" data-pick="' + esc(c.id) + '" title="Tap to pick a board">No tag</button>';
    else if (c.kind === "doc" && c.tag) chips += '<span class="chip">#' + esc(c.tag) + "</span>";
    else if (c.kind === "upload") chips += '<span class="chip">uploaded</span>';
    if (q) chips += '<span class="chip">' + esc(c.board) + "</span>";
    var playing = current && current.id === c.id;
    var acts = c.board === "trash"
      ? '<button type="button" class="keep" data-restore="' + esc(c.id) + '">Restore</button><button type="button" class="ib" data-purge="' + esc(c.id) + '">Delete now</button>'
      : (c.board === "archive" ? '<button type="button" class="keep" data-keep="' + esc(c.id) + '">Keep → Evergreen</button>' : "") +
        (c.empty ? '<label class="ib emptydrop" data-fill="' + esc(c.id) + '" style="flex:1;text-align:center;border:2px dashed var(--or);cursor:pointer">⬆ Drop MP3/WAV or tap<input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" hidden data-fillinput="' + esc(c.id) + '"></label>' : c.needsRec ? '<a class="ib" style="flex:1;text-align:center;text-decoration:none" href="' + esc(c.source) + '" target="_blank" rel="noopener">Open original ↗</a>' : '<button type="button" class="play" data-play="' + esc(c.id) + '">' + (playing ? "■ Stop" : "▶ Play") + '</button><button type="button" class="ib" data-fade="' + esc(c.id) + '">Fade</button>') + '<button type="button" class="ib" data-edit="' + esc(c.id) + '" title="Edit / move">✎</button><button type="button" class="ib" data-trash="' + esc(c.id) + '" title="Delete">🗑</button>';
    return '<div class="pad' + (playing ? " playing" : "") + '" data-id="' + esc(c.id) + '"><div class="top">' + chips + '<button type="button" class="star' + (c.fav ? " on" : "") + '" data-fav="' + esc(c.id) + '" title="Favorite">★</button></div>' +
      (c.empty ? '<input class="padtitle" data-title="' + esc(c.id) + '" value="' + esc(c.title) + '" maxlength="120" aria-label="Pad title" style="background:var(--bg);border:1px solid var(--line);color:var(--tx);border-radius:8px;padding:7px;font:inherit;font-weight:700">' : "<b>" + esc(c.title) + "</b>") + (c.desc ? '<div class="desc">' + esc(c.desc) + "</div>" : "") +
      '<div class="meta">⏱ ' + fmtDur(c.duration) + (c.outcue ? ' · Out: <i>“' + esc(c.outcue) + "”</i>" : "") + "</div>" +
      (c.sourceName ? '<div class="meta">Source: ' + esc(c.sourceName) + '</div>' : "") + (c.source ? '<div class="meta"><a href="' + esc(c.source) + '" target="_blank" rel="noopener">' + esc(host(c.source)) + " ↗</a></div>" : "") +
      '<div class="act">' + acts + "</div></div>";
  }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "source"; } }
  function find(id) { return allClips().filter(function (c) { return c.id === id; })[0]; }

  /* ---------- audio ---------- */
  function audioFor(c) { if (!c.src) return { pause: function () {}, play: function () { return Promise.reject(); } }; var a = audios[c.id]; if (!a) { a = audios[c.id] = new Audio(); a.preload = "auto"; a.src = c.src; a.addEventListener("ended", function () { if (current && current.id === c.id) { current = null; nowUpdate(); render(); } }); } return a; }
  function preload(list) { list.filter(function (c) { return c.src; }).slice(0, 24).forEach(audioFor); }
  function stopAll() { Object.keys(audios).forEach(function (k) { var a = audios[k]; a.pause(); a.currentTime = 0; a.volume = 1; }); current = null; nowUpdate(); render(); }
  function play(id) {
    var c = find(id); if (!c || !c.src) return;
    if (current && current.id === id) { stopAll(); return; }
    stopAll();
    var a = audioFor(c); a.volume = 1; a.currentTime = 0;
    a.play().catch(function () { toast("Couldn't play that clip."); });
    current = c; nowUpdate(); render();
  }
  function fade(id) {
    var c = id ? find(id) : current; if (!c || !current || current.id !== c.id) return;
    var a = audios[c.id], v = a.volume, t = setInterval(function () { v -= 0.08; if (v <= 0) { clearInterval(t); a.pause(); a.currentTime = 0; a.volume = 1; current = null; nowUpdate(); render(); } else a.volume = v; }, 100);
  }
  function nowUpdate() { $("nowt").textContent = current ? "▶ " + current.title : "Nothing playing"; $("nowcue").textContent = current && current.outcue ? "Out: “" + current.outcue + "”" : ""; }
  setInterval(function () { var w = 0; if (current && audios[current.id] && audios[current.id].duration) w = audios[current.id].currentTime / audios[current.id].duration * 100; $("nowbar").style.width = w + "%"; }, 200);

  /* ---------- server ---------- */
  function api(path, opts) { return fetch("/api/sb/" + path, Object.assign({ credentials: "same-origin" }, opts || {})).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); }); }
  function patch(id, body) {
    var o = state.overrides[id] || (state.overrides[id] = {});
    if (body.board) o.board = body.board;
    if (body.trash === true) o.trashedAt = Date.now();
    if (body.trash === false) { delete o.trashedAt; delete o.gone; }
    if (body.fav !== undefined) o.fav = body.fav;
    if (body.purge) { o.gone = true; state.uploads = state.uploads.filter(function (u) { return u.id !== id; }); }
    ["title", "desc", "outcue"].forEach(function (k) { if (body[k] !== undefined) o[k] = body[k]; });
    render();
    return api("clip/" + encodeURIComponent(id), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(function (e) { toast("Didn't save: " + e.message); load(); });
  }
  function toast(msg, undo) {
    var t = $("toast"); t.innerHTML = esc(msg) + (undo ? ' <button type="button" id="undo">UNDO</button>' : ""); t.hidden = false;
    if (undo) $("undo").onclick = function () { t.hidden = true; undo(); };
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 6000);
  }
  function load() {
    return Promise.all([
      fetch("/data/soundboard.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : { clips: [] }; }).catch(function () { return { clips: [] }; }),
      api("state").catch(function () { return { overrides: {}, uploads: [] }; })
    ]).then(function (r) { docClips = (r[0].clips || []).filter(function (c) { return c.file || c.status === "needs_recording"; }); state = r[1]; render(); });
  }

  /* ---------- upload / edit form ---------- */
  var pending = null, editing = null;
  function openForm(file, clip) {
    pending = file; editing = clip || null;
    var f = $("form");
    $("fboard").innerHTML = boardOptions().map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + "</option>"; }).join("");
    $("ftitle").textContent = clip ? "Edit clip" : "Add a clip"; $("fsave").textContent = clip ? "Save" : "Add to board";
    if (clip) { f.title.value = clip.title || ""; f.desc.value = clip.desc || ""; f.outcue.value = clip.outcue || ""; f.board.value = clip.base; $("ffile").textContent = clip.kind === "doc" ? "From the Show Ideas doc. A board picked here wins over the doc tag." : "Uploaded clip"; }
    else {
      f.reset(); $("fboard").innerHTML = boardOptions().map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + "</option>"; }).join("");
      f.board.value = /^holiday-/.test(tab) || ["evergreen", "beds"].indexOf(tab) >= 0 ? tab : "daily";
      f.title.value = file.name.replace(/\.(mp3|wav)$/i, "").replace(/[_-]+/g, " ");
      $("ffile").textContent = "📄 " + file.name + " · " + (file.size / 1048576).toFixed(1) + " MB";
    }
    $("modal").hidden = false; f.title.focus();
  }
  function takeFile(file) {
    if (!file) return;
    if (!/\.(mp3|wav)$/i.test(file.name) && !/audio\/(mpeg|wav|x-wav|mp3)/.test(file.type)) { toast("Only MP3 or WAV files."); return; }
    if (file.size > 5.5 * 1048576) { toast("That file is over 5.5 MB. Export it as an MP3 and try again."); return; }
    openForm(file);
  }
  function duration(file) { return new Promise(function (res) { var a = new Audio(); var u = URL.createObjectURL(file); a.preload = "metadata"; a.onloadedmetadata = function () { res(a.duration); URL.revokeObjectURL(u); }; a.onerror = function () { res(null); }; a.src = u; setTimeout(function () { res(null); }, 5000); }); }
  $("form").addEventListener("submit", function (e) {
    e.preventDefault(); var f = e.target;
    var meta = { title: f.title.value.trim(), desc: f.desc.value.trim(), outcue: f.outcue.value.trim(), board: f.board.value };
    if (editing) {
      var b = { title: meta.title, desc: meta.desc, outcue: meta.outcue }; if (meta.board !== editing.base) b.board = meta.board;
      patch(editing.id, b); $("modal").hidden = true; toast("Saved."); return;
    }
    var file = pending; $("fsave").disabled = true; $("fsave").textContent = "Uploading…";
    duration(file).then(function (d) {
      meta.duration = d ? Math.round(d * 10) / 10 : null; meta.name = file.name;
      return api("upload?meta=" + encodeURIComponent(JSON.stringify(meta)), { method: "POST", headers: { "content-type": file.type || "audio/mpeg" }, body: file });
    }).then(function (r) { state.uploads.push(r.clip); $("modal").hidden = true; tab = r.clip.board; render(); toast("Added “" + r.clip.title + "”."); })
      .catch(function (err) { toast("Upload failed: " + err.message); })
      .then(function () { $("fsave").disabled = false; $("fsave").textContent = "Add to board"; });
  });
  $("fcancel").onclick = function () { $("modal").hidden = true; };
  $("file").addEventListener("change", function (e) { takeFile(e.target.files[0]); e.target.value = ""; });
  ["dragenter", "dragover"].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); $("drop").classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); if (ev === "drop" || e.target === document.documentElement) $("drop").classList.remove("over"); }); });
  document.addEventListener("drop", function (e) {
    if (!(e.dataTransfer && e.dataTransfer.files.length)) return;
    var pad = e.target.closest && e.target.closest(".pad"); var id = pad && pad.dataset.id;
    var u = id && state.uploads.filter(function (x) { return x.id === id && x.empty; })[0];
    if (u) fillPad(id, e.dataTransfer.files[0]); else takeFile(e.dataTransfer.files[0]);
  });

  /* ---------- empty pads ---------- */
  function fillPad(id, file) {
    if (!file) return;
    if (!/\.(mp3|wav)$/i.test(file.name) && !/audio\/(mpeg|wav|x-wav|mp3)/.test(file.type)) { toast("Only MP3 or WAV files."); return; }
    if (file.size > 5.5 * 1048576) { toast("That file is over 5.5 MB. Export it as an MP3 and try again."); return; }
    toast("Uploading " + file.name + "…");
    duration(file).then(function (d) {
      return api("upload?meta=" + encodeURIComponent(JSON.stringify({ fill: id, duration: d ? Math.round(d * 10) / 10 : null, name: file.name })), { method: "POST", headers: { "content-type": file.type || "audio/mpeg" }, body: file });
    }).then(function (r) { state.uploads = state.uploads.map(function (u) { return u.id === id ? r.clip : u; }); delete audios[id]; render(); toast("Audio added to “" + r.clip.title + "”."); })
      .catch(function (e) { toast("Upload failed: " + e.message); });
  }
  function addEmpty() {
    api("empty", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "New pad", board: tab }) })
      .then(function (r) { state.uploads.push(r.clip); render(); var i = document.querySelector('[data-title="' + r.clip.id + '"]'); if (i) { i.focus(); i.select(); } })
      .catch(function (e) { toast("Couldn't add pad: " + e.message); });
  }
  document.addEventListener("change", function (e) { var id = e.target.dataset && e.target.dataset.fillinput; if (id) { fillPad(id, e.target.files[0]); e.target.value = ""; } });
  document.addEventListener("focusout", function (e) { var id = e.target.dataset && e.target.dataset.title; if (id && e.target.classList.contains("padtitle")) { var v = e.target.value.trim() || "New pad"; var u = state.uploads.filter(function (x) { return x.id === id; })[0]; if (u && u.title !== v) { u.title = v; patch(id, { title: v }); } } });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.classList && e.target.classList.contains("padtitle")) e.target.blur(); }, true);

  /* ---------- picker for untagged ---------- */
  var pickId = null;
  function openPicker(id) { pickId = id; $("pickbtns").innerHTML = boardOptions().map(function (o) { return '<button type="button" class="ib" data-board="' + o[0] + '">' + esc(o[1]) + "</button>"; }).join(""); $("picker").hidden = false; }
  $("pickbtns").addEventListener("click", function (e) { var b = e.target.closest("[data-board]"); if (!b) return; patch(pickId, { board: b.dataset.board }); $("picker").hidden = true; toast("Moved."); });
  $("pcancel").onclick = function () { $("picker").hidden = true; };

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return; var d = t.dataset;
    if (t.id === "addpad") { addEmpty(); return; }
    if (d.tab) { tab = d.tab; q = ""; $("q").value = ""; render(); }
    else if (d.play) play(d.play);
    else if (d.fade) fade(d.fade);
    else if (d.fav) { var c = find(d.fav); patch(d.fav, { fav: !c.fav }); }
    else if (d.pick) openPicker(d.pick);
    else if (d.edit) openForm(null, find(d.edit));
    else if (d.keep) { patch(d.keep, { board: "evergreen" }); toast("Moved to Evergreen."); }
    else if (d.restore) { patch(d.restore, { trash: false }); toast("Restored."); }
    else if (d.purge) { if (confirm("Delete this clip for good? This can't be undone.")) patch(d.purge, { purge: true }); }
    else if (d.trash) { var id = d.trash, c2 = find(id); if (current && current.id === id) stopAll(); patch(id, { trash: true }); toast("🗑 “" + c2.title + "” moved to Trash", function () { patch(id, { trash: false }); }); }
  });
  $("stopall").onclick = stopAll; $("nowstop").onclick = stopAll; $("nowfade").onclick = function () { fade(); };
  $("q").addEventListener("input", function (e) { q = e.target.value.trim(); render(); });
  document.addEventListener("keydown", function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { if (e.key === "Escape") e.target.blur(); return; }
    if (e.key === "Escape") { $("modal").hidden = true; $("picker").hidden = true; stopAll(); return; }
    if (/^[1-9]$/.test(e.key) && window.__pads && window.__pads[+e.key - 1] && window.__pads[+e.key - 1].board !== "trash") { e.preventDefault(); play(window.__pads[+e.key - 1].id); }
  });
  setInterval(render, 60000);
  window.__sb = { holVisible: holVisible, dailyStart: dailyStart, tagBoard: tagBoard, holWindow: holWindow };
  load();
})();
