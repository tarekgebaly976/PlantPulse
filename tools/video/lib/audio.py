"""Voice for each scene of a video, all processed the same way.

  voice/<video>/<scene>.wav present  -> your recording: high-pass, noise reduction, silences trimmed, -16 LUFS
  otherwise                          -> offline TTS (Kokoro, calm male voice): silences trimmed, -16 LUFS

Output: out/<video>/audio/<scene>.wav (48 kHz mono) and out/<video>/audio/durations.json.
Usage: python lib/audio.py <video>          (reads out/<video>/narration.json written by `video.js <video> script`)
Env: VIDEO_VOICE (default am_michael), VIDEO_SPEED (default 0.94)."""

import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
MODEL, VOICES = CACHE / "kokoro-v1.0.onnx", CACHE / "voices-v1.0.bin"
VOICE = os.environ.get("VIDEO_VOICE", "am_michael")
SPEED = float(os.environ.get("VIDEO_SPEED", "0.94"))
LUFS = -16.0

# How the TTS should say some words (the text on screen is not changed).
SAY = [
    (r"\bLOTO\b", "low-toe"),
    (r"\bKPIs\b", "K P eyes"),
    (r"\bKPI\b", "K P I"),
    (r"\bPlantPulse\b", "Plant Pulse"),
    (r"\bQR\b", "Q R"),
    (r"\bPM\b", "P M"),
    (r"\bRCA\b", "R C A"),
    (r"\bWO\b", "work order"),
]

# Recordings: remove rumble, reduce steady noise, trim silence at both ends (keep 0.15 s), then loudness.
CLEAN_REC = ("highpass=f=80,afftdn=nf=-25,"
             "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,"
             "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25,areverse")
CLEAN_TTS = ("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1,"
             "areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.2,areverse")


def ffmpeg(*args: str) -> str:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-2000:])
    return r.stderr


def loudnorm(src: Path, dst: Path, pre: str) -> None:
    """Two-pass EBU R128 loudness normalisation to -16 LUFS, true peak -1.5 dBTP."""
    target = f"loudnorm=I={LUFS}:TP=-1.5:LRA=11"
    log = ffmpeg("-i", str(src), "-af", f"{pre},{target}:print_format=json", "-f", "null", "-")
    m = json.loads(log[log.rindex("{"): log.rindex("}") + 1])
    second = (f"{target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
              f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    ffmpeg("-i", str(src), "-af", f"{pre},{second}", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(dst))


def duration(p: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def ensure_model() -> None:
    CACHE.mkdir(exist_ok=True)
    for f in (MODEL, VOICES):
        if not f.exists():
            print("downloading", f.name)
            urllib.request.urlretrieve(MODEL_URL + f.name, f)


_tts = None


def tts(text: str, out: Path) -> None:
    global _tts
    import soundfile as sf
    from kokoro_onnx import Kokoro

    if _tts is None:
        ensure_model()
        _tts = Kokoro(str(MODEL), str(VOICES))
    for pat, rep in SAY:
        text = re.sub(pat, rep, text)
    samples, sr = _tts.create(text, voice=VOICE, speed=SPEED, lang="en-us")
    sf.write(str(out), samples, sr)


def main(video: str) -> None:
    out = ROOT / "out" / video / "audio"
    out.mkdir(parents=True, exist_ok=True)
    scenes = json.loads((ROOT / "out" / video / "narration.json").read_text())
    durations = {}
    for s in scenes:
        sid, dst = s["id"], out / f"{s['id']}.wav"
        own = ROOT / "voice" / video / f"{sid}.wav"
        if own.exists():
            loudnorm(own, dst, CLEAN_REC)
            src = "recording"
        else:
            raw = out / f"{sid}.tts.wav"
            stamp = out / f"{sid}.tts.txt"
            key = f"{VOICE}|{SPEED}|{s['text']}"
            if not raw.exists() or not stamp.exists() or stamp.read_text() != key:  # only re-voice changed text
                tts(s["text"], raw)
                stamp.write_text(key)
            loudnorm(raw, dst, CLEAN_TTS)
            src = "tts"
        durations[sid] = {"seconds": round(duration(dst), 3), "source": src}
        print(f"{sid}: {durations[sid]['seconds']:.1f} s ({src})")
    (out / "durations.json").write_text(json.dumps(durations, indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
