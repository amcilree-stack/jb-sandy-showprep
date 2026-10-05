#!/usr/bin/env python3
"""One-time: build data/audio.json from audio/ (moved from edited-audio/) + the Ideas-doc clips made Oct 4."""
import json, os, re, subprocess, hashlib
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
os.chdir(ROOT)

def dur(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout.strip()
    return round(float(out), 1) if out else None

def md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()

lib = {c["src"].replace("edited-audio/", "audio/"): c["name"] for c in json.load(open("hotkeys/library.json"))["clips"]}
board = json.load(open("hotkeys/board.json"))
on_board = {p["src"].replace("edited-audio/", "audio/") for f in board["folders"] for pg in f["pages"] for p in pg["pads"] if p.get("src")}

def category(name):
    n = name.lower()
    if "sept-11" in n or "sept 11" in n: return ("Sept 11", "Sept 11 has passed")
    if "dolly" in n or "iheart tribute" in n: return ("Dolly tribute", None)
    if "longhorns" in n or "sark" in n: return ("Longhorns", None)
    if "batfest" in n or "bats" in n: return ("Bat Fest", "Bat Fest was Sep 5")
    if n.startswith("audio/bed-"): return ("Music beds", None)
    return ("Drops & bits", None)

IDEA_CLIPS = [
    {"id": "someday-video-calls", "idea_id": "someday-video-calls-in-our-pocket", "title": "Someday video calls in our pocket",
     "desc": "10-second skit: people scoff at the idea of carrying phones and video-calling. “Why would anyone want to do that?”",
     "source": "https://www.facebook.com/share/r/19ZNcwauE3/", "source_label": "Facebook reel (Tox Free Doc)",
     "file": "audio/someday-video-calls.mp3", "status": "ok"},
    {"id": "drew-lynch-euro-cobblestones", "idea_id": "drew-lynch-vs-europe-s-cobblestones", "title": "Drew Lynch vs. Europe’s cobblestones",
     "desc": "Comedian Drew Lynch rants about hauling a suitcase up cobblestone hills in Europe, ending with “but hey, they make the bread fresh.”",
     "source": "https://www.instagram.com/p/Dc18EcXqKpV/", "source_label": "Instagram (@thedrewlynch)",
     "file": "audio/drew-lynch-euro-cobblestones.mp3", "status": "ok"},
    {"id": "jeep-people", "idea_id": "jeep-people-audio-description", "title": "Jeep people audio description",
     "desc": "Facebook reel about Jeep people. The audio couldn’t be pulled (Facebook blocked it), so open the original.",
     "source": "https://www.facebook.com/share/r/1bEQs9fgLo/", "source_label": "Facebook reel", "file": None, "status": "failed",
     "error": "yt-dlp: [facebook] Cannot parse data"},
    {"id": "pickleball-decline", "idea_id": "pickleball-on-the-decline", "title": "Pickleball on the decline",
     "desc": "Instagram post about pickleball’s decline. It’s a photo post with no video, so there’s no audio to pull.",
     "source": "https://www.instagram.com/p/DdJ0T96GcE_/", "source_label": "Instagram post", "file": None, "status": "failed",
     "error": "yt-dlp: No video formats found (image carousel)"},
    {"id": "texas-ohio-state-ratings", "idea_id": "texas-ohio-state-was-the-most-watched-regular-season-game-in", "title": "Texas–Ohio State ratings post",
     "desc": "Instagram post saying Texas–Ohio State drew the biggest regular-season audience in 10 years. It’s a photo post with no video.",
     "source": "https://www.instagram.com/p/DdU85pfF93V/", "source_label": "Instagram post", "file": None, "status": "failed",
     "error": "yt-dlp: No video formats found (image carousel)", "stale": "Texas–Ohio State game (Aug 29) is long past"},
]
clips = []
for c in IDEA_CLIPS:
    c = dict(c, origin="ideas-doc", added="2026-10-04")
    if c["file"]:
        c["duration"] = dur(c["file"]); c["md5"] = md5(c["file"])
    clips.append(c)

idea_files = {c["file"] for c in clips if c["file"]}
for d in ["audio", "audio/archive"]:
    for fn in sorted(os.listdir(d)):
        p = f"{d}/{fn}"
        if not fn.lower().endswith(".mp3") or p in idea_files:
            continue
        name = lib.get(p) or re.sub(r"[_-]+", " ", fn[:-4]).strip()
        cat, stale = category(p)
        rec = {"id": re.sub(r"[^a-z0-9]+", "-", fn[:-4].lower()).strip("-"), "title": name, "file": p, "origin": "library",
               "category": cat, "duration": dur(p), "md5": md5(p), "on_board": p in on_board and not stale, "status": "ok"}
        if stale: rec["stale"] = stale
        clips.append(rec)
json.dump({"note": "Every playable file lives once under audio/. origin=ideas-doc clips come from Show Ideas doc links; origin=library is the old edited-audio set.",
           "clips": clips}, open("data/audio.json", "w"), ensure_ascii=False, indent=1)
print(len(clips), "clips;", sum(1 for c in clips if c.get("on_board")), "on board")
