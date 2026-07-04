# Design: Monorepo Foundation (grafana-plugins)

## Architecture

Single monorepo (1 git repo) with pnpm workspaces. Each plugin is an isolated package
under `packages/`. Plugins are **frontend-only** (React + TypeScript); no datasource,
no Go backend. Existing datasources provide the data via `DataFrame`.

```
grafana-plugins/                 (1 git repo)
├── AGENTS.md / CLAUDE.md        canonical guide + pointer
├── specs/<feature>/             requirements / design / tasks
├── packages/                    1 dir per plugin (+ shared libs when they earn their existence)
│   └── <plugin>/                own plugin.json, version, signature
├── pnpm-workspace.yaml          packages/*
└── package.json                 recursive scripts (build/test/lint)
```

## Components

| Component | Responsibility |
|-----------|----------------|
| Root `package.json` | Orchestrates recursive scripts (`pnpm -r`), defines engines (Node ≥20) |
| `pnpm-workspace.yaml` | Declares `packages/*` as workspace members |
| `packages/<plugin>` | An isolated panel plugin; `.config/` managed by `@grafana/create-plugin` |
| `specs/` | Spec-driven source; no code before the spec |
| `AGENTS.md` | Single guide (build/test/run, conventions, gotchas) |

## Rationale (decisions and trade-offs)

### Decision 1: Monorepo instead of one repo per plugin

**Choice**: all plugins live in a single repository with pnpm workspaces.

**Justification, strongest first**:
1. **Marginal cost of adding a plugin ≈ zero** — a new package under `packages/`
   inherits build/lint/test/CI. Since the collection will grow unpredictably (topics
   still undefined), this property is the biggest win.
2. **Single toolchain and config** — one lint, one formatter, one test runner, one
   pipeline. No build divergence across plugins.
3. **DX** — clone 1 repo, install once, everything builds. Trivial onboarding.

**Accepted trade-offs**:
| Cost | Reality |
|------|---------|
| Each plugin needs its own version/signature | pnpm workspaces versions per-package; signing runs per-package in the pipeline |
| CI must build only what changed | `pnpm --filter` + path filters handle it |
| Repo may "bloat" with heterogeneous plugins | Ejecting to its own repo is possible via `git filter-repo`/subtree, preserving history |

**When this decision would be wrong** (signals to reopen):
- A plugin becomes a serious product with its own team/release and conflicting cadence → eject to polyrepo.
- Plugins start being maintained by different teams with no code overlap.

**Alternatives considered and rejected**:
- **One repo per plugin (polyrepo)** — rejected now: multiplies tooling/CI and makes
  cross-plugin change costly; with no shared code at the start, the isolation benefit
  does not outweigh the overhead.
- **A single App plugin nesting panels** — rejected: couples release/installation of
  visualizations that should be independent (à la carte). An App plugin only makes
  sense if one day we want an *experience* with its own pages/config.

### Decision 2: No shared library at the start (rule of three)

**Choice**: `packages/` starts without `graph-core` or a shared config package.

**Justification, strongest first**:
1. With a single plugin, **there is no repetition** to extract — abstracting now would
   be speculation, and the wrong abstraction is more expensive than duplication.
2. Heterogeneous plugins (node graph vs. future panels) share little domain; forcing a
   `shared` package creates coupling with no value.
3. `@grafana/create-plugin` already ships a per-plugin `.config/`; a root config would
   compete with the model the tool manages/updates.

**Accepted trade-offs**:
| Cost | Reality |
|------|---------|
| Some config duplication across plugins | Acceptable until the 3rd repetition; cheap to reconcile later |

**When to reopen**: when the **2nd plugin of the graph family** appears, extract
`packages/graph-core` (layout engine + nodes/edges `DataFrame` adapter). When real
config repetition appears, create a shared preset respecting create-plugin's `.config/`.

### Decision 3: Frontend-only, reusing the native node graph data contract

**Choice**: no datasource plugin; the node graph reuses Grafana's native frame
convention (nodes/edges).

**Justification, strongest first**:
1. The user will only **consume** existing datasources — a datasource plugin would be dead scope.
2. Reusing the native contract (fields `id`, `source`, `target`, `mainstat`, …) keeps
   immediate compatibility with sources that already emit that format (e.g. Tempo service graph).
3. No Go backend → far simpler build/deploy/security (React/TS only).

**Accepted trade-offs**:
| Cost | Reality |
|------|---------|
| Tied to the native node graph frame format | It is a stable, widely emitted format; the compat gain outweighs the rigidity |

**When to reopen**: if a plugin needs a data contract the native format cannot express,
a dedicated contract is defined in that plugin's spec.

## Invariants

- No plugin code is written before its spec in `specs/<plugin>/`.
- `AGENTS.md` is the single source of guidance; tool-specific files are pointers.
- Version is per-plugin; there is no global monorepo version.
- Every build/test runs via Docker (no local SDK).

## External dependencies

| Service/Tool | Purpose |
|--------------|---------|
| `@grafana/create-plugin` | Scaffold and tooling (`.config/`) for each panel plugin |
| Docker `node:20` + pnpm (corepack) | Build/test/lint without a local SDK |
| Existing datasources (Prometheus-compatible metrics + a trace source, e.g. Tempo) | Data source for the panels (via DataFrame) |
