# Tasks: Monorepo Foundation (grafana-plugins)

## Task status (real state)

| # | Task | State |
|---|------|-------|
| 1 | Root files (`.gitignore`, `package.json`, `pnpm-workspace.yaml`, `README.md`) | ✅ done |
| 2 | `AGENTS.md` (canonical) + `CLAUDE.md` (pointer) | ✅ done |
| 3 | Foundation spec (`requirements`, `design`, `tasks`) | ✅ done (this document) |
| 4 | `packages/` placeholder | ✅ done |
| 5 | Verify `@grafana/create-plugin` monorepo support (current version, via Docker) | ⏳ pending |
| 6 | First plugin spec (`specs/nodegraph-<variant>/`) | ⏳ pending (awaits layout/interactivity/visual/source decisions) |
| 7 | Scaffold + implement the first plugin | ⏳ pending (depends on #5 and #6) |
| 8 | CI (per-package build/test/lint, ≥90% coverage gate, signing) | ⏳ pending |

## Detail

- [x] Task 1: Create the root workspace skeleton.
- [x] Task 2: Canonical guide + tool-specific pointer.
- [x] Task 3: Document the structural decision with Rationale (Level 3/4).
- [x] Task 4: `packages/` ready to receive plugins.
- [ ] Task 5: Confirm, via Docker, how the current `create-plugin` version places files
      and `.config/` inside a workspace (do not assume a monorepo flag).
- [ ] Task 6: Write the node graph plugin spec after defining: layout, interactivity,
      visual encoding, and concrete data source. (depends on: nothing — just user input)
- [ ] Task 7: Scaffold via create-plugin + implement against the spec, tests by an
      independent author, ≥90% coverage. (depends on: Task 5, Task 6)
- [ ] Task 8: CI pipeline with per-package build/test/lint and coverage gate;
      per-plugin signing process. (depends on: Task 7)

## Promotion triggers (when to evolve the foundation)

- **Create `packages/graph-core`**: when the 2nd plugin of the graph family exists.
- **Create a shared config preset**: when there is real config repetition across ≥3
  plugins, respecting create-plugin's `.config/`.
- **Eject a plugin to its own repo**: when a plugin has its own team/release with a
  conflicting cadence.
