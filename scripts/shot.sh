#!/usr/bin/env bash
# Screenshot the landing page and the app with headless Chromium.
#
#   scripts/shot.sh landing            # -> docs/assets/landing-desktop.png + -mobile.png
#   scripts/shot.sh app                # -> docs/assets/app-desktop.png   + -mobile.png
#
# Look at the shots before committing them: a page that renders wrong is worse
# than no screenshot. The app shot opens on a demo scene, because a board shot
# of an empty canvas sells nothing, so the app shot opens on the lesson scene,
# on the dark board the app is designed around.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KIND="${1:-landing}"

case "$KIND" in
  app)     PAGE="$ROOT/docs/play/index.html"; QUERY="?demo=lesson&theme=dark"; NAME="app" ;;
  landing) PAGE="$ROOT/docs/index.html";      QUERY="";            NAME="landing" ;;
  *) echo "usage: shot.sh [landing|app]" >&2; exit 1 ;;
esac

[ -f "$PAGE" ] || { echo "no page at $PAGE" >&2; exit 1; }
mkdir -p "$ROOT/docs/assets"

CHROME="$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)"
[ -n "$CHROME" ] || { echo "no chromium on PATH" >&2; exit 1; }

shot () { # width, height, outfile
  "$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$1,$2" \
    --screenshot="$3" "file://$PAGE$QUERY" >/dev/null 2>&1
  echo "wrote ${3#$ROOT/} ($(stat -c%s "$3") bytes)"
}

shot 1280 1750 "$ROOT/docs/assets/${NAME}-desktop.png"
shot 430  1400 "$ROOT/docs/assets/${NAME}-mobile.png"
