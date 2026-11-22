#!/usr/bin/env bash
# Voice and render every video, then commit and push the scripts and videos/index.md (MP4s stay in out/, git-ignored).
#   tools/video/scripts/build-all.sh [video ...]      (default: all, in series order)
set -uo pipefail
cd "$(dirname "$0")/../../.."
VIDEOS=${*:-"overview work-orders technicians pm lubrication pdm shutdowns rca assets inventory shifts kpis admin production pdca skills schedule cutting"}
for v in $VIDEOS; do
  echo "== $v"; node tools/video/bin/video.js "$v" audio >/dev/null 2>&1 || { echo "audio failed: $v"; continue; }
  node tools/video/bin/video.js "$v" render 2>&1 | grep -E "^video:|Error" || echo "render failed: $v"
done
git add tools/video && git commit -qm "Videos: rendered series, index updated" && git push -q origin claude/plantpulse-videos
echo "== done"
