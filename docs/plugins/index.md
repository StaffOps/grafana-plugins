# Plugins

Two plugins ship from this monorepo today.

## Service Map Panel

- **ID:** `staffops-servicemap-panel`
- **Type:** `panel`
- A directed service-graph (DAG) visualization built from Tempo service-graph metrics:
  node health, animated traffic particles, cascade filtering, node-kind styling,
  zoom/pan, and drill-down to Explore.

→ [Service Map Panel docs](servicemap-panel/index.md)

## AIgent Squad Chat

- **ID:** `staffops-aigent-squad-chat-app`
- **Type:** `app`
- A conversational UI to **AIgent Squad** (an SRE-agentic assistant). A thin chat client
  that streams OpenAI-compatible responses through the **Grafana LLM app** — no backend of
  its own, no secrets in the browser.

→ [AIgent Squad Chat docs](aigent-squad-chat/index.md)

---

## Choosing panel vs app

| You want to… | Use a… |
|--------------|--------|
| Add a visualization to dashboards, driven by datasource queries | **Panel plugin** |
| Add a custom page / whole experience with its own navigation | **App plugin** |
