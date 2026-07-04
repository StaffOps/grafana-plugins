# Requirements: Monorepo Foundation (grafana-plugins)

## Context

We will create multiple Grafana plugins over time — starting with a new **node graph**
plugin, and later other panels (topics still undefined). There will be no datasource
plugins; the panels consume existing datasources. This spec defines **how the
repository is structured** to support that growing collection.

## User Stories

WHEN I want to add a new plugin THEN the repository SHALL allow creating it as an
isolated package under `packages/`, inheriting shared tooling, without reconfiguring
the build from scratch.

WHEN I build/test the repository THEN the system SHALL run build, test, and lint for
all plugins recursively via a single command (workspace).

WHEN a plugin needs to be distributed THEN it SHALL have its own `plugin.json`, version,
and signature, independent of the other plugins.

WHEN there is no local language SDK THEN every build/test SHALL be runnable via Docker
(`node:20` + pnpm through corepack).

WHEN an AI tool (Kiro or Claude) enters the repo THEN it SHALL find a single canonical
guide (`AGENTS.md`), with tool-specific files being pointers only.

WHEN a new plugin is planned THEN its spec (`specs/<plugin>/`) SHALL exist and be
reviewed BEFORE any code.

## Acceptance Criteria

- [ ] `pnpm-workspace.yaml` defines `packages/*` as the workspace.
- [ ] Root `package.json` exposes recursive scripts (`build`, `test`, `lint`, `typecheck`, `dev`).
- [ ] `.gitignore` excludes `node_modules/`, build artifacts, and AI-tooling directories (`.kiro/`, `.claude/`, `.cursor/`, …).
- [ ] `AGENTS.md` is the single source of guidance; `CLAUDE.md` is a 1-line pointer.
- [ ] `specs/` at the repo root (not in `.kiro/specs`).
- [ ] `packages/` exists and is ready to receive the first plugin (empty for now).
- [ ] Documented build/test commands run via Docker without a local SDK.

## Out of scope

- Implementation of any plugin (including the node graph) — that belongs to their own specs.
- Datasource plugins or Go backends.
- Shared library (`graph-core`) — only born when a second consumer exists.
- CI pipeline and signing process — future spec/task (mentioned, not implemented here).
