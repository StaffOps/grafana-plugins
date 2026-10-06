# grafana-plugins

Monorepo of Grafana plugins (panels and apps). Each plugin lives in `packages/` and is
versioned/signed independently. There are no datasource plugins and no Go backend — every
plugin is frontend-only (React + TypeScript).

## Plugins

| Plugin | Type | Status | Description |
|--------|------|--------|-------------|
| [`staffops-servicemap-panel`](packages/staffops-servicemap-panel/) | Panel | v0.2.0 | Service map DAG (health, animated traffic, cascade filters, drill) |
| [`staffops-aigent-squad-chat-app`](packages/staffops-aigent-squad-chat-app/) | App | v1.0.0 (unreleased) | Conversational SRE assistant — chat UI for AIgent Squad via Grafana LLM app |

## Layout

```
grafana-plugins/
├── AGENTS.md          # canonical guide (architecture, build, conventions) — read first
├── specs/             # spec-driven: requirements / design / tasks per feature
│   ├── monorepo-foundation/
│   ├── nodegraph-servicemap/
│   └── aigent-squad-chat/
├── packages/          # one directory per plugin
│   ├── staffops-servicemap-panel/
│   └── staffops-aigent-squad-chat-app/
├── docs/              # MkDocs site (GitHub Pages)
├── pnpm-workspace.yaml
└── package.json       # recursive scripts (build/test/lint via workspace)
```

## Quick start

No local SDKs — everything runs through Docker (Node 22 + pnpm). See `AGENTS.md` for
the full commands and the flow to create a new plugin.

### Service Map Panel (local Grafana with real datasources)

```bash
cd packages/staffops-servicemap-panel
cp .env.example .env   # fill METRICS_URL and TEMPO_URL
docker run --rm -v "$(pwd)/../..:/w" -w /w/packages/staffops-servicemap-panel node:22 npm run build
docker compose up -d
# http://localhost:3000 — provisioned dashboard
```

### AIgent Squad Chat (local Grafana with mock backend)

```bash
# Build the plugin
docker run --rm -v "$(pwd):/w" -w /w/packages/staffops-aigent-squad-chat-app node:22 npm run build

# Start Grafana + mock AIgent Squad
cd packages/staffops-aigent-squad-chat-app/dev
docker compose up -d
# http://localhost:3000 → nav "AIgent Squad Chat" → send a message
```

### AIgent Squad Chat (E2E against real AIgent Squad on EKS)

```bash
# Get the token from AWS Secrets Manager
export AIGENT_SQUAD_TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id STAFFOPS_AIGENT_SQUAD --query SecretString --output text \
  --region us-east-1 | python3 -c "import json,sys; print(json.load(sys.stdin)['internal-api-token'])")

cd packages/staffops-aigent-squad-chat-app
docker compose -f docker-compose.e2e.yaml up -d
# http://localhost:3000 → real streaming conversation with AIgent Squad
```

**E2E endpoint**: `https://aigent-squad.bdc.app.br` (EKS, OpenAI-compatible /v1/chat/completions)

## Documentation

- **`AGENTS.md`** — single guide for humans and AI tools (build, test, run, conventions, gotchas).
- **`specs/`** — the what/how/plan for each plugin. Nothing is implemented before the spec.

## License

MIT — free to use, modify, and distribute, provided the copyright notice and license
are kept (attribution). See `LICENSE`.
