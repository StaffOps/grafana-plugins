# Tasks: servicemap (node graph panel)

Ordered plan. Nothing past Task 2 starts before the spec review gate passes.

- [ ] Task 1: Verify `@grafana/create-plugin` monorepo placement (via Docker) — how the
      current version lays out files/`.config/` inside `packages/`. (depends on: nothing)
- [ ] Task 2: **Review gate** — user confirms requirements + design. (depends on: spec written)
- [ ] Task 3: Scaffold `packages/servicemap` (Panel, id `staffops-servicemap-panel`) and wire
      into the workspace. (depends on: Task 1, Task 2)
- [ ] Task 4: `docker-compose.yaml` — Grafana + provisioned datasources (Prometheus-compatible
      + trace) reading URLs/auth from a gitignored `.env`; allow-list the unsigned plugin.
      (depends on: Task 3)
- [ ] Task 5: Implement `transform/` (DataFrame[] → GraphModel) — pure functions.
      (depends on: Task 3)
- [ ] Task 6: Implement `layout/` — three modes (force via d3-force, radial, dag), deterministic
      and testable. (depends on: Task 5)
- [ ] Task 7: Implement `components/ServiceMapPanel.tsx` (SVG render, tooltip, edge→trace-DS link)
      + panel options (incl. layout selector). (depends on: Task 5, Task 6)
- [ ] Task 8: Tests by an **independent author** for transform + all layout modes (+ component
      smoke), coverage ≥90% via Docker. (depends on: Task 5, Task 6, Task 7)
- [ ] Task 9: Validate `client/server` ↔ trace `resource.service.name` mapping against the target
      datasource; finalize the drill-down link. (depends on: Task 7)
- [ ] Task 10: End-to-end local validation — one panel per layout renders from real service graph
      metrics; edge click opens the trace datasource Explore. (depends on: Task 4, Task 7, Task 9)
- [ ] Task 11: Plugin README (recommended queries, options, layouts, dev/run via Docker).
      (depends on: Task 10)

## Verification independence

Per repo convention: the `dev` author of Tasks 5–7 does not write their own tests. Task 8
is authored by an independent `dev` session against the contract (requirements + design),
then `code-review` reviews code + tests. Coverage gate ≥90% is enforced.
