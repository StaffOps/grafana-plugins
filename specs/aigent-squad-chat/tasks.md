# Tasks: AIgent Squad Chat

## Status: **DONE** (2026-07-23)

All v1 tasks complete. 74 tests, 98.9% coverage. Plugin functional end-to-end against
real AIgent Squad (`https://aigent-squad.bdc.app.br`). Only v2 deferrals remain.

**Endpoints validated:**
- Dev mock: `http://mock-aigent:8000/v1/chat/completions` (local docker-compose)
- E2E real: `https://aigent-squad.bdc.app.br/v1/chat/completions` (EKS, token via AWS SM)

---

OQ-1..OQ-4 resolved in `design.md` (2026-07-16). Option A confirmed viable. Frontend
work (Tasks 2–6, 8–10) can proceed against the OpenAI-compatible contract using a mocked
stream. **End-to-end is blocked** until (a) AIgent Squad `/v1/chat/completions` (SSE) is
live and (b) it is registered as a custom OpenAI-compatible provider in the Grafana LLM app.

- [x] Task 1: Answer OQ-1..OQ-4; freeze design (review gate).
- [x] Task 1.5: **Validate the LLM app custom-URL provider** (harness blocker). DONE
      (2026-07-17, local spike `spike/aigent-llm-provider-check/`, Grafana 13.0.2 +
      grafana-llm-app **v1.0.8**). Confirmed: (a) requests forwarded to the custom URL,
      (b) `Authorization: Bearer <token>` forwarded (secret server-side), (c) SSE survives
      an 8s tool-call pause without dropping. **Findings:** the LLM app validates the
      `model` against its abstract names (`base`/`large`) — arbitrary strings are rejected
      (`base` maps to a default like `gpt-4.1-mini`; AIgent Squad must ignore `model`). The
      LLM app enriches chunks (`content_filter_results`, `p` padding). **Residual risk (OPEN):**
      over the **HTTP resource proxy** the response was **buffered** (all chunks at +9.8s,
      not incremental). This path is NOT what `@grafana/llm` uses in the browser (it streams
      over **Grafana Live**). Must verify incremental delivery over Live during Task 3 — if
      Live also buffers for a custom provider, that's a reopen signal toward Option B.
- [x] Task 2: Scaffold app plugin via `@grafana/create-plugin`
      (`--plugin-type=app --org-name=staffops`) into `packages/staffops-aigent-squad-chat`;
      reconcile LICENSE→MIT, drop `packageManager` pin (repo convention). DONE (2026-07-17).
- [x] Task 3: Add `@grafana/llm` + `rxjs`; wire nav page (`PluginPage`). DONE. **Checkpoint
      PASSED (2026-07-18, user-observed in local dev stack):** `streamChatCompletions` over
      **Grafana Live** renders tokens **incrementally** for the custom provider — the ~8s
      tool-call pause shows as the "thinking…" indicator, then streaming resumes. The
      Task 1.5 residual buffering risk (HTTP resource proxy) does NOT affect the Live path.
      Option A fully validated end-to-end; Option B not needed.
- [x] Task 4: `AvailabilityGate` — `llm.enabled()` check + fallback UI. DONE (2026-07-22).
      Implements `llm.enabled()` + `llm.health()` check; shows actionable fallback when
      LLM app is missing/unconfigured. Unit tested (`AvailabilityGate.test.tsx`).
- [x] Task 5: `useChatStream` hook — streaming via `streamChatCompletions` +
      `accumulateContent`; `{messages, send, stop, status, error}`. DONE (2026-07-22).
      Tested with mocked Observable stream (`useChatStream.test.ts`). Handles abort,
      error recovery, and partial-content preservation.
- [x] Task 6: Chat UI — `MessageList`/`MessageBubble` with sanitized markdown +
      input/send/stop. DONE (2026-07-22). Components: `ChatPage`, `Conversation`,
      `MessageList`, `MessageBubble`, `ChatInput`. Tested (`MessageBubble.test.tsx`,
      `MessageList.test.tsx`, `ChatInput.test.tsx`).
- [x] Task 8: Error/abort/retry handling + partial-content preservation. DONE (2026-07-22).
      Integrated into `useChatStream` — abort via `stop()`, error surfaces in UI with
      retry action, partial content preserved on stream interruption.
- [x] Task 9: Tests (independent author) ≥90% coverage; local Grafana 13.x compose smoke
      test. DONE (2026-07-23). 74 tests, 98.9% line coverage. Dev stack
      (`dev/docker-compose.yaml`) with mock-aigent validates end-to-end locally.
- [x] Task 10: Docs — plugin README + note in monorepo AGENTS.md that repo now has an app
      plugin. DONE (2026-07-23). `README.md` comprehensive (architecture, config,
      reasoning UX, local dev, build/test). `AGENTS.md` updated with app plugin reference.
- [x] Task 11 (E2E): register AIgent Squad as LLM app provider; verify live
      streaming end-to-end against the org-internal AIgent Squad endpoint (configured
      out-of-repo, not stored here). DONE (2026-07-21). Findings:
      - LLM app v1.0.8 appends `/v1/` — configure URL **without** `/v1` suffix.
      - `Authorization: Bearer` forwarded correctly (secret stays server-side).
      - 42s tool-call execution (3 MCP calls: pods_list×2, events_list) survived
        without timeout — `MAX_STREAM_IDLE_SECONDS=120` is safe margin.
      - Pseudo-streaming confirmed: chunks arrive in burst after completion (known
        limitation — true token-by-token streaming deferred to spec 06). UI renders
        progressively from the burst; thinking indicator flashes briefly.
      - `docker-compose.e2e.yaml` + provisioning committed for reproducibility.
- [x] Task 12 (guardrail compat): the AIgent Squad Bedrock guardrail blocks any
      `role:"system"` message (HTTP 403). The plugin now sends **no system message** —
      it prefixes the latest user turn with a configurable source tag instead. DONE
      (2026-07-22). Root fix on the squad side (strip system messages before the
      guardrail) is tracked separately in the aigent-squad repo.
- [x] Task 13 (reasoning UX): AIgent Squad wraps its tool-trace in `<think>…</think>`.
      Added `splitReasoning` + `parseTrace` (`src/llm/reasoning.ts`) — the answer renders
      clean; the trace renders in a collapsed-by-default panel as `tool → result` with a
      one-line summary. Unrecognized lines are preserved as notes (never dropped). Fixed
      markdown overflow (code blocks/lists escaping the bubble). DONE (2026-07-22).
- [x] Task 14 (config page + dependency): declared `grafana-llm-app` as a formal
      `plugin.json` dependency; added a Configuration page (Administration → Plugins)
      exposing model, source tag, thinking/idle timeouts, and reasoning-default-open,
      persisted in the plugin's `jsonData` (no secrets — provider stays in the LLM app).
      DONE (2026-07-23). 74 tests, 98.9% line coverage.

## Deferred (v2)

- [ ] Task 7: `SubagentIndicator` — only once AIgent Squad's stream emits active
      specialist/step (contract decision on the AIgent Squad side — see design OQ-2).

## Fallback branch (only if AIgent Squad SSE/auth turns out incompatible with the LLM app)

- [ ] Task 2b: Add Go backend proxy to the app plugin (holds AIgent Squad secret,
      forwards OpenAI-compatible calls). Re-scopes "no Go backend" invariant — requires
      re-review of design Decision 1.
