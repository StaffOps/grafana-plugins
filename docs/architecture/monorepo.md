# Monorepo Layout

```
grafana-plugins/
├── AGENTS.md                 # canonical agent guide (read first)
├── CLAUDE.md                 # pointer → AGENTS.md
├── mkdocs.yml                # this documentation site
├── specs/                    # spec-driven docs (requirements/design/tasks) per feature
│   ├── monorepo-foundation/  # structural decision (monorepo) + rationale
│   ├── nodegraph-servicemap/ # service map panel spec
│   └── aigent-squad-chat/    # AIgent Squad chat app spec
├── packages/                 # one directory per plugin
│   ├── staffops-servicemap-panel/
│   └── staffops-aigent-squad-chat-app/
├── pnpm-workspace.yaml        # workspace = packages/*
└── package.json              # recursive scripts (build/test/lint)
```

## Conventions

- **`packages/`** — one directory per plugin. A shared library (e.g. `packages/graph-core`)
  is created **only when a second consumer actually needs it** — no speculative abstraction
  (rule of three).
- **`specs/`** — spec-driven workflow. Every feature gets `requirements.md`, `design.md`,
  and `tasks.md` **before** implementation. Specs are neutral and versioned.
- **Naming** — plugin IDs follow `staffops-<name>-<type>` (e.g. `staffops-servicemap-panel`,
  `staffops-aigent-squad-chat-app`), matching Grafana's `orgName-pluginName-pluginType`
  convention.

## Per-plugin package layout

```
packages/<plugin>/
├── src/
│   ├── plugin.json           # Grafana plugin manifest (id, type, dependencies)
│   ├── module.tsx            # plugin entry point (panel or AppPlugin)
│   └── components/ …         # React components
├── .config/                  # scaffolded webpack/jest/ts config (do not edit directly)
├── provisioning/             # local Grafana provisioning (datasources, apps, dashboards)
├── README.md                 # plugin-specific documentation
├── package.json              # scripts: build / dev / test / test:ci / typecheck / lint / sign
└── tsconfig.json
```
