#!/bin/sh
# Sets up the voice tools, once: a Python environment with Chatterbox (the voice) and Whisper (which hears
# each take back to check its words). Everything runs on this computer; nothing is sent anywhere.
#   sh tools/setup-voice.sh [where]        default: ~/.cache/playable-kit/voice-venv   (about 2 GB)
# The models themselves (several GB more) are downloaded from Hugging Face the first time a line is baked.
# Wants Python 3.10 or later, ffmpeg and Node 22. Best on Apple silicon or a CUDA graphics card; a CPU works, slowly.
set -e
VENV="${1:-${PLAYABLE_KIT_VENV:-$HOME/.cache/playable-kit/voice-venv}}"
PY="${PYTHON:-python3}"
for tool in "$PY" ffmpeg ffprobe node; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing: $tool. Install it first (macOS: brew install python ffmpeg node)."; exit 1; }
done
"$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' || { echo "Python 3.10 or later is needed (PYTHON=/path/to/python3 to choose one)."; exit 1; }
node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' || { echo "Node 22 or later is needed."; exit 1; }
echo "Setting up $VENV"
"$PY" -m venv "$VENV"
"$VENV/bin/python" -m pip install --upgrade pip >/dev/null
"$VENV/bin/python" -m pip install torch torchaudio chatterbox-tts transformers librosa soundfile scipy
"$VENV/bin/python" -c 'import chatterbox, transformers, librosa, soundfile, torch; print("ready: torch", torch.__version__, "on", "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")'
echo
echo "Next: record a voice sample (node tools/record-voice.mjs), then bake the lines from your ad's folder:"
echo "  sh $(cd "$(dirname "$0")" && pwd)/bake-vo.sh --ref voice.reference.wav"
