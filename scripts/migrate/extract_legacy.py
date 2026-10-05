#!/usr/bin/env python3
"""One-time migration: pull every card out of the old single-page index.html
into data/legacy.json so nothing is lost when the front page is rebuilt.
Usage: python3 scripts/migrate/extract_legacy.py <old-index.html> <out.json>
"""
import json, re, sys, hashlib
from bs4 import BeautifulSoup, NavigableString

YEAR = 2026
MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
PANELS = {
    "today": "Today page (Oct 4)", "new": "New Stuff", "jobs": "Jobs log",
    "audio": "Audio & video links", "local": "Local Austin & Texas", "caller": "Bits & phones",
    "records": "Book of Records", "personal": "Personal / cast", "scams": "Scams & warnings",
    "music": "Music", "kvet": "KVET / show bits", "sept11": "Sept 11", "m2w": "Minute To Win It",
    "grok": "Grok finds", "farmed": "Farmed from others", "emergency": "Emergency list",
    "lastlaugh": "Last Laugh",
}
KEEP_TAGS = {"a", "strong", "em", "b", "i", "ul", "ol", "li", "p", "br"}


def parse_date(text):
    m = re.search(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b", text or "")
    if not m:
        return None
    mon = MONTHS[m.group(1)[:3].lower()]
    return f"{YEAR}-{mon:02d}-{int(m.group(2)):02d}"


def clean_html(node):
    """Keep simple inline markup and links; drop buttons, styles, handlers."""
    for b in node.find_all(["button", "script", "style"]):
        b.decompose()
    for s in node.find_all("span", class_=["copy-icon", "added", "added-date"]):
        s.decompose()
    for tag in node.find_all(True):
        if tag.name not in KEEP_TAGS:
            tag.unwrap()
            continue
        href = tag.get("href") if tag.name == "a" else None
        tag.attrs = {}
        if tag.name == "a":
            if not href or href == "#":
                tag.unwrap()
                continue
            tag["href"] = href
            if href.startswith("http"):
                tag["rel"] = "noopener"
                tag["target"] = "_blank"
    html = node.decode_contents() if hasattr(node, "decode_contents") else str(node)
    html = html.replace("📋", "")
    return re.sub(r"\s+", " ", html).strip()


def item_record(el, panel):
    date_txt = " ".join(x.get_text(" ", strip=True) for x in el.select(".added, .added-date"))
    title_el = el.find(["h3", "strong"])
    title = ""
    if title_el:
        t = BeautifulSoup(str(title_el), "html.parser")
        for s in t.select(".added, .added-date, .copy-icon"):
            s.decompose()
        title = t.get_text(" ", strip=True).replace("📋", "").strip()
    body = BeautifulSoup(str(el), "html.parser")
    root = body.find()
    first = root.find(["h3", "strong"])
    if first:
        first.decompose()
    html = clean_html(root)
    # unwrap the outer div
    html = re.sub(r"^<div[^>]*>|</div>$", "", html).strip()
    kind = "added"
    if re.match(r"\s*(Archived|Moved)", date_txt or ""):
        kind = "archived" if date_txt.strip().startswith("Archived") else "moved"
    rec = {
        "date_kind": kind if date_txt else None,
        "panel": panel,
        "category": PANELS.get(panel, panel),
        "title": title,
        "date": parse_date(date_txt),
        "date_note": date_txt or None,
        "html": html,
        "in_old_archive_bin": bool(el.find_parent("details")) or bool(el.find_parent(id=re.compile("archive"))),
    }
    rec["id"] = hashlib.sha1((panel + title + html).encode()).hexdigest()[:10]
    return rec


def main(src, out):
    soup = BeautifulSoup(open(src, encoding="utf-8").read(), "html.parser")
    recs = []
    for panel in soup.select("div.panel"):
        pid = panel.get("id", "").replace("panel-", "")
        if pid == "emergency":
            for li in panel.select("ol > li"):
                a = li.find("a")
                recs.append({"panel": pid, "category": PANELS[pid], "title": a.get_text(strip=True) if a else "",
                             "date": "2026-09-04", "date_note": "Emergency list updated Fri Sep 4",
                             "html": re.sub(r"Open this on the site →", "", li.get_text(" ", strip=True)).split("—", 1)[-1].strip(),
                             "in_old_archive_bin": False,
                             "id": hashlib.sha1(li.get_text().encode()).hexdigest()[:10]})
            continue
        if pid == "jobs":
            for row in panel.select(".job-row"):
                txt = row.get_text(" ", strip=True).lstrip("✓ ").strip()
                recs.append({"panel": pid, "category": PANELS[pid], "title": txt.split(" — ")[-1].split("  ")[0][:90],
                             "date": parse_date(txt), "date_note": None, "html": txt,
                             "in_old_archive_bin": False, "id": hashlib.sha1(txt.encode()).hexdigest()[:10]})
            continue
        if pid == "today":
            for box in panel.select(".today-box.news li"):
                strong = box.find("strong")
                title = strong.get_text(strip=True).rstrip(".:") if strong else box.get_text()[:60]
                if strong:
                    strong.decompose()
                recs.append({"panel": pid, "category": PANELS[pid], "title": title, "date": "2026-10-04",
                             "date_note": "Today page, Sun Oct 4", "html": clean_html(box),
                             "in_old_archive_bin": False, "id": hashlib.sha1(str(box).encode()).hexdigest()[:10]})
            hb = panel.select_one(".horns-box")
            if hb:
                recs.append({"panel": pid, "category": PANELS[pid], "title": "Next Longhorns game (as of Oct 4)",
                             "date": "2026-10-04", "date_note": None, "html": clean_html(hb),
                             "in_old_archive_bin": False, "id": "horns-1004"})
            continue
        for el in panel.select(".item"):
            if el.find_parent(class_="item"):
                continue
            # the old farmed panel was never closed, so Last Laugh nests inside it
            if el.find_parent("div", class_="panel") is not panel:
                continue
            if "howto-box" in (el.get("class") or []):
                continue
            r = item_record(el, pid)
            if r["title"] or r["html"]:
                if not r["date"] and pid in ("grok", "farmed"):
                    r["date"] = "2026-10-04"
                    r["date_note"] = "Refreshed Sun Oct 4"
                recs.append(r)
    json.dump({"source": "index.html @ " + (sys.argv[3] if len(sys.argv) > 3 else "main"),
               "items": recs}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(recs), "items")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
