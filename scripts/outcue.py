#!/usr/bin/env python3
"""Transcribe an audio file with word timing (faster-whisper). Prints JSON:
{outcue, incue, first_start, last_end, duration, head_ok, tail_ok, text}. The out cue is the last ~6 whole words."""
import sys, json, subprocess
from faster_whisper import WhisperModel
f = sys.argv[1]
dur = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f],capture_output=True,text=True).stdout or 0)
segs, _ = WhisperModel("small.en", device="cpu", compute_type="float32").transcribe(f, language="en", beam_size=5, word_timestamps=True)  # int8 gives garbage on this box
words = [w for s in segs for w in (s.words or [])]
if not words:
    print(json.dumps({"outcue": None, "incue": None, "duration": dur, "head_ok": True, "tail_ok": True, "text": ""})); sys.exit()
toks = [w.word.strip() for w in words]
out = {"outcue": ("…" if len(toks) > 6 else "") + " ".join(toks[-6:]), "incue": " ".join(toks[:5]) + ("…" if len(toks) > 5 else ""),
       "first_start": round(float(words[0].start), 2), "last_end": round(float(words[-1].end), 2), "duration": round(dur, 2),
       "text": " ".join(toks)}
# a word that starts at 0.00 or ends at the very end of the file may be cut off
out["head_ok"] = bool(float(words[0].start) >= 0.05)
out["tail_ok"] = bool(float(words[-1].end) <= dur - 0.05)
print(json.dumps(out))
