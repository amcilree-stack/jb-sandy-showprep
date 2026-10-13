#!/usr/bin/env python3
"""Print the out cue (last ~6 words, never cutting a word) of an audio file, via faster-whisper."""
import sys
from faster_whisper import WhisperModel
segs, _ = WhisperModel("base.en", device="cpu", compute_type="int8").transcribe(sys.argv[1], vad_filter=True)
words = " ".join(s.text.strip() for s in segs).split()
print(("…" if len(words) > 6 else "") + " ".join(words[-6:]))
