# AIgent Squad Chat — Configuration

There are **two** places to configure, with a clean separation of concerns:

1. **Provider (secret) → the Grafana LLM app.** URL + token, never in this plugin.
2. **Behaviour knobs → this plugin's Configuration page.** No secrets.

## 1. Provider — in the Grafana LLM app

Configure AIgent Squad as a custom OpenAI-compatible provider in the LLM app settings
(`secureJsonData`), or via provisioning:

```yaml
apiVersion: 1
apps:
  - type: grafana-llm-app
    org_id: 1
    disabled: false
    jsonData:
      openAI:
        provider: openai
        url: https://aigent-squad.<domain>   # NO /v1 suffix — the app appends it
    secureJsonData:
      openAIKey: $__env{AIGENT_SQUAD_TOKEN}

  - type: staffops-aigent-squad-chat-app
    org_id: 1
    disabled: false
```

## 2. Plugin behaviour — Configuration page

**Administration → Plugins → AIgent Squad Chat → Configuration.** Persisted in the plugin's
`jsonData` (no secrets):

| Setting | Default | Purpose |
|---------|---------|---------|
| **Model** | `base` | Model slot requested from the LLM app (the squad routes by context). |
| **Source tag** | `[source:grafana-plugin/aigent-squad-chat]` | Prefix on the latest user message for audit/filtering. Empty disables it. |
| **Thinking indicator delay (ms)** | `3000` | Idle time before the "working…" indicator. |
| **Max stream idle (ms)** | `120000` | Hard timeout if no chunk arrives. |
| **Expand tool trace by default** | `off` | Whether the reasoning panel starts expanded. |

Defaults live in `src/config.ts`, so the plugin works with **no configuration**.

## Local end-to-end stack

The package ships a `docker-compose.e2e.yaml` (Grafana 13.x + `grafana-llm-app` + the
built plugin) plus provisioning. Provide the token via env:

```bash
export AIGENT_SQUAD_TOKEN=<token>     # e.g. from your secret store
docker compose -f docker-compose.e2e.yaml up -d
# open http://localhost:3000 → AIgent Squad Chat
```
