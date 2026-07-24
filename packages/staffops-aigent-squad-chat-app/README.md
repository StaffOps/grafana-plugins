# AIgent Squad Chat

A Grafana **app plugin** that provides a conversational UI to **AIgent Squad** — an
external SRE-agentic system (OpenAI-compatible API, specialist subagents). The plugin is a
**thin chat client**: it streams the conversation and renders it; AIgent Squad owns all
orchestration and tool execution (Grafana / Loki / Tempo / PromQL / Kubernetes) server-side.

## Architecture (Option A)

```
Browser (this plugin, React)                 — no secret, no endpoint in the browser
  │  @grafana/llm streamChatCompletions()      (streams over Grafana Live)
  ▼
Grafana LLM app (grafana-llm-app)             — holds the AIgent Squad URL + token
  │  OpenAI-compatible /v1/chat/completions
  ▼
AIgent Squad (external)                       — subagents + tools (Loki/Tempo/PromQL/K8s)
```

AIgent Squad is configured as a **custom OpenAI-compatible provider** inside the Grafana
LLM app (provider type `openai` with a custom `url`). The plugin never sees the endpoint or
token — they live in the LLM app's `secureJsonData`. See
[`specs/aigent-squad-chat/design.md`](../../specs/aigent-squad-chat/design.md) for the full
rationale (Option A vs a self-contained Go backend) and trade-offs.

## Requirements

- Grafana **13.x**.
- The **Grafana LLM app** (`grafana-llm-app`) installed and enabled, with a provider
  configured to the AIgent Squad endpoint. The UI degrades gracefully (shows a message)
  when the LLM app is missing or unconfigured.
- AIgent Squad must support **both streaming (SSE) and non-streaming** chat completions —
  the LLM app health check (which drives availability) issues a non-streaming request.
- Access is restricted to **Editor** role and above.

## Production configuration

Configure the provider in the Grafana LLM app settings (never in this plugin):

- Provider type: `openai`
- Base URL: the AIgent Squad endpoint (org-internal)
- API key: the AIgent Squad bearer token (stored in `secureJsonData`)

The plugin calls the configured model (default `base`); AIgent Squad ignores the model
field and routes by conversation context.

## Configuration page

The plugin has a **Configuration** tab (Administration → Plugins → AIgent Squad Chat →
Configuration). It exposes UI/behaviour knobs persisted in the plugin's `jsonData` — **no
secrets** (the provider URL/token stay in the Grafana LLM app):

| Setting | Default | Purpose |
|---------|---------|---------|
| Model | `base` | Model slot requested from the LLM app |
| Source tag | `[source:grafana-plugin/aigent-squad-chat]` | Prefix on the latest user message for audit/filtering (empty disables it) |
| Thinking indicator delay (ms) | `3000` | Idle time before the "working…" indicator |
| Max stream idle (ms) | `120000` | Hard timeout if no chunk arrives |
| Expand tool trace by default | `off` | Whether the reasoning panel starts expanded |

These have safe defaults (`src/config.ts`), so the plugin works with no configuration.

> **Request shaping (guardrail compatibility).** The plugin sends **no `system`
> message** — AIgent Squad's Bedrock guardrail treats an injected system prompt as
> untrusted input and blocks it (HTTP 403). The squad has its own system prompt, so the
> plugin only sends the conversation turns, prefixing the latest user message with the
> configurable source tag for auditing/filtering on the squad side.

## Reasoning & tool trace rendering

AIgent Squad wraps its tool-trace / reasoning in a `<think>…</think>` block (the
reasoning-model convention) and emits the final answer after the closing tag:

```
<think>
🧭 Routed to observability (confidence 95%)
🔧 query(query='histogram_quantile(0.95, …)', tenant='0')
📦 ok
…
</think>
The p95 latency for DataPlatform.People in prd is …
```

Rendering that verbatim would dump the whole trace into the answer. Instead the plugin
(`src/llm/reasoning.ts`):

1. **`splitReasoning`** separates the `<think>` block from the answer (handles the
   streaming case where the block is still open, and the no-block case).
2. **`parseTrace`** turns the raw trace into a compact structure:
   - the routing decision (`🧭 Routed to <specialist> (confidence N%)`),
   - one clean entry per tool call (`tool → result`, the verbose query args dropped),
   - a one-line summary, e.g. `observability (95%) · 2× metrics · 25× query`.

The answer renders as sanitized markdown; the trace renders in a **collapsed-by-default**
`<details>` panel (scrollable, monospace) so it never dominates the view. The spinner
(`AIgent Squad is working…`) communicates progress while the squad executes tools.

**Robustness:** any trace line that is *not* a recognized tool/result/route pattern is
preserved as a `note` entry rather than silently dropped. If AIgent Squad starts emitting
free-text reasoning or a new trace format, it still surfaces in the panel — the plugin does
not need a change to keep showing new reasoning content.

## Local development

A self-contained dev stack (Grafana 13.x + the LLM app + a mock AIgent Squad) lives in
[`dev/`](./dev). The mock streams a few tokens, simulates an ~8s tool-call pause, then
finishes — enough to exercise streaming, the "thinking…" indicator, and multi-turn.

```bash
# 1. Build the plugin (dist/ is hot-mounted into Grafana)
docker run --rm -v "$PWD/../..:/w" -w /w/packages/staffops-aigent-squad-chat-app node:22 npm run build

# 2. Start the stack
cd dev && docker compose up -d

# 3. Open http://localhost:3000 (anonymous admin) → nav "AIgent Squad Chat" → send a message
# 4. Stop
docker compose down
```

## Build & test

```bash
# from repo root, via Docker (no local SDKs)
docker run --rm -v "$PWD:/w" -w /w/packages/staffops-aigent-squad-chat-app node:22 npm run build
docker run --rm -v "$PWD:/w" -w /w/packages/staffops-aigent-squad-chat-app node:22 npm run test:ci -- --coverage
```

Coverage gate is ≥90% lines.

## Limitations (v1)

- **Ephemeral conversation** — history is client-only and lost on reload (no server-side
  persistence).
- **No subagent indicator** — showing which specialist is active is deferred to v2 and
  depends on AIgent Squad emitting step metadata in the stream.
- **No MCP client in the plugin** — AIgent Squad owns all tools server-side.
