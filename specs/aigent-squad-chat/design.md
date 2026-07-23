# Design: AIgent Squad Chat

## Architecture

```
┌─────────────────────────────────────────────┐
│ Browser (Grafana app plugin page, React)     │
│  - Chat UI (history + input + streaming view) │
│  - @grafana/llm: streamChatCompletions()      │
└───────────────┬───────────────────────────────┘
                │  (in-Grafana, authenticated, no secret in browser)
                ▼
┌─────────────────────────────────────────────┐
│ Grafana LLM app (grafana-llm-app) backend     │
│  - provider = AIgent Squad (OpenAI-compatible)│
│  - holds the AIgent Squad credential          │
│  - proxies + streams chat completions         │
└───────────────┬───────────────────────────────┘
                │  OpenAI-compatible /v1/chat/completions (SSE)
                ▼
┌─────────────────────────────────────────────┐
│ AIgent Squad (external, SRE-agentic)          │
│  - orchestrates specialist subagents          │
│  - executes tools server-side:                │
│    Grafana / Loki / Tempo / PromQL / K8s      │
└─────────────────────────────────────────────┘
```

## Components

| Component | Responsibility |
|-----------|----------------|
| App plugin `module.ts` | Register the app + its route/page in Grafana nav |
| `ChatPage` (React) | Layout: history pane + input + send/stop controls |
| `useChatStream` hook | Wrap `llm.enabled()` + `streamChatCompletions()` + `accumulateContent()`; expose `{messages, send, stop, status, error}` |
| `MessageList` / `MessageBubble` | Render user/assistant/tool turns; sanitized markdown |
| `SubagentIndicator` | Show active specialist/step **iff** the provider emits it (metadata/stream marker) |
| `AvailabilityGate` | Render fallback UI when `llm.enabled()` is false |

No Go backend in this plugin. No MCP client in the frontend (Option A).

## Data flow (one turn)

1. `AvailabilityGate` calls `llm.enabled()` on mount; blocks UI if false.
2. User submits text → append `{role:'user'}` to local `messages`.
3. `send()` calls `llm.streamChatCompletions({ model, messages })`, pipes through
   `llm.accumulateContent()`.
4. Observable `next` updates the in-progress assistant bubble; `complete` finalizes it;
   `error` finalizes partial + shows retry.
5. Conversation state is **client-only** (React state), lost on reload (v1).

### Multi-turn accumulation

After each assistant stream `complete`s, the finalized content is appended to `messages`
as `{role:'assistant', content:'<accumulated>'}`. The next user submission sends the
**full** interleaved array (user + assistant). AIgent Squad is stateless per-request and
reconstructs conversation context from that array — there is no server-side session.

### Agentic streaming behavior (tool-call pauses)

AIgent Squad executes tools server-side. During tool execution the SSE stream emits
chunks with `delta.tool_calls` and **no `delta.content`**, so `accumulateContent()`
receives nothing and pauses of 5–120s are normal.

v1 handling:
- Show a pulsing **"thinking…"** indicator when no content chunk arrives within **3s**.
- Do **not** error until **`MAX_STREAM_IDLE_SECONDS = 120`** of complete idle (no chunk
  of any kind).
- `stop` unsubscribes the Observable (local cancel; backend may drain server-side).
- If the stream terminates with `finish_reason: "tool_calls"`, treat it as normal
  completion — AIgent Squad handles the tool loop internally / the LLM app keeps the
  connection open. **Exact behavior must be verified in Task 1.5 / Task 11.**

## Rationale (decisions and trade-offs)

### Decision 1: AIgent Squad as provider behind the LLM app (Option A), not direct-from-frontend or plugin-side MCP (Option B)

**Choice**: The plugin talks only to `@grafana/llm`; AIgent Squad is a custom
OpenAI-compatible provider configured in the Grafana LLM app; orchestration + tool
execution stay inside AIgent Squad.

**Justification, strongest first**:
1. **Secret containment.** An app plugin page is browser-side React. Calling AIgent
   Squad directly would expose its token and hit CORS. Routing through the LLM app
   backend keeps the credential server-side (12-factor: secret via envFile/provider
   config, never inline/frontend).
2. **No duplicated orchestration.** AIgent Squad already has specialist subagents with
   access to Grafana/Loki/Tempo/PromQL/K8s. Making the plugin run its own MCP tool-call
   loop (Option B) would split responsibility and risk double tool-calling.
3. **Reuse of solved plumbing.** Streaming, auth, retries, and provider abstraction are
   already implemented by the LLM app — the plugin stays thin.
4. **Repo alignment.** The monorepo is frontend-only, no Go backend (`AGENTS.md`).
   Option A avoids introducing a backend just to proxy secrets.

**Trade-offs accepted**:
| Cost | Reality |
|------|---------|
| Hard dependency on `grafana-llm-app` being installed + configured | It is the sanctioned path for LLM access in Grafana; availability is gated in UI |
| Plugin cannot call Grafana-native MCP tools itself | Not needed — AIgent Squad owns tools. Revisit only if a Grafana-only tool is required |
| Subagent/step visibility depends on what the provider streams | Degrade gracefully: hide the indicator if no signal |

**When this decision would be wrong (reopen signals)**:
- AIgent Squad cannot be fronted by the LLM app (e.g. non-conforming SSE, custom auth
  the LLM app can't express) → fall back to an app-plugin **Go backend proxy**.
- We need the plugin to invoke Grafana-native MCP tools independently of AIgent Squad
  → adopt Option B partially (MCP client in-plugin).

**Re-examination (2026-07-17):** the A-vs-B fork was re-opened. Deciding fact: the
`grafana-llm-app` is **already running in production** in the target environment, so
Option A adds no new operational footprint (no plugin rollout, no Go backend, no re-scope
of the frontend-only repo). Option B's advantage (self-contained, avoids deploying the
LLM app) does not apply when the LLM app is already deployed. **Option A confirmed.** The
only residual risk — the LLM app proxy's behavior with AIgent Squad's agentic SSE
(tool-call pauses, `finish_reason: tool_calls`) — is what Task 1.5 validates empirically,
locally. Custom OpenAI-compatible provider is supported by grafana-llm-app ≥ 0.10.0.

### Provider mechanism (how Option A works technically)

The Grafana LLM app has **no "custom" provider type**. Option A is implemented with the
**`openai` provider** pointed at a non-default URL:

- Provider type: `openai`
- `jsonData` → OpenAI base URL = the AIgent Squad endpoint (org-internal, set at deploy
  time, not stored in this repo)
- `secureJsonData` → the AIgent Squad bearer token (server-side only, never in frontend)
- `streamChatCompletions` uses `llm.Model.BASE`; AIgent Squad MUST accept any model
  string and route internally (routing is by conversation context, not model name)

**Security note (defense-in-depth):** the endpoint URL in `jsonData` **is** visible to
authenticated Grafana users; the token in `secureJsonData` is **not**. This is acceptable
— a URL without the token grants zero access. This mechanism must be validated empirically
before scaffolding (see tasks Task 1.5).

**Health-check contract (discovered 2026-07-18).** The LLM app health check — which drives
`llm.enabled()` (the AvailabilityGate) — issues a **non-streaming** chat completion to the
`base` and `large` models and parses the response as plain JSON. Therefore **AIgent Squad
MUST support non-streaming completions** (JSON body) in addition to streaming SSE; if it
only streams, health parsing fails ("invalid character 'd'…", i.e. it received `data:` SSE)
and the plugin shows "AIgent Squad is not available" even though streaming chat works. This
is a required contract item for Task 11 (real endpoint).

### Decision 2: App plugin (custom page), not a panel plugin

**Choice**: `--plugin-type=app` with a `PluginPage`, not a panel.

**Justification**: A conversational full-page UX with routing and its own state is an app
concern; panels are constrained to dashboard cells and the `DataFrame` contract. This is
the repo's first app plugin (all existing ones are panels) — new but supported by
`@grafana/create-plugin`.

**Trade-off**: introduces an app-plugin pattern (nav registration, page routing) not yet
present in the repo. Acceptable; it's the correct plugin type for the use case.

## Invariants

- No AIgent Squad secret in frontend bundle or browser network calls.
- Every LLM call is preceded by an `llm.enabled()` check.
- Assistant markdown is always sanitized before render (XSS).
- Conversation state is ephemeral in v1 (documented, not a bug).
- The app nav page requires **`role: "Editor"`** minimum in `plugin.json` `includes`
  (Viewers must not reach AIgent Squad tools via chat).
- AIgent Squad-side contract: SSE responses MUST NOT echo internal hostnames, tokens, or
  credentials in error messages.

## External dependencies

| Service | Purpose |
|---------|---------|
| `grafana-llm-app` (≥ 0.22 if MCP later) | LLM proxy/stream + provider abstraction |
| AIgent Squad | The agent backend (OpenAI-compatible) |
| `@grafana/llm`, `@grafana/ui`, `@grafana/runtime`, `rxjs` | Frontend libs |

## Open questions — resolved (2026-07-16)

- **OQ-1 — AIgent Squad exposure & auth.** RESOLVED (partial). The AIgent Squad endpoint
  (org-internal; **not stored in this repo** — provided at deploy time via the Grafana LLM
  app provider config / env, never committed). A probe of its `/v1/models` returned **401**
  (host resolves, TLS ok, OpenAI-style `/v1/*` path layout present, auth-gated → bearer
  assumed). The `/v1/chat/completions` (streaming) is **not implemented yet but planned**.
  Option A is viable. **Remaining to confirm when built:** SSE streaming conformance +
  exact auth header the LLM app must send. Until then, end-to-end is blocked (see tasks).
- **OQ-2 — Subagent visibility.** DEFERRED. Cannot be verified (chat endpoint not built).
  This is a **contract decision on the AIgent Squad side**: to show the active
  specialist/step, AIgent Squad must emit it in the stream (step delta or metadata field).
  `SubagentIndicator` is **v2 / optional**, gated on that contract existing.
- **OQ-3 — Target Grafana.** RESOLVED: **Grafana 13.x** (self-hosted). Aligns with the
  `@grafana/*` 13.x packages already in the workspace. LLM app ≥ 0.22 only relevant if MCP
  is added later (not in v1).
- **OQ-4 — K8s / all tools.** RESOLVED: **all MCPs (Grafana/Loki/Tempo/PromQL/K8s) run
  server-side inside AIgent Squad.** Confirms the plugin needs no MCP client (Option A clean).
