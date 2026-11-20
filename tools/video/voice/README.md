# Your own voice

Put a recording at `voice/<video>/<scene>.wav` and it replaces the TTS voice for that scene, e.g.
`voice/overview/08-safety.wav`. Scene ids and their sentences are in `videos/<video>/script.md`.

Any sample rate, mono or stereo. Each recording is cleaned the same way before use: rumble removed (high-pass 80 Hz),
steady background noise reduced, silence trimmed at the start and end, loudness set to -16 LUFS (true peak -1.5 dB).
The scene then lasts as long as your recording (plus a short pause), so you do not need to match the TTS timing.
Then run `node tools/video/bin/video.js <video> audio` and `... render`.
