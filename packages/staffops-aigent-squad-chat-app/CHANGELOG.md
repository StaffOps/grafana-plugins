# Changelog

## 1.0.0 (Unreleased)

Initial release of the AIgent Squad Chat plugin — a conversational SRE assistant inside Grafana.

### Added

- **Chat UI** (`ChatPage`, `MessageList`, `MessageBubble`, `ChatInput`, `Conversation`)
  — multi-turn streaming chat with sanitized markdown rendering and auto-scroll.
- **`useChatStream` hook** — streaming via `@grafana/llm` `streamChatCompletions()` over
  Grafana Live; accumulates content, handles abort/error/retry, preserves partial content.
- **`AvailabilityGate`** — checks `llm.enabled()` + `llm.health()` at mount; shows
  actionable fallback UI when the Grafana LLM app is missing or misconfigured.
- **Reasoning & tool trace** (`src/llm/reasoning.ts`):
  - `splitReasoning` — separates `<think>…</think>` block from answer (handles streaming
    mid-block case).
  - `parseTrace` — extracts routing decision, tool calls, results into structured data
    with a one-line summary (e.g. `observability (95%) · 2× metrics · 25× query`).
  - Collapsed-by-default trace panel (monospace, scrollable) so the answer is always
    prominent.
- **Configuration page** (Administration → Plugins → Config): model slot, source tag,
  thinking indicator delay, max stream idle timeout, reasoning-panel default state.
  Persisted in `jsonData` (no secrets).
- **Guardrail compatibility** — no `system` message sent (Bedrock guardrail blocks it);
  source tag prefixed to latest user turn instead.
- **`ConfigContext`** — React context providing plugin settings (model, timeouts, source
  tag) throughout the component tree.
- **Dev stack** (`dev/docker-compose.yaml`) — Grafana 13.x + `grafana-llm-app` + mock
  AIgent Squad (Python SSE server simulating tool-call pauses and multi-turn).
- **E2E stack** (`docker-compose.e2e.yaml`) — same but pointed at the real AIgent Squad
  endpoint (`https://aigent-squad.bdc.app.br`). Token from AWS Secrets Manager
  (`STAFFOPS_AIGENT_SQUAD`), provisioned via env var.
- **Provisioning** — declarative YAML enabling both plugins + configuring the LLM app
  provider (dev: mock on `http://mock-aigent:8000`; e2e: real endpoint).
- **74 tests, 98.9% line coverage** — unit tests for reasoning parser, useChatStream,
  AvailabilityGate, ConfigContext, MessageBubble, MessageList, ChatInput, AppConfig.

### Validated (E2E findings — 2026-07-21)

- LLM app v1.0.8 appends `/v1/` to the configured URL — configure **without** trailing
  `/v1`.
- `Authorization: Bearer` correctly forwarded (secret stays server-side in the LLM app).
- 42s tool-call execution (3 MCP calls: `pods_list`×2, `events_list`) survived without
  timeout — `MAX_STREAM_IDLE_SECONDS=120` provides safe margin.
- Pseudo-streaming confirmed: chunks arrive in burst after completion (known LLM app
  limitation). UI renders progressively from the burst; thinking indicator flashes briefly.
- True token-by-token streaming deferred to v2 (depends on AIgent Squad / LLM app
  evolution).

### Endpoints tested

| Environment | Endpoint | Auth |
|-------------|----------|------|
| **Dev (mock)** | `http://mock-aigent:8000/v1/chat/completions` | `dev-token` (hardcoded in provisioning) |
| **E2E (real)** | `https://aigent-squad.bdc.app.br/v1/chat/completions` | Bearer token from AWS SM `STAFFOPS_AIGENT_SQUAD` → `internal-api-token` |

### Known limitations (v1)

- Ephemeral conversation — history is client-only, lost on reload.
- No subagent indicator (depends on AIgent Squad emitting step metadata in stream).
- Pseudo-streaming only (burst after tool completion, not true token-by-token).
- No MCP client in the plugin — all tools live server-side in AIgent Squad.

### Deferred to v2

- `SubagentIndicator` — once AIgent Squad stream emits active specialist/step.
- True token-by-token streaming.
- Persistent conversation history (server-side).
- Multi-conversation support.
