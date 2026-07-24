# Feature: AIgent Squad Chat (Grafana app plugin)

A Grafana **app plugin** that provides a conversational interface to **AIgent Squad**
— an external SRE-agentic system (OpenAI-compatible API, multiple specialist subagents).
The plugin renders the conversation naturally (streaming), while AIgent Squad owns the
agent orchestration and tool execution (Grafana / Loki / Tempo / PromQL / Kubernetes)
server-side.

## Architecture decision (locked)

**Option A**: AIgent Squad is configured as a **custom OpenAI-compatible provider**
behind the **Grafana LLM app** (`grafana-llm-app`). The plugin is a **thin chat client**
using `@grafana/llm` (`streamChatCompletions`). Orchestration + tool-calling live inside
AIgent Squad. See `design.md` for rationale (A vs B) and trade-offs.

## User Stories

- WHEN an operator opens the plugin page THEN the system SHALL present a chat interface
  with an input box and a scrollable conversation history.
- WHEN an operator submits a message THEN the system SHALL stream the assistant response
  token-by-token (progressive rendering), not wait for the full response.
- WHEN AIgent Squad routes to a specialist subagent THEN the system SHALL surface which
  subagent/step is active (if the provider emits that signal in the stream/metadata).
- WHEN the LLM app is not installed, not enabled, or has no provider configured THEN the
  system SHALL show an actionable message (link to LLM app config) instead of failing silently.
- WHEN a streaming request errors mid-response THEN the system SHALL show the partial
  content plus an error state with a retry affordance.
- WHEN an operator reloads the page THEN the system SHALL start a fresh conversation
  (no server-side session persistence in v1 — see Out of scope).

## Acceptance Criteria

- [ ] App plugin loads a custom page reachable from Grafana navigation.
- [ ] Chat uses `@grafana/llm` `streamChatCompletions` + `accumulateContent()` for streaming.
- [ ] Availability is checked via `llm.enabled()` before any request; graceful fallback UI otherwise.
- [ ] No AIgent Squad credential is ever present in frontend code or network payloads from
      the browser (secret lives in the LLM app backend provider config).
- [ ] Errors (network, stream abort, provider 4xx/5xx) are handled with visible UI state.
- [ ] Markdown in assistant responses is rendered safely (sanitized).
- [ ] If no content chunk arrives within 3s during streaming, a "thinking…" indicator is shown.
- [ ] The stream survives 30+ seconds of no-content idle (tool execution) without erroring;
      it only errors after `MAX_STREAM_IDLE_SECONDS = 120` of complete idle.
- [ ] The app page requires `role: "Editor"` minimum (`plugin.json` `includes`).
- [ ] ≥90% line coverage; tests authored independently of implementation (repo rule).
- [ ] Works on the target self-hosted Grafana version (see design open question OQ-3).

## Out of scope (v1)

- Server-side conversation persistence / history across reloads.
- The plugin performing its own MCP tool-calling loop (that is Option B — rejected; see design).
- A Go backend inside this plugin (secret handling is delegated to the LLM app provider).
- Multi-user shared conversations, RBAC beyond Grafana's existing page access.
- Configuring AIgent Squad itself (deployment, subagent definitions) — external to this repo.
