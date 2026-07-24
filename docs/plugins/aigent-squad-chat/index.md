# AIgent Squad Chat

- **Plugin ID:** `staffops-aigent-squad-chat-app`
- **Type:** app
- **Package:** `packages/staffops-aigent-squad-chat-app`

A Grafana **app plugin** that provides a conversational UI to **AIgent Squad** — an external
SRE-agentic system (OpenAI-compatible API, specialist subagents). The plugin is a **thin
chat client**: it streams the conversation and renders it; AIgent Squad owns all
orchestration and tool execution (Grafana / Loki / Tempo / PromQL / Kubernetes) server-side.

```mermaid
graph LR
    U[User] --> UI[Chat page - React]
    UI -->|@grafana/llm streamChatCompletions| LLM[Grafana LLM app]
    LLM -->|OpenAI /v1/chat/completions| SQUAD[AIgent Squad]
    SQUAD --> TOOLS[(Loki / Tempo / PromQL / K8s)]
```

## Features

| Feature | Description |
|---------|-------------|
| **Streaming chat** | Tokens render as they arrive over Grafana Live. |
| **Thinking indicator** | "AIgent Squad is working…" while a tool runs server-side. |
| **Multi-turn** | Full conversation history is replayed each turn. |
| **Reasoning panel** | The `<think>` tool-trace is parsed into a collapsed panel, separate from the answer. See [Reasoning & Trace](reasoning.md). |
| **Stop / retry** | Cancel an in-flight stream or re-run after an error, preserving partial content. |
| **Availability gate** | Degrades gracefully when the Grafana LLM app is missing/unconfigured. |
| **Configuration page** | Model, source tag, timeouts, reasoning default — no secrets. See [Configuration](configuration.md). |

## Requirements

- Grafana **13.x** (declared `grafanaDependency >= 12.3.0`).
- The **Grafana LLM app** (`grafana-llm-app`) installed and enabled, with a provider
  configured to the AIgent Squad endpoint. It is a declared plugin dependency.
- Access restricted to **Editor** role and above.

## Architecture (Option A)

The provider URL + token live in the Grafana LLM app (`secureJsonData`); the browser never
sees them. See [Architecture](architecture.md) for the full rationale (Option A vs a
self-contained Go backend) and the guardrail-compatibility decision.
