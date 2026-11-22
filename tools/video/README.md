# PlantPulse videos

Standalone tool that films the real PlantPulse app with Playwright and turns it into narrated training videos.
It does not change any application code, configuration, database schema or migrations.

* 1920x1080, 30 fps, H.264 + AAC; English voice (offline TTS: Kokoro, voice `am_michael`).
* Same look in every video: navy background, teal accent, the app's colour code (red act now, amber attention,
  green all clear, grey information); app screens inside a desktop window or a phone, a caption per step,
  a highlight on the clicked element, smooth transitions, and a "Demo data" label on every app screen.
* Only the local DEMO organization and its training accounts (`@demo.example.com`). Never a real system.
* Screens that show a real company or person name from the sample data (equipment makers, lubricants, …) stop the
  capture (`BLOCKLIST` in `lib/capture.js`; more names in a local file named by `VIDEO_BLOCKLIST_FILE`).

## Layout

| Path | What |
|---|---|
| `videos/<video>/video.js` | scenes: narration, layout, captions, and the Playwright steps that film the app |
| `videos/<video>/script.md` | the script for review (generated from `video.js`) |
| `videos/index.md` | every rendered file, its length and what it covers |
| `voice/<video>/<scene>.wav` | your own recording for a scene; replaces the TTS voice (see `voice/README.md`) |
| `lib/capture.js` | filming: screenshots + element boxes per step |
| `lib/audio.py` | voice per scene: TTS or your recording, cleaned and normalised to -16 LUFS |
| `lib/stage.html`, `lib/render.js` | compositor and encoder |
| `scripts/reset-demo.sh` | puts the local demo database back to its seeded state before each capture |
| `out/` (git-ignored) | captures, audio, key frames and the MP4 files |

## Run (local container only)

```bash
# once: local PostgreSQL + backend venv + frontend build as in docs/TESTING.md, with CMMS_OPERATIONS_MODULE=true;
# demo data: seed-demo --profile general, demo-operations, demo-rca, demo-kpi-targets (your own LOCAL CMMS_DEMO_PASSWORD)
# videos 16-18 (skill matrix, maintenance schedule, cutting plan) need the app with those features (branch claude/skill-matrix);
# the demo's schedule work is for next week, so film from the week the demo was seeded
tools/video/scripts/reset-demo.sh --save                      # snapshot of the fresh demo, used before every capture
uv venv tools/video/.venv -p 3.12 && uv pip install -p tools/video/.venv -r tools/video/requirements.txt
# each video
export CMMS_DEMO_PASSWORD=...                                  # the local demo password (never a live one)
node tools/video/bin/video.js overview script                  # script.md for review
node tools/video/bin/video.js overview capture                 # film the app (resets the demo first)
node tools/video/bin/video.js overview audio                   # voice (downloads the TTS model once into cache/)
node tools/video/bin/video.js overview frames                  # key frames -> out/overview/keyframes
node tools/video/bin/video.js overview render                  # out/01-plantpulse-overview.mp4 + videos/index.md
```
Needs Node with Playwright (`require("playwright")`), ffmpeg, Python 3.12 and the app running on
`http://localhost:3000` (`VIDEO_BASE_URL` to change). Scene lengths follow the voice, so a new recording or a
changed sentence re-times the video by itself.
