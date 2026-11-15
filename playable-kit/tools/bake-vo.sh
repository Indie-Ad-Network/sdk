#!/bin/sh
# Runs bake-vo.py with the Python that setup-voice.sh made. Run from the ad's folder; arguments as bake-vo.py's.
#   sh <kit>/tools/bake-vo.sh --ref voice.reference.wav [key ...] [--lang es] [--audition 5]
VENV="${PLAYABLE_KIT_VENV:-$HOME/.cache/playable-kit/voice-venv}"
[ -x "$VENV/bin/python" ] || { echo "No voice tools at $VENV: run sh $(dirname "$0")/setup-voice.sh first (or set PLAYABLE_KIT_VENV)."; exit 1; }
exec "$VENV/bin/python" "$(dirname "$0")/bake-vo.py" "$@"
