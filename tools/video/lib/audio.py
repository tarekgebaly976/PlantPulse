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
    for attempt in range(3):  # a rare ffmpeg hang is retried rather than blocking the whole run
        try:
            r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *args], capture_output=True, text=True, timeout=120)
        except subprocess.TimeoutExpired:
            continue
        if r.returncode != 0:
            raise RuntimeError(r.stderr[-2000:])
        return r.stderr
    raise RuntimeError("ffmpeg did not finish: " + " ".join(args))


def loudnorm(src: Path, dst: Path, pre: str) -> None:
    """Two-pass EBU R128 loudness normalisation to -16 LUFS, true peak -1.5 dBTP."""
    target = f"loudnorm=I={LUFS}:TP=-1.5:LRA=11"
    log = ffmpeg("-i", str(src), "-af", f"{pre},{target}:print_format=json", "-f", "null", "-")
    try:
        m = json.loads(log[log.rindex("{"): log.rindex("}") + 1])
        if "inf" in str(m["input_i"]):
            raise ValueError
    except (ValueError, KeyError):  # very short clip: one-pass normalisation
        ffmpeg("-i", str(src), "-af", f"{pre},apad=pad_dur=0.2,{target}", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(dst))
        return
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


def voice_part(text: str, dst: Path, own: Path, out: Path, tag: str) -> str:
    """Your recording if present (cleaned), else TTS (re-voiced only when the text changed)."""
    if own.exists():
        loudnorm(own, dst, CLEAN_REC)
        return "recording"
    raw, stamp = out / f"{tag}.tts.wav", out / f"{tag}.tts.txt"
    key = f"{VOICE}|{SPEED}|{text}"
    if not raw.exists() or not stamp.exists() or stamp.read_text() != key:
        tts(text, raw)
        stamp.write_text(key)
    loudnorm(raw, dst, CLEAN_TTS)
    return "tts"


def main(video: str) -> None:
    """Each scene is voiced in parts (one per step or card), so the picture can follow the voice exactly.
    voice/<video>/<scene>.wav replaces the whole scene (its steps are then spread over your recording);
    voice/<video>/<scene>-<n>.wav replaces only part n (1, 2, 3 … in script.md order)."""
    out = ROOT / "out" / video / "audio"
    out.mkdir(parents=True, exist_ok=True)
    scenes = json.loads((ROOT / "out" / video / "narration.json").read_text())
    durations = {}
    for s in scenes:
        sid = s["id"]
        whole = ROOT / "voice" / video / f"{sid}.wav"
        if whole.exists():
            dst = out / f"{sid}.wav"
            loudnorm(whole, dst, CLEAN_REC)
            d = round(duration(dst), 3)
            durations[sid] = {"seconds": d, "source": "recording", "parts": [{"id": sid, "key": "all", "seconds": d}]}
            print(f"{sid}: {d:.1f} s (recording, whole scene)")
            continue
        parts, total, srcs = [], 0.0, set()
        for n, part in enumerate(s["parts"], 1):
            tag = f"{sid}-{n}"
            dst = out / f"{tag}.wav"
            srcs.add(voice_part(part["text"], dst, ROOT / "voice" / video / f"{tag}.wav", out, tag))
            d = round(duration(dst), 3)
            parts.append({"id": tag, "key": part["key"], "seconds": d})
            total += d
        durations[sid] = {"seconds": round(total, 3), "source": "+".join(sorted(srcs)), "parts": parts}
        print(f"{sid}: {total:.1f} s in {len(parts)} part(s) ({'+'.join(sorted(srcs))})")
    (out / "durations.json").write_text(json.dumps(durations, indent=1))
    import shutil
    shutil.copy(make_intro(), out / "00-intro.wav")


# ---------- intro sound (same in every video): pad, heartbeat, chime, click and the name ----------
INTRO_SECONDS = 6.0


def make_intro() -> Path:
    """Synthesised here (no downloaded music): soft pad, a heartbeat as the line passes the spike, a chime when the icon
    appears, a click on the button, and the voice saying the name when it fades in. Times match the intro in stage.html."""
    import numpy as np
    import soundfile as sf

    out = CACHE / f"intro-{VOICE}.wav"
    if out.exists():
        return out
    CACHE.mkdir(exist_ok=True)
    sr = 48000
    n = int(INTRO_SECONDS * sr)
    t = np.arange(n) / sr
    mix = np.zeros(n)

    def env(start, attack, decay):
        e = np.zeros(n)
        i = int(start * sr)
        k = np.arange(n - i) / sr
        e[i:] = np.minimum(1, k / max(attack, 1e-3)) * np.exp(-k / decay)
        return e

    # pad: a calm open chord, slow swell and long fade
    pad = sum(a * np.sin(2 * np.pi * f * t + p) for f, a, p in [(110, .5, 0), (164.81, .35, 1), (220, .3, 2), (277.18, .2, .5), (329.63, .18, 1.5), (220.6, .2, 2.2)])
    swell = np.clip(t / 2.0, 0, 1) * np.clip((INTRO_SECONDS - t) / 1.8, 0, 1)
    mix += 0.10 * pad * swell * (1 + 0.15 * np.sin(2 * np.pi * 0.4 * t))

    def thump(at, gain):
        k = np.maximum(t - at, 0)
        f = 48 + 40 * np.exp(-k / 0.05)  # pitch drop
        ph = 2 * np.pi * np.cumsum(f) / sr
        return gain * np.sin(ph) * (t >= at) * np.exp(-k / 0.13)

    mix += thump(0.70, 0.45) + thump(0.92, 0.32)          # lub-dub as the line passes the spike
    mix += thump(1.55, 0.18) + thump(1.95, 0.12)         # softer, with the two rings
    for f, a in [(880, .30), (1318.5, .18), (1760, .12), (2637, .06)]:  # chime: the icon appears
        mix += a * np.sin(2 * np.pi * f * t) * env(1.20, 0.005, 0.9)
    rng = np.random.default_rng(7)
    click = rng.standard_normal(n) * env(4.40, 0.001, 0.008) * 0.5   # the button click
    mix += click + 0.25 * np.sin(2 * np.pi * 1200 * t) * env(4.40, 0.001, 0.03)

    # the name, spoken as it fades in
    name = CACHE / f"intro-name-{VOICE}.wav"
    tts("PlantPulse.", name)
    v, vsr = sf.read(str(name))
    if v.ndim > 1:
        v = v.mean(axis=1)
    v = np.interp(np.arange(int(len(v) * sr / vsr)) * vsr / sr, np.arange(len(v)), v)
    i = int(2.15 * sr)
    v = v[: n - i]
    mix[i:i + len(v)] += 1.6 * v / (np.abs(v).max() + 1e-9)

    mix /= np.abs(mix).max() + 1e-9
    raw = CACHE / "intro-raw.wav"
    sf.write(str(raw), (0.9 * mix).astype("float32"), sr)
    target = f"loudnorm=I={LUFS}:TP=-1.5:LRA=11"
    ffmpeg("-i", str(raw), "-af", target, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(out))
    return out


if __name__ == "__main__":
    main(sys.argv[1])
