"""Mock AIgent Squad — OpenAI-compatible endpoint for the Task 1.5 spike.

Purpose: verify that grafana-llm-app, configured with a custom OpenAI base URL,
(a) forwards requests to THIS server (not api.openai.com),
(b) sends `Authorization: Bearer <token>`,
(c) proxies a streaming SSE response — including a simulated agentic tool-call pause.

Stdlib only (runs in python:3.11-slim, no pip install). Logs every request's method,
path, and Authorization header to stdout so `docker logs` proves what the LLM app sent.
"""
from __future__ import annotations

import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Simulated agentic tool-call pause (seconds) — mimics AIgent Squad running a tool
# (Loki/PromQL/k8s) mid-stream. The harness flagged this as the key risk for Option A:
# does the LLM app proxy keep the SSE connection open across a long content-less gap?
TOOL_CALL_PAUSE_SECONDS = 8


def _log(handler: BaseHTTPRequestHandler, note: str = "") -> None:
    auth = handler.headers.get("Authorization", "<none>")
    print(f"[mock-aigent] {handler.command} {handler.path} auth={auth} {note}", flush=True)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 (stdlib naming)
        _log(self)
        if self.path.rstrip("/").endswith("/models"):
            body = json.dumps(
                {"object": "list", "data": [{"id": "aigent-squad", "object": "model"}]}
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            payload = {}
        streaming = bool(payload.get("stream"))
        _log(self, note=f"stream={streaming} model={payload.get('model')}")

        if not self.path.rstrip("/").endswith("/chat/completions"):
            self.send_response(404)
            self.end_headers()
            return

        if not streaming:
            body = json.dumps(
                {
                    "id": "mock-1",
                    "object": "chat.completion",
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": "pong (non-stream)"},
                            "finish_reason": "stop",
                        }
                    ],
                }
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # Streaming SSE — OpenAI chat.completion.chunk shape.
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        def chunk(delta: dict, finish: str | None = None) -> None:
            data = {
                "id": "mock-1",
                "object": "chat.completion.chunk",
                "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
            }
            self.wfile.write(f"data: {json.dumps(data)}\n\n".encode())
            self.wfile.flush()

        chunk({"role": "assistant"})
        for word in ["Investigating", " your", " system"]:
            chunk({"content": word})
            time.sleep(0.3)
        # Simulated tool-call pause: no content chunks for TOOL_CALL_PAUSE_SECONDS.
        print(f"[mock-aigent] simulating {TOOL_CALL_PAUSE_SECONDS}s tool-call pause", flush=True)
        time.sleep(TOOL_CALL_PAUSE_SECONDS)
        for word in [" —", " done.", " No alerts firing."]:
            chunk({"content": word})
            time.sleep(0.3)
        chunk({}, finish="stop")
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def log_message(self, *_args) -> None:  # silence default noisy logging
        pass


if __name__ == "__main__":
    print("[mock-aigent] listening on :8000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
