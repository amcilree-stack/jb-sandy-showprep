#!/usr/bin/env python3
"""Serve the repo locally and save full-page screenshots (desktop + mobile) with headless Chrome over CDP.
Usage: python3 scripts/preview.py [outdir]   (needs google-chrome/chromium and `pip install websocket-client`)"""
import base64, json, os, shutil, subprocess, sys, tempfile, threading, time, urllib.request, functools, http.server, socketserver
from websocket import create_connection

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ROOT)
PORT, DBG = 8765, 9339
PAGES = [("", "index"), ("archive/", "archive")]
VIEWS = [("desktop", 1280, 900, 1, False), ("mobile", 390, 844, 2, True)]

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=httpd.serve_forever, daemon=True).start()

chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
prof = tempfile.mkdtemp(prefix="preview-chrome-")
proc = subprocess.Popen([chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", f"--user-data-dir={prof}",
                         f"--remote-debugging-port={DBG}", "--remote-allow-origins=*", "about:blank"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{DBG}/json")); break
        except Exception: time.sleep(0.2)
    ws_url = [t for t in tabs if t.get("type") == "page"][0]["webSocketDebuggerUrl"]
    ws = create_connection(ws_url, timeout=60, suppress_origin=True)
    n = [0]
    def cdp(method, **params):
        n[0] += 1; ws.send(json.dumps({"id": n[0], "method": method, "params": params}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id") == n[0]:
                if "error" in m: raise RuntimeError(m["error"])
                return m.get("result", {})
    cdp("Page.enable"); cdp("Runtime.enable")
    for scheme in ("light", "dark"):
        for name, w, h, scale, mobile in VIEWS:
            if scheme == "dark" and name == "desktop": pass
            cdp("Emulation.setEmulatedMedia", features=[{"name": "prefers-color-scheme", "value": scheme}])
            cdp("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=scale if scheme == "light" else 2, mobile=mobile)
            for path, label in PAGES:
                if scheme == "dark" and label != "index": continue
                cdp("Page.navigate", url=f"http://127.0.0.1:{PORT}/{path}")
                time.sleep(2.0)
                height = cdp("Runtime.evaluate", expression="Math.ceil(document.documentElement.scrollHeight)", returnByValue=True)["result"]["value"]
                shot = cdp("Page.captureScreenshot", format="png", captureBeyondViewport=True,
                           clip={"x": 0, "y": 0, "width": w, "height": height, "scale": 1})
                suffix = "" if scheme == "light" else "-dark"
                fn = os.path.join(OUT, f"preview-{label}-{name}{suffix}.png")
                open(fn, "wb").write(base64.b64decode(shot["data"]))
                print(fn, f"{w}x{height}")
finally:
    proc.terminate(); httpd.shutdown(); shutil.rmtree(prof, ignore_errors=True)
