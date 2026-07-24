# StaffOps Grafana Plugins

Monorepo of **Grafana plugins** (panels and apps) for the StaffOps platform. Each plugin
is a self-contained package under `packages/`, versioned and signed independently. Every
plugin is **frontend-only** (React + TypeScript) — there are no datasource plugins and no
Go backends; plugins consume datasources that already exist or talk to other Grafana apps.

---

## Plugins

| Plugin | Type | What it does |
|--------|------|--------------|
| [**Service Map Panel**](plugins/servicemap-panel/index.md) | `panel` | A DAG service map built from Tempo service-graph metrics — health, animated traffic, cascade filtering, drill-down. |
| [**AIgent Squad Chat**](plugins/aigent-squad-chat/index.md) | `app` | A conversational UI to AIgent Squad (SRE-agentic assistant) — streams answers through the Grafana LLM app. |

## Design principles

| Principle | Consequence |
|-----------|-------------|
| **Frontend-only** | No Go backends; secrets and orchestration live in existing services (LLM app, datasources). |
| **One package per plugin** | Independent versioning, signing, and release per plugin. |
| **No speculative abstraction** | Shared libraries are created only when a second consumer needs them (rule of three). |
| **Docker-only builds** | No local SDKs required — Node 22 + pnpm run inside containers. |
| **Spec-driven** | Each feature has `specs/<feature>/{requirements,design,tasks}.md` before code. |

## Quick links

- [Monorepo layout](architecture/monorepo.md) — how packages, specs, and workspace scripts fit together
- [Build & tooling](architecture/build-tooling.md) — pnpm workspace, webpack, signing
- [Creating a plugin](development/creating-a-plugin.md) — scaffold a new panel or app plugin
- Canonical agent guide: `AGENTS.md` at the repo root
