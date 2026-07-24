# AIgent Squad Chat — Architecture

## Option A: thin client behind the Grafana LLM app

```
Browser (this plugin, React)                 — no secret, no endpoint in the browser
  │  @grafana/llm streamChatCompletions()      (streams over Grafana Live)
  ▼
Grafana LLM app (grafana-llm-app)             — holds the AIgent Squad URL + token
  │  OpenAI-compatible /v1/chat/completions
  ▼
AIgent Squad (external)                       — subagents + tools (Loki/Tempo/PromQL/K8s)
```

AIgent Squad is registered as a **custom OpenAI-compatible provider** inside the Grafana
LLM app (provider type `openai` with a custom `url`). The plugin never sees the endpoint or
token — they live in the LLM app's `secureJsonData`.

### Why Option A (vs a Go backend)

| | Option A — LLM app | Option B — Go backend in the plugin |
|---|---|---|
| Secret handling | LLM app holds it server-side | Plugin backend holds it |
| New moving parts | Reuses an installed app | Adds a Go backend to a frontend-only repo |
| Streaming | `@grafana/llm` over Grafana Live | Custom SSE passthrough |
| Chosen | ✅ | Fallback only |

Option A was validated end-to-end (Grafana 13.0.2 + grafana-llm-app v1.0.8): Bearer auth
forwarded, streaming works over Grafana Live, and long tool-call pauses survive without
timeout.

## Provider URL gotcha

`grafana-llm-app` **appends `/v1/`** to the configured base URL. Configure the provider
URL **without** the `/v1` suffix (e.g. `https://aigent-squad.<domain>`), otherwise requests
hit `/v1/v1/chat/completions` and 404.

## Guardrail compatibility — no system message

AIgent Squad's Bedrock guardrail treats an injected `system` prompt as untrusted input and
**blocks it (HTTP 403)**. The plugin therefore sends **no system message** — the squad has
its own system prompt. Instead, the latest user turn is prefixed with a configurable
**source tag** (`[source:grafana-plugin/aigent-squad-chat]`) for audit/filtering on the
squad side.

!!! note "Root fix on the squad side"
    The squad also strips system messages before the guardrail (so any OpenAI client —
    LibreChat, Continue.dev — works). The plugin's no-system-message behavior is the
    client-side half of that contract.

## Streaming behavior

AIgent Squad **pseudo-streams**: it runs to completion (executing tools), then emits the
answer as a burst of SSE chunks. During the wait the UI shows the *thinking* indicator;
when the burst arrives, `@grafana/llm`'s `accumulateContent()` renders it progressively.
True token-by-token streaming is deferred to a future squad release.

Frontend safety timers:

| Timer | Default | Purpose |
|-------|---------|---------|
| Thinking-idle | 3s | Switch to the "working…" indicator when no chunk arrives. |
| Max stream idle | 120s | Hard error if no chunk of any kind arrives (tool runs can be long). |

Both are adjustable on the [Configuration](configuration.md) page.
