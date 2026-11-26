#!/usr/bin/env python3
"""Iris STT sidecar — free local speech-to-text for voice replies.

The Node backend is stdlib-only and cannot run Whisper in-process, so this
small persistent process owns the model: faster-whisper `tiny` (int8, CPU),
loaded once at startup, then served over plain HTTP on localhost.

  POST /transcribe  {"audio": "<base64 PCM s16le 16kHz mono>", "language": "id"|"en"}
                    -> {"transcript": "...", "language": "id", "durationSec": 4.2,
                        "transcribeMs": 812}
  GET  /health      -> {"ok": true, "model": "tiny", "loaded": true}

Audio is fed to faster-whisper as a float32 numpy array, NEVER as a file
path: faster-whisper 1.2.1 + PyAV 19.0.2 breaks on av.open() with a path
(`metadata_errors` kwarg rejected). The float32-array path is the one
measured in VOICE-REPLY-RESEARCH.md (RTF ~0.17 on this VM).

Start it with ./start-stt-sidecar.sh (sets the PYTHONPATH quirk: this VM's
exec runs as root, so the user-site packages under
/home/hatch/.local/lib/python3.12/site-packages are not on sys.path by
default). No API keys, no network calls after the first model download
(model cache: ~/.cache/huggingface, ~75 MB).
"""

import base64
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL_NAME = os.environ.get("STT_MODEL", "tiny")
PORT = int(os.environ.get("STT_PORT", "8791"))
MAX_PCM_BYTES = 10 * 1024 * 1024  # ~5 min of 16 kHz s16le mono; sanity cap only

_model = None
_model_load_ms = None


def get_model():
    global _model, _model_load_ms
    if _model is None:
        from faster_whisper import WhisperModel

        t0 = time.monotonic()
        _model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
        _model_load_ms = int((time.monotonic() - t0) * 1000)
        print(f"[stt-sidecar] model {MODEL_NAME} loaded in {_model_load_ms} ms",
              flush=True)
    return _model


def transcribe_pcm(pcm_bytes: bytes, language: str) -> dict:
    import numpy as np

    if len(pcm_bytes) % 2 != 0:
        raise ValueError("pcm length must be even (s16le samples)")
    audio = (
        np.frombuffer(pcm_bytes, dtype=np.int16)
        .astype(np.float32) / 32768.0
    )
    duration_sec = len(audio) / 16000.0
    model = get_model()
    t0 = time.monotonic()
    segments, _info = model.transcribe(
        audio, language=language, beam_size=1
    )
    text = "".join(s.text for s in segments).strip()
    return {
        "transcript": text,
        "language": language,
        "durationSec": round(duration_sec, 2),
        "transcribeMs": int((time.monotonic() - t0) * 1000),
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # keep stdout clean; errors are printed explicitly

    def _json(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {
                "ok": True,
                "model": MODEL_NAME,
                "loaded": _model is not None,
                "loadMs": _model_load_ms,
            })
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/transcribe":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            return self._json(400, {"error": "bad content-length"})
        if length <= 0 or length > MAX_PCM_BYTES * 2:
            return self._json(413, {"error": "body too large"})
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return self._json(400, {"error": "invalid json"})
        audio_b64 = body.get("audio")
        language = body.get("language") or "en"
        if language not in ("id", "en"):
            return self._json(400, {"error": "language must be 'id' or 'en'"})
        if not isinstance(audio_b64, str) or not audio_b64:
            return self._json(400, {"error": "no audio captured"})
        try:
            pcm = base64.b64decode(audio_b64, validate=True)
        except Exception:
            return self._json(400, {"error": "audio is not valid base64"})
        if not pcm:
            return self._json(400, {"error": "no audio captured"})
        if len(pcm) > MAX_PCM_BYTES:
            return self._json(413, {"error": "audio too long"})
        try:
            result = transcribe_pcm(pcm, language)
        except Exception as e:
            print(f"[stt-sidecar] transcribe failed: {e}", file=sys.stderr,
                  flush=True)
            return self._json(500, {"error": f"transcription failed: {e}"})
        if not result["transcript"]:
            return self._json(422, {"error": "no speech detected in the recording"})
        return self._json(200, result)


if __name__ == "__main__":
    # Warm the model now so the first real request is fast, not 3 s in.
    get_model()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"[stt-sidecar] listening on http://127.0.0.1:{PORT} "
          f"(model {MODEL_NAME})", flush=True)
    server.serve_forever()
