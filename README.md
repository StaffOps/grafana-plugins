# grafana-plugins

Monorepo of Grafana plugins (panels). Each plugin lives in `packages/` and is
versioned/signed independently. There are no datasource plugins — the panels consume
existing datasources (a Prometheus-compatible metrics source and a trace source such as Tempo).

## Layout

```
grafana-plugins/
├── AGENTS.md          # canonical guide (architecture, build, conventions) — read first
├── specs/             # spec-driven: requirements / design / tasks per feature
│   └── monorepo-foundation/   # structural decision (monorepo) + rationale
├── packages/          # one directory per plugin (empty until the first plugin is created)
├── pnpm-workspace.yaml
└── package.json       # recursive scripts (build/test/lint via workspace)
```

## Quick start

No local SDKs — everything runs through Docker (Node 20 + pnpm). See `AGENTS.md` for
the full commands and the flow to create a new plugin.

## Documentation

- **`AGENTS.md`** — single guide for humans and AI tools (build, test, run, conventions, gotchas).
- **`specs/`** — the what/how/plan for each plugin. Nothing is implemented before the spec.

## License

MIT — free to use, modify, and distribute, provided the copyright notice and license
are kept (attribution). See `LICENSE`.
