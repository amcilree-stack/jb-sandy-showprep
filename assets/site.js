/* Big play/stop buttons. One clip at a time; nothing autoplays; audio uses preload="none". */
(function () {
  var current = null;
  function reset(btn) {
    btn.classList.remove("on");
    btn.setAttribute("aria-label", "Play " + (btn.getAttribute("data-title") || "clip"));
  }
  function stop(btn) {
    var a = btn && btn.parentNode.querySelector("audio");
    if (a) { a.pause(); try { a.currentTime = 0; } catch (e) {} }
    if (btn) reset(btn);
    if (current === btn) current = null;
  }
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest && ev.target.closest("button.play");
    if (!btn) return;
    if (btn.classList.contains("on")) { stop(btn); return; }
    if (current) stop(current);
    var a = btn.parentNode.querySelector("audio");
    if (!a) return;
    if (!a.dataset.bound) {
      a.dataset.bound = "1";
      a.addEventListener("ended", function () { stop(btn); });
      a.addEventListener("error", function () { stop(btn); btn.title = "Could not load this file"; });
    }
    btn.classList.add("on");
    btn.setAttribute("aria-label", "Stop " + (btn.getAttribute("data-title") || "clip"));
    current = btn;
    var p = a.play();
    if (p && p.catch) p.catch(function () { stop(btn); });
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && current) stop(current);
  });
})();
