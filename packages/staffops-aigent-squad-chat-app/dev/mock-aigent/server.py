"""Mock AIgent Squad — OpenAI-compatible SSE server for the local dev stack.

Lets you SEE the chat streaming without the real AIgent Squad: streams a few tokens,
simulates an 8s tool-call pause (so you can watch the "thinking…" indicator), then
finishes. Stdlib only (python:3.11-slim). Logs forwarded Authorization to stdout.
"""
from __future__ import annotations

import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOOL_CALL_PAUSE_SECONDS = 8


def _log(h: BaseHTTPRequestHandler, note: str = "") -> None:
    print(f"[mock-aigent] {h.command} {h.path} auth={h.headers.get('Authorization', '<none>')} {note}", flush=True)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        _log(self)
        if self.path.rstrip("/").endswith("/models"):
            body = json.dumps({"object": "list", "data": [{"id": "aigent-squad", "object": "model"}]}).encode()
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
        raw = self.rfile.read(length) if length else b"{}"
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

        # Non-streaming path — used by the Grafana LLM app HEALTH CHECK. It expects a plain
        # JSON completion; returning SSE here makes health parsing fail ("invalid character
        # 'd'") and llm.enabled() reports false. So answer JSON when stream is falsy.
        if not streaming:
            body = json.dumps(
                {
                    "id": "mock-1",
                    "object": "chat.completion",
                    "choices": [
                        {"index": 0, "message": {"role": "assistant", "content": "pong"}, "finish_reason": "stop"}
                    ],
                }
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        def chunk(delta: dict, finish=None) -> None:
            data = {
                "id": "mock-1",
                "object": "chat.completion.chunk",
                "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
            }
            self.wfile.write(f"data: {json.dumps(data)}\n\n".encode())
            self.wfile.flush()

        chunk({"role": "assistant"})
        for word in ["Let", " me", " check", " your", " alerts"]:
            chunk({"content": word})
            time.sleep(0.25)
        print(f"[mock-aigent] simulating {TOOL_CALL_PAUSE_SECONDS}s tool-call pause", flush=True)
        time.sleep(TOOL_CALL_PAUSE_SECONDS)
        for word in [" —", " done.", " **No alerts firing.**", " Everything looks healthy."]:
            chunk({"content": word})
            time.sleep(0.25)
        chunk({}, finish="stop")
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def log_message(self, *_args) -> None:
        pass


if __name__ == "__main__":
    print("[mock-aigent] listening on :8000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
