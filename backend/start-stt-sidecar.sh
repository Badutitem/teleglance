#!/bin/sh
# Start the Iris STT sidecar (free local Whisper).
# Quirk: exec on this VM runs as root, so the user-site packages
# (faster-whisper lives in /home/hatch/.local/lib/python3.12/site-packages)
# are NOT on sys.path by default — PYTHONPATH is mandatory here, same as
# the kaggle CLI quirk.
#   ./start-stt-sidecar.sh            # port 8791 (default)
#   STT_PORT=8792 ./start-stt-sidecar.sh
# Health check: curl http://127.0.0.1:8791/health
set -eu
cd "$(dirname "$0")"
export PYTHONPATH=/home/hatch/.local/lib/python3.12/site-packages
exec python3 stt-sidecar.py
